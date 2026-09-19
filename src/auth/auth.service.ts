import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { TotpService } from './services/totp.service';
import { assertReauthenticated } from './reauth';
import { assertAdult } from '../common/age';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ulid } from 'ulid';

import type { AppConfig } from '../config/configuration';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Keys } from '../dynamodb/keys';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import {
  emailChangeCodeEmail,
  emailChangedNoticeEmail,
  passwordResetEmail,
} from '../email/email.templates';
import type { UserRecord } from '../users/entities/user.entity';
import { toPublic } from '../users/entities/user.entity';

import { AppleOAuthService } from './services/apple-oauth.service';
import { CpfValidatorService } from './services/cpf-validator.service';
import {
  GoogleOAuthService,
  type GooglePlatform,
} from './services/google-oauth.service';
import { TwilioVerifyService } from './services/twilio-verify.service';

import type {
  JwtPayload,
  RefreshTokenPayload,
} from './types/jwt-payload.type';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: ReturnType<typeof toPublic>;
}

export interface TotpChallenge {
  totpRequired: true;
  tempToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly google: GoogleOAuthService,
    private readonly apple: AppleOAuthService,
    private readonly twilio: TwilioVerifyService,
    private readonly cpf: CpfValidatorService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly totp: TotpService,
    private readonly db: DynamoDbService,
    private readonly email: EmailService,
  ) {}

  private revokedJtiPk(jti: string) { return `REVOKED_JTI#${jti}`; }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get('jwt.refreshSecret', { infer: true }),
      });
      // Store revoked JTI in DynamoDB — TTL matches token expiry (30 days default)
      const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      await this.db.put({
        PK:         this.revokedJtiPk(payload.jti),
        SK:         'METADATA',
        entityType: 'RevokedJti',
        jti:        payload.jti,
        userId:     payload.sub,
        revokedAt:  new Date().toISOString(),
        ttl,
      });
    } catch {
      // Token already invalid or malformed — logout is still successful
    }
  }

  async registerWithEmail(
    displayName: string,
    email: string,
    password: string,
    contactPhone?: string,
    marketingConsent?: boolean,
    birthDate?: string,
  ): Promise<AuthSession> {
    // Checked before anything is created: an under-18 never gets an account.
    const adultBirthDate = birthDate ? assertAdult(birthDate) : undefined;
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.users.create({ displayName, email, passwordHash, contactPhone, marketingConsent, birthDate: adultBirthDate });
    return this.issueSession(user);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    // Always return success to prevent email enumeration
    if (!user || !user.passwordHash) return;

    const code    = String(Math.floor(100000 + Math.random() * 900000));
    const now     = new Date();
    const expires = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const k = Keys.pwdReset(code);
    await this.db.put({
      ...k,
      entityType: 'PwdReset',
      userId:     user.userId,
      email:      email.toLowerCase(),
      expiresAt:  expires,
      createdAt:  now.toISOString(),
    });

    const mail = passwordResetEmail(code);
    const sent = await this.email.send(email, mail.subject, mail.html);

    // Without a provider configured the code would be unrecoverable, so fall
    // back to the log. Never logged once mail is actually working.
    if (!sent.ok) {
      this.logger.warn(`[PwdReset] email not delivered — code=${code} email=${email}`);
    }
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<AuthSession> {
    const k      = Keys.pwdReset(code);
    const record = await this.db.get<{ userId: string; email: string; expiresAt: string }>(k.PK, k.SK);

    if (!record) throw new BadRequestException('Código inválido ou expirado');
    if (record.email !== email.toLowerCase()) throw new BadRequestException('Código inválido ou expirado');
    if (new Date(record.expiresAt) < new Date()) throw new BadRequestException('Código expirado. Solicite um novo.');

    const user = await this.users.findByEmail(email);
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const userKey = Keys.user(user.userId);
    await this.db.update({
      Key: { PK: userKey.PK, SK: userKey.SK },
      UpdateExpression: 'SET passwordHash = :hash, updatedAt = :now',
      ExpressionAttributeValues: { ':hash': passwordHash, ':now': new Date().toISOString() },
    });

    // Delete the used token
    try {
      await this.db.update({
        Key: { PK: k.PK, SK: k.SK },
        UpdateExpression: 'SET used = :t',
        ExpressionAttributeValues: { ':t': true },
      });
    } catch { /* ignore */ }

    const updated = await this.users.findByEmail(email);
    if (!updated) throw new NotFoundException('Usuário não encontrado');
    return this.issueSession(updated);
  }

  async signInWithEmail(email: string, password: string): Promise<AuthSession | TotpChallenge> {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('E-mail ou senha incorretos');

    if (!user.passwordHash) {
      // Account exists but was created via Google/Apple OAuth
      const provider = user.googleSub ? 'Google' : user.appleSub ? 'Apple' : null;
      if (provider) {
        throw new UnauthorizedException(`Esta conta foi criada com ${provider}. Use "Continuar com ${provider}" para entrar.`);
      }
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('E-mail ou senha incorretos');

    return this.issueOrChallenge(user);
  }

  async signInWithGoogle(idToken: string, platform: GooglePlatform): Promise<AuthSession | TotpChallenge> {
    const identity = await this.google.verifyIdToken(idToken, platform);

    const existing = await this.users.findByGoogleSub(identity.sub);
    const user =
      existing ??
      (await this.users.create({
        displayName: identity.name ?? identity.email ?? 'Novo usuário',
        email: identity.emailVerified ? identity.email : undefined,
        googleSub: identity.sub,
      }));

    return this.issueOrChallenge(user);
  }

  async signInWithApple(identityToken: string, fullName: string | undefined): Promise<AuthSession | TotpChallenge> {
    const identity = await this.apple.verifyIdToken(identityToken);

    const existing = await this.users.findByAppleSub(identity.sub);
    const user =
      existing ??
      (await this.users.create({
        displayName: fullName ?? 'Novo usuário',
        email: identity.emailVerified ? identity.email : undefined,
        appleSub: identity.sub,
      }));

    return this.issueOrChallenge(user);
  }

  async totpAuthenticate(tempToken: string, code: string): Promise<AuthSession> {
    let payload: { sub: string; totpPending?: boolean };
    try {
      payload = await this.jwt.verifyAsync(tempToken, {
        secret: this.config.get('jwt.accessSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Token expirado. Faça login novamente.');
    }

    if (!payload.totpPending) throw new UnauthorizedException('Token inválido');

    const user = await this.users.getById(payload.sub);
    if (!user.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException('2FA não configurado');
    }

    if (!this.totp.verify(user.totpSecret, code)) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    return this.issueSession(user);
  }

  // ── E-mail change ───────────────────────────────────────────────────────────
  //
  // 1. start: re-authenticate (password and/or 2FA), check the new address is
  //    free, e-mail a 6-digit code to the NEW address.
  // 2. confirm: the code proves ownership; the profile and the login lookup
  //    switch in one transaction, and the OLD address is told about it.
  //
  // Only a hash of the code is stored, it expires in 15 minutes and allows 5
  // attempts, so it cannot be brute-forced.

  async startEmailChange(
    userId: string,
    input: { newEmail: string; password?: string; totpCode?: string },
  ): Promise<{ sentTo: string }> {
    const user     = await this.users.getById(userId);
    const newEmail = input.newEmail.trim().toLowerCase();

    if (newEmail === user.email?.toLowerCase()) {
      throw new BadRequestException('Este já é o e-mail da sua conta.');
    }

    await assertReauthenticated(user, input);

    const owner = await this.users.findByEmail(newEmail);
    if (owner && owner.userId !== userId) {
      throw new ConflictException('Este e-mail já está cadastrado em outra conta.');
    }

    const k       = Keys.emailChange(userId);
    const pending = await this.db.get<{ sentAt: string }>(k.PK, k.SK);
    if (pending && Date.now() - new Date(pending.sentAt).getTime() < 60_000) {
      throw new BadRequestException('Aguarde 1 minuto para pedir um novo código.');
    }

    const code = String(randomInt(100000, 1000000));
    const now  = new Date();
    await this.db.put({
      ...k,
      entityType: 'EmailChange',
      userId,
      newEmail,
      codeHash:  this.hashCode(userId, code),
      attempts:  0,
      sentAt:    now.toISOString(),
      expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    });

    const mail = emailChangeCodeEmail(code);
    const sent = await this.email.send(newEmail, mail.subject, mail.html);
    if (!sent.ok) {
      throw new BadRequestException('Não foi possível enviar o código para este e-mail. Verifique o endereço.');
    }
    return { sentTo: newEmail };
  }

  async confirmEmailChange(userId: string, code: string): Promise<AuthSession> {
    const k       = Keys.emailChange(userId);
    const pending = await this.db.get<{
      newEmail: string; codeHash: string; attempts: number; expiresAt: string;
    }>(k.PK, k.SK);

    if (!pending) throw new BadRequestException('Nenhuma troca de e-mail pendente. Peça um novo código.');
    if (new Date(pending.expiresAt) < new Date()) {
      throw new BadRequestException('Código expirado. Peça um novo código.');
    }
    if (pending.attempts >= 5) {
      throw new BadRequestException('Muitas tentativas. Peça um novo código.');
    }

    const expected = Buffer.from(pending.codeHash, 'hex');
    const given    = Buffer.from(this.hashCode(userId, code), 'hex');
    if (!timingSafeEqual(expected, given)) {
      await this.db.update({
        Key: { PK: k.PK, SK: k.SK },
        UpdateExpression: 'SET attempts = attempts + :one',
        ExpressionAttributeValues: { ':one': 1 },
      });
      throw new BadRequestException('Código incorreto.');
    }

    const user     = await this.users.getById(userId);
    const oldEmail = user.email;
    const newEmail = pending.newEmail;
    const now      = new Date().toISOString();
    const newLookup = Keys.lookupEmail(newEmail);

    const items: Parameters<typeof this.db.transactWrite>[0] = [
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: user.PK, SK: user.SK },
          UpdateExpression: 'SET email = :e, updatedAt = :now',
          ExpressionAttributeValues: { ':e': newEmail, ':now': now },
        },
      },
      {
        // Fails if another account took the address since the code was sent.
        Put: {
          TableName: this.db.tableName,
          Item: { ...newLookup, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      { Delete: { TableName: this.db.tableName, Key: { PK: k.PK, SK: k.SK } } },
    ];
    if (oldEmail && oldEmail.toLowerCase() !== newEmail) {
      const oldLookup = Keys.lookupEmail(oldEmail);
      items.push({
        // Only ever remove our own lookup row.
        Delete: {
          TableName: this.db.tableName,
          Key: { PK: oldLookup.PK, SK: oldLookup.SK },
          ConditionExpression: 'attribute_not_exists(PK) OR userId = :uid',
          ExpressionAttributeValues: { ':uid': userId },
        },
      });
    }

    try {
      await this.db.transactWrite(items);
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      if (name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException') {
        throw new ConflictException('Este e-mail já está cadastrado em outra conta.');
      }
      throw err;
    }

    if (oldEmail) {
      const notice = emailChangedNoticeEmail(this.maskEmail(newEmail));
      void this.email.send(oldEmail, notice.subject, notice.html);
    }
    this.logger.log(`E-mail changed for user ${userId}`);

    return this.issueSession(await this.users.getById(userId));
  }

  private hashCode(userId: string, code: string): string {
    return createHash('sha256').update(`${userId}:${code}`).digest('hex');
  }

  /** "eduardo.cruz@gmail.com" → "ed*********@gmail.com" */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
  }

  async startPhoneVerification(userId: string, phoneE164: string): Promise<void> {
    // Reject phones that are already attached to a different account.
    const existing = await this.users.findByPhone(phoneE164);
    if (existing && existing.userId !== userId) {
      throw new BadRequestException('Phone number is in use');
    }
    await this.twilio.startVerification(phoneE164);
  }

  async verifyPhone(userId: string, phoneE164: string, code: string): Promise<AuthSession> {
    const ok = await this.twilio.checkCode(phoneE164, code);
    if (!ok) throw new UnauthorizedException('Invalid or expired code');

    await this.users.attachPhone(userId, phoneE164);
    const user = await this.users.getById(userId);
    return this.issueSession(user);
  }

  async verifyCpf(userId: string, rawCpf: string): Promise<AuthSession> {
    const digits = this.cpf.stripPunctuation(rawCpf);
    if (!this.cpf.isValid(digits)) {
      throw new BadRequestException('CPF inválido');
    }

    // Reject CPFs already attached to another user — unique by definition.
    const owner = await this.users.findByCpf(digits);
    if (owner && owner.userId !== userId) {
      throw new BadRequestException('CPF já cadastrado em outra conta');
    }

    await this.users.attachCpf(userId, digits);
    const user = await this.users.getById(userId);
    return this.issueSession(user);
  }

  async recordLgpdConsent(userId: string, accepted: boolean, version: string): Promise<AuthSession> {
    if (!accepted) throw new BadRequestException('LGPD consent is required to use the app');
    const expected = this.config.get('lgpd.consentVersion', { infer: true });
    if (version !== expected) {
      throw new BadRequestException(
        `LGPD consent version mismatch (expected ${expected}, got ${version})`,
      );
    }
    await this.users.recordLgpdConsent(userId, version);
    const user = await this.users.getById(userId);
    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get('jwt.refreshSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Check if this JTI has been revoked (user logged out)
    const revoked = await this.db.get(this.revokedJtiPk(payload.jti), 'METADATA');
    if (revoked) throw new UnauthorizedException('Token revogado. Faça login novamente.');

    const user = await this.users.getById(payload.sub);
    return this.issueSession(user);
  }

  /** Looks up the LGPD prompt the mobile client should display. */
  getLgpdPrompt(): { version: string; privacyPolicyUrl: string } {
    return {
      version: this.config.get('lgpd.consentVersion', { infer: true }),
      privacyPolicyUrl: this.config.get('lgpd.privacyPolicyUrl', { infer: true }),
    };
  }

  // ── private ────────────────────────────────────────────────────────────────

  private async issueOrChallenge(user: UserRecord): Promise<AuthSession | TotpChallenge> {
    if (user.totpEnabled && user.totpSecret) {
      const tempToken = await this.jwt.signAsync(
        { sub: user.userId, totpPending: true },
        {
          secret:    this.config.get('jwt.accessSecret', { infer: true }),
          expiresIn: '10m', // long enough to find/open the authenticator app
        },
      );
      return { totpRequired: true, tempToken };
    }
    return this.issueSession(user);
  }

  private async issueSession(user: UserRecord): Promise<AuthSession> {
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    const lgpdAccepted =
      user.lgpdConsentVersion ===
      this.config.get('lgpd.consentVersion', { infer: true });

    const accessPayload: JwtPayload = {
      sub: user.userId,
      phoneVerified: Boolean(user.phoneE164),
      cpfVerified: Boolean(user.cpf),
      lgpdAccepted,
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.userId,
      jti: ulid(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.get('jwt.accessSecret', { infer: true }),
        expiresIn: this.config.get('jwt.accessTtl', { infer: true }),
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get('jwt.refreshSecret', { infer: true }),
        expiresIn: this.config.get('jwt.refreshTtl', { infer: true }),
      }),
    ]);

    return { accessToken, refreshToken, user: toPublic(user) };
  }
}

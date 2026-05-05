import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TotpService } from './services/totp.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ulid } from 'ulid';

import type { AppConfig } from '../config/configuration';
import { UsersService } from '../users/users.service';
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
  ) {}

  async registerWithEmail(displayName: string, email: string, password: string): Promise<AuthSession> {
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.users.create({ displayName, email, passwordHash });
    return this.issueSession(user);
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
          expiresIn: '5m',
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

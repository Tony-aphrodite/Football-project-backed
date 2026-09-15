import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ulid } from 'ulid';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { EmailService } from '../email/email.service';
import { bankChangedNoticeEmail, welcomeEmail } from '../email/email.templates';
import { assertReauthenticated } from '../auth/reauth';
import { Keys } from '../dynamodb/keys';
import { toPublic, type UserRecord, type UserPublic } from './entities/user.entity';

interface CreateUserInput {
  displayName: string;
  email?: string;
  googleSub?: string;
  appleSub?: string;
  passwordHash?: string;
  contactPhone?: string;
  marketingConsent?: boolean;
}

/** Withdrawals pause this long after a bank account change. */
const BANK_CHANGE_HOLD_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly db: DynamoDbService,
    private readonly email: EmailService,
  ) {}

  async findById(userId: string): Promise<UserRecord | undefined> {
    const k = Keys.user(userId);
    return this.db.get<UserRecord>(k.PK, k.SK);
  }

  async getById(userId: string): Promise<UserRecord> {
    const u = await this.findById(userId);
    if (!u) throw new NotFoundException(`User ${userId} not found`);
    return u;
  }

  /**
   * Resolve a user from one of the lookup rows. Returns undefined if no user
   * has registered with that identifier yet.
   */
  async findByGoogleSub(sub: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupGoogle(sub).PK);
  }

  async findByAppleSub(sub: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupApple(sub).PK);
  }

  async findByPhone(e164: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupPhone(e164).PK);
  }

  async findByCpf(cpf: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupCpf(cpf).PK);
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupEmail(email.toLowerCase()).PK);
  }

  /**
   * Atomically create the user profile and one lookup row per provided
   * identifier. If any identifier is already taken, the entire transaction
   * rolls back and we surface a 409.
   */
  async create(input: CreateUserInput): Promise<UserRecord> {
    const now = new Date().toISOString();
    const userId = ulid();

    const profile: UserRecord = {
      ...Keys.user(userId),
      entityType: 'User',
      userId,
      displayName: input.displayName,
      email: input.email,
      googleSub: input.googleSub,
      appleSub: input.appleSub,
      passwordHash: input.passwordHash,
      contactPhone: input.contactPhone,
      marketingConsent: input.marketingConsent,
      ratingCountAsSeller: 0,
      ratingCountAsBuyer: 0,
      listingsActiveCount: 0,
      mpcPurchasesCount: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    const transactItems: Parameters<typeof this.db.transactWrite>[0] = [
      {
        Put: {
          TableName: this.db.tableName,
          Item: profile as unknown as Record<string, unknown>,
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ];

    if (input.googleSub) {
      const k = Keys.lookupGoogle(input.googleSub);
      transactItems.push({
        Put: {
          TableName: this.db.tableName,
          Item: { ...k, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }
    if (input.appleSub) {
      const k = Keys.lookupApple(input.appleSub);
      transactItems.push({
        Put: {
          TableName: this.db.tableName,
          Item: { ...k, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }
    if (input.email) {
      const k = Keys.lookupEmail(input.email);
      transactItems.push({
        Put: {
          TableName: this.db.tableName,
          Item: { ...k, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }

    try {
      await this.db.transactWrite(transactItems);
    } catch (err: unknown) {
      // ConditionalCheckFailed inside a transaction surfaces as
      // TransactionCanceledException with reasons[].
      const name = (err as { name?: string }).name;
      if (name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException') {
        throw new ConflictException('Account already exists with one of the provided identifiers');
      }
      throw err;
    }

    // Single creation path, so this covers email signup and Google sign-in.
    // Fire-and-forget: a mail failure must never fail the registration.
    const welcome = welcomeEmail(profile.displayName);
    void this.email.send(profile.email, welcome.subject, welcome.html);

    return profile;
  }

  /**
   * Attach a verified phone number to a user. Writes the phone lookup row
   * atomically; the conditional expression rejects collisions with other users.
   */
  async attachPhone(userId: string, phoneE164: string): Promise<void> {
    const u = await this.getById(userId);
    if (u.phoneE164 === phoneE164) return;

    const lookup = Keys.lookupPhone(phoneE164);
    await this.db.transactWrite([
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: u.PK, SK: u.SK },
          UpdateExpression: 'SET phoneE164 = :p, updatedAt = :now',
          ExpressionAttributeValues: { ':p': phoneE164, ':now': new Date().toISOString() },
        },
      },
      {
        Put: {
          TableName: this.db.tableName,
          Item: { ...lookup, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
  }

  async attachCpf(userId: string, cpf: string): Promise<void> {
    const u = await this.getById(userId);
    if (u.cpf === cpf) return;
    // A CPF is permanent once registered: bans are enforced on it, so letting
    // an account swap it would let a banned user simply come back.
    if (u.cpf) {
      throw new ConflictException(
        'Esta conta já tem um CPF registrado, que não pode ser alterado. Fale com contato@arenadosmantos.app.br.',
      );
    }

    const lookup = Keys.lookupCpf(cpf);
    await this.db.transactWrite([
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: u.PK, SK: u.SK },
          UpdateExpression: 'SET cpf = :c, updatedAt = :now',
          ExpressionAttributeValues: { ':c': cpf, ':now': new Date().toISOString() },
        },
      },
      {
        Put: {
          TableName: this.db.tableName,
          Item: { ...lookup, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
  }

  async submitSurvey(
    userId: string,
    profile: string,
    collectionSize: string,
    storeSize: string,
    buyPerMonth: string,
    sellPerMonth: string,
  ): Promise<UserPublic> {
    const u = await this.getById(userId);
    const now = new Date().toISOString();
    await this.db.update({
      Key: { PK: u.PK, SK: u.SK },
      UpdateExpression:
        'SET surveyCompletedAt = :at, surveyProfile = :p, surveyCollectionSize = :cs, ' +
        'surveyStoreSize = :ss, surveyBuyPerMonth = :bpm, surveySellPerMonth = :spm, updatedAt = :now',
      ExpressionAttributeValues: {
        ':at':  now,
        ':p':   profile,
        ':cs':  collectionSize,
        ':ss':  storeSize,
        ':bpm': buyPerMonth,
        ':spm': sellPerMonth,
        ':now': now,
      },
    });
    return toPublic({ ...u, surveyCompletedAt: now, surveyProfile: profile,
      surveyCollectionSize: collectionSize, surveyStoreSize: storeSize,
      surveyBuyPerMonth: buyPerMonth, surveySellPerMonth: sellPerMonth, updatedAt: now });
  }

  async recordLgpdConsent(userId: string, version: string): Promise<void> {
    const u = await this.getById(userId);
    await this.db.update({
      Key: { PK: u.PK, SK: u.SK },
      UpdateExpression: 'SET lgpdConsentAt = :a, lgpdConsentVersion = :v, updatedAt = :now',
      ExpressionAttributeValues: {
        ':a': new Date().toISOString(),
        ':v': version,
        ':now': new Date().toISOString(),
      },
    });
  }

  async getRecipientId(userId: string): Promise<{ pagarmeRecipientId?: string }> {
    const u = await this.getById(userId);
    return { pagarmeRecipientId: u.pagarmeRecipientId };
  }

  async setRecipientId(userId: string, recipientId: string): Promise<UserPublic> {
    const u = await this.getById(userId);
    await this.db.update({
      Key:                       { PK: u.PK, SK: u.SK },
      UpdateExpression:          'SET pagarmeRecipientId = :r, updatedAt = :now',
      ExpressionAttributeValues: { ':r': recipientId, ':now': new Date().toISOString() },
    });
    return toPublic({ ...u, pagarmeRecipientId: recipientId });
  }

  async updateSellerCep(
    userId: string, cep: string,
    rua?: string, numero?: string, cidade?: string, estado?: string,
    complemento?: string, bairro?: string,
  ): Promise<UserPublic> {
    const u = await this.getById(userId);
    // Resolve every field once so the response matches what was stored —
    // an omitted field used to come back undefined while its saved value stayed.
    const next = {
      sellerCep:         cep.replace(/\D/g, '').slice(0, 8),
      sellerRua:         rua         ?? u.sellerRua         ?? '',
      sellerNumero:      numero      ?? u.sellerNumero      ?? '',
      sellerComplemento: complemento ?? u.sellerComplemento ?? '',
      sellerBairro:      bairro      ?? u.sellerBairro      ?? '',
      sellerCidade:      cidade      ?? u.sellerCidade      ?? '',
      sellerEstado:      (estado ?? u.sellerEstado ?? '').toUpperCase(),
    };
    await this.db.update({
      Key: { PK: u.PK, SK: u.SK },
      UpdateExpression:
        'SET sellerCep = :c, sellerRua = :r, sellerNumero = :n, sellerComplemento = :co, ' +
        'sellerBairro = :b, sellerCidade = :ci, sellerEstado = :e, updatedAt = :now',
      ExpressionAttributeValues: {
        ':c':   next.sellerCep,
        ':r':   next.sellerRua,
        ':n':   next.sellerNumero,
        ':co':  next.sellerComplemento,
        ':b':   next.sellerBairro,
        ':ci':  next.sellerCidade,
        ':e':   next.sellerEstado,
        ':now': new Date().toISOString(),
      },
    });
    return toPublic({ ...u, ...next });
  }

  async updateDadosPessoais(userId: string, data: {
    nomeCompleto: string;
  }): Promise<UserPublic> {
    const u = await this.getById(userId);
    if (u.dadosPessoaisLockedAt) throw new Error('LOCKED');
    // The e-mail is deliberately not written here: it must be verified, and
    // the login lookup row must move with it — see AuthService.confirmEmailChange.
    const now = new Date().toISOString();
    await this.db.update({
      Key: { PK: u.PK, SK: u.SK },
      UpdateExpression: 'SET nomeCompleto = :n, dadosPessoaisLockedAt = :l, updatedAt = :now',
      ExpressionAttributeValues: {
        ':n': data.nomeCompleto,
        ':l': now,
        ':now': now,
      },
    });
    return toPublic({ ...u, nomeCompleto: data.nomeCompleto, dadosPessoaisLockedAt: now });
  }

  async updateBankData(userId: string, data: {
    bankCode: string;
    bankAgency: string;
    bankAgencyDigit?: string;
    bankAccount: string;
    bankAccountDigit: string;
  }, pagarme: import('../payments/pagarme.service').PagarmeService): Promise<UserPublic> {
    const u = await this.getById(userId);
    if (u.bankLockedAt) throw new Error('LOCKED');
    if (!u.nomeCompleto || !u.email || !u.cpf) throw new Error('Complete Dados Pessoais first');

    const recipient = await pagarme.createRecipient({
      name: u.nomeCompleto,
      cpf: u.cpf,
      email: u.email,
      bankCode: data.bankCode,
      bankAgency: data.bankAgency,
      bankAgencyDigit: data.bankAgencyDigit,
      bankAccount: data.bankAccount,
      bankAccountDigit: data.bankAccountDigit,
    });

    const now = new Date().toISOString();
    await this.db.update({
      Key: { PK: u.PK, SK: u.SK },
      UpdateExpression: [
        'SET bankCode = :bc, bankAgency = :ba, bankAgencyDigit = :bad,',
        'bankAccount = :bac, bankAccountDigit = :bacd,',
        'bankLockedAt = :l, pagarmeRecipientId = :r, updatedAt = :now',
      ].join(' '),
      ExpressionAttributeValues: {
        ':bc':   data.bankCode,
        ':ba':   data.bankAgency,
        ':bad':  data.bankAgencyDigit ?? '',
        ':bac':  data.bankAccount,
        ':bacd': data.bankAccountDigit,
        ':l':    now,
        ':r':    recipient.id,
        ':now':  now,
      },
    });
    return toPublic({ ...u, ...data, bankLockedAt: now, pagarmeRecipientId: recipient.id });
  }

  async getFinanceiroBalance(userId: string, pagarme: import('../payments/pagarme.service').PagarmeService): Promise<{ available: number; waitingFunds: number; hasRecipient: boolean }> {
    const u = await this.getById(userId);
    if (!u.pagarmeRecipientId) return { available: 0, waitingFunds: 0, hasRecipient: false };
    const bal = await pagarme.getRecipientBalance(u.pagarmeRecipientId);
    return { ...bal, hasRecipient: true };
  }

  /**
   * Swap the bank account on the seller's existing Pagar.me recipient.
   * Requires re-authentication; name and CPF always come from the locked
   * profile. The account holder is e-mailed, and withdrawals pause for
   * BANK_CHANGE_HOLD_MS so a hijacker cannot empty the balance before the
   * real owner sees that e-mail.
   */
  async changeBankData(userId: string, data: {
    bankCode: string;
    bankAgency: string;
    bankAgencyDigit?: string;
    bankAccount: string;
    bankAccountDigit: string;
    password?: string;
    totpCode?: string;
  }, pagarme: import('../payments/pagarme.service').PagarmeService): Promise<UserPublic> {
    const u = await this.getById(userId);
    if (!u.bankLockedAt || !u.pagarmeRecipientId) {
      throw new BadRequestException('Você ainda não tem conta bancária cadastrada.');
    }
    if (!u.nomeCompleto || !u.cpf) throw new BadRequestException('Preencha os Dados Pessoais primeiro');

    await assertReauthenticated(u, data);

    const same =
      u.bankCode === data.bankCode && u.bankAgency === data.bankAgency &&
      (u.bankAgencyDigit ?? '') === (data.bankAgencyDigit ?? '') &&
      u.bankAccount === data.bankAccount && u.bankAccountDigit === data.bankAccountDigit;
    if (same) throw new BadRequestException('Esta já é a sua conta bancária cadastrada.');

    try {
      await pagarme.updateRecipientBankAccount(u.pagarmeRecipientId, {
        name: u.nomeCompleto,
        cpf: u.cpf,
        ...data,
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      const body   = (err as { body?: string }).body ?? '';
      if (body.includes('Second authentication factor')) {
        this.logger.error('Pagar.me refused bank change: server IP is not on the allow list');
        throw new BadRequestException('Não foi possível trocar a conta agora. Tente mais tarde ou fale com contato@arenadosmantos.app.br.');
      }
      if (status === 400 || status === 422) {
        throw new BadRequestException('A Pagar.me recusou esta conta. Confira banco, agência e conta — a conta precisa estar no seu CPF.');
      }
      throw err;
    }

    const now = new Date().toISOString();
    await this.db.update({
      Key: { PK: u.PK, SK: u.SK },
      UpdateExpression: [
        'SET bankCode = :bc, bankAgency = :ba, bankAgencyDigit = :bad,',
        'bankAccount = :bac, bankAccountDigit = :bacd, bankChangedAt = :now, updatedAt = :now',
      ].join(' '),
      ExpressionAttributeValues: {
        ':bc':   data.bankCode,
        ':ba':   data.bankAgency,
        ':bad':  data.bankAgencyDigit ?? '',
        ':bac':  data.bankAccount,
        ':bacd': data.bankAccountDigit,
        ':now':  now,
      },
    });
    this.logger.log(`Bank account changed for user ${userId}`);

    const notice = bankChangedNoticeEmail({
      bankCode:     data.bankCode,
      accountLast4: data.bankAccount.slice(-4),
      holdHours:    BANK_CHANGE_HOLD_MS / 3_600_000,
    });
    void this.email.send(u.email, notice.subject, notice.html);

    return toPublic({
      ...u,
      bankCode: data.bankCode,
      bankAgency: data.bankAgency,
      bankAgencyDigit: data.bankAgencyDigit ?? '',
      bankAccount: data.bankAccount,
      bankAccountDigit: data.bankAccountDigit,
      bankChangedAt: now,
    });
  }

  async requestWithdrawal(userId: string, amountCents: number, pagarme: import('../payments/pagarme.service').PagarmeService): Promise<{ id: string; status: string; amount: number }> {
    const u = await this.getById(userId);
    if (!u.pagarmeRecipientId) throw new Error('No recipient registered');
    if (u.bankChangedAt) {
      const releaseAt = new Date(new Date(u.bankChangedAt).getTime() + BANK_CHANGE_HOLD_MS);
      if (releaseAt > new Date()) {
        const when = releaseAt.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
        throw new BadRequestException(`Por segurança, saques ficam bloqueados por 48 horas após trocar a conta bancária. Liberado em ${when}.`);
      }
    }
    return pagarme.createWithdrawal(u.pagarmeRecipientId, amountCents);
  }

  async getWithdrawalHistory(userId: string, pagarme: import('../payments/pagarme.service').PagarmeService): Promise<{ id: string; status: string; amount: number; createdAt: string }[]> {
    const u = await this.getById(userId);
    if (!u.pagarmeRecipientId) return [];
    return pagarme.getWithdrawals(u.pagarmeRecipientId);
  }

  async updatePushToken(userId: string, token: string): Promise<void> {
    const u = await this.getById(userId);
    await this.db.update({
      Key: { PK: u.PK, SK: u.SK },
      UpdateExpression: 'SET expoPushToken = :t, updatedAt = :now',
      ExpressionAttributeValues: { ':t': token, ':now': new Date().toISOString() },
    });
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private async findByLookup(lookupPk: string): Promise<UserRecord | undefined> {
    const lookup = await this.db.get<{ userId: string }>(lookupPk, 'USER');
    if (!lookup) return undefined;
    return this.findById(lookup.userId);
  }
}

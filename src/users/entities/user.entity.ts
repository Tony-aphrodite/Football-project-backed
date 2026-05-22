/**
 * Server-side representation of a User row in DynamoDB. The shape stored on
 * disk is identical to this interface — we keep the projection lean because
 * single-table layouts encourage flat records.
 *
 * Fields on the DTO returned to the mobile client are a subset of this shape
 * (no PK/SK, no auth provider sub claims). See `users.service.ts` for the
 * `toPublic()` projection.
 */

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface UserRecord {
  PK: string;            // USER#{userId}
  SK: 'PROFILE';
  entityType: 'User';

  userId: string;
  displayName: string;

  // Authentication identifiers — at most one of (googleSub, appleSub) per user.
  googleSub?: string;
  appleSub?: string;
  email?: string;
  passwordHash?: string;

  // Brazilian-specific verification (Etapa 1 hard requirement).
  phoneE164?: string;
  cpf?: string;            // 11 digits, no punctuation

  // LGPD consent record (Play Store policy).
  lgpdConsentAt?: string;
  lgpdConsentVersion?: string;

  // Aggregated rating cache (Etapa 3). Recomputed on each new rating.
  ratingAvgAsSeller?: number;
  ratingCountAsSeller: number;
  ratingAvgAsBuyer?: number;
  ratingCountAsBuyer: number;

  // Seller shipping origin address (for Melhor Envio quoting)
  sellerCep?:     string;
  sellerRua?:     string;
  sellerNumero?:  string;
  sellerCidade?:  string;
  sellerEstado?:  string;
  // Pagar.me recipient ID for payment split
  pagarmeRecipientId?: string;

  // Soft caps enforced server-side.
  listingsActiveCount: number;   // hard cap of 20
  mpcPurchasesCount: number;     // hard cap of 5

  // Two-factor authentication (TOTP / Google Authenticator)
  totpEnabled?: boolean;
  totpSecret?: string;         // stored only after activation
  totpPendingSecret?: string;  // temporary during setup, removed on activation

  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserPublic {
  userId: string;
  displayName: string;
  email?: string;
  phoneE164?: string;
  cpf?: string;
  sellerCep?:     string;
  sellerRua?:     string;
  sellerNumero?:  string;
  sellerCidade?:  string;
  sellerEstado?:  string;
  pagarmeRecipientId?: string;
  lgpdConsentAt?: string;
  ratingAvgAsSeller?: number;
  ratingCountAsSeller: number;
  ratingAvgAsBuyer?: number;
  ratingCountAsBuyer: number;
  listingsActiveCount: number;
  mpcPurchasesCount: number;
  totpEnabled: boolean;
  status: UserStatus;
  createdAt: string;
}

export function toPublic(u: UserRecord): UserPublic {
  return {
    userId: u.userId,
    displayName: u.displayName,
    email: u.email,
    phoneE164: u.phoneE164,
    cpf: u.cpf,
    sellerCep:     u.sellerCep,
    sellerRua:     u.sellerRua,
    sellerNumero:  u.sellerNumero,
    sellerCidade:  u.sellerCidade,
    sellerEstado:  u.sellerEstado,
    pagarmeRecipientId: u.pagarmeRecipientId,
    lgpdConsentAt:      u.lgpdConsentAt,
    ratingAvgAsSeller: u.ratingAvgAsSeller,
    ratingCountAsSeller: u.ratingCountAsSeller,
    ratingAvgAsBuyer: u.ratingAvgAsBuyer,
    ratingCountAsBuyer: u.ratingCountAsBuyer,
    listingsActiveCount: u.listingsActiveCount,
    mpcPurchasesCount: u.mpcPurchasesCount,
    totpEnabled: u.totpEnabled ?? false,
    status: u.status,
    createdAt: u.createdAt,
  };
}

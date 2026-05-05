/**
 * Centralised key builders for the single-table layout. Every key string in
 * the app must come from here; never inline `USER#${id}` in a service.
 *
 * See docs/dynamodb-schema.md for the full access-pattern map.
 */

export const Keys = {
  // ── User profile ─────────────────────────────────────────────────────────
  user: (userId: string) => ({ PK: `USER#${userId}`, SK: 'PROFILE' as const }),

  // ── Lookup rows ──────────────────────────────────────────────────────────
  // Each lookup is its own row; uniqueness is enforced via conditional writes.
  lookupPhone: (e164: string) => ({ PK: `LOOKUP#PHONE#${e164}`, SK: 'USER' }),
  lookupCpf: (cpf: string) => ({ PK: `LOOKUP#CPF#${cpf}`, SK: 'USER' }),
  lookupEmail: (email: string) => ({ PK: `LOOKUP#EMAIL#${email.toLowerCase()}`, SK: 'USER' }),
  lookupGoogle: (sub: string) => ({ PK: `LOOKUP#GOOGLE#${sub}`, SK: 'USER' }),
  lookupApple: (sub: string) => ({ PK: `LOOKUP#APPLE#${sub}`, SK: 'USER' }),

  // ── Listing ──────────────────────────────────────────────────────────────
  listing: (listingId: string) => ({ PK: `LISTING#${listingId}`, SK: 'METADATA' }),
  userListingRef: (userId: string, createdAt: string, listingId: string) => ({
    PK: `USER#${userId}`,
    SK: `LISTING#${createdAt}#${listingId}`,
  }),

  // ── Comment / Report on a listing ────────────────────────────────────────
  comment: (listingId: string, createdAt: string, commentId: string) => ({
    PK: `LISTING#${listingId}`,
    SK: `COMMENT#${createdAt}#${commentId}`,
  }),
  report: (listingId: string, createdAt: string, reportId: string) => ({
    PK: `LISTING#${listingId}`,
    SK: `REPORT#${createdAt}#${reportId}`,
  }),

  // ── Order ────────────────────────────────────────────────────────────────
  order: (orderId: string) => ({ PK: `ORDER#${orderId}`, SK: 'METADATA' }),

  // ── Rating (received-by index lives on the ratee's partition) ───────────
  ratingReceived: (rateeUserId: string, createdAt: string, ratingId: string) => ({
    PK: `USER#${rateeUserId}`,
    SK: `RATING_RECEIVED#${createdAt}#${ratingId}`,
  }),

  // ── Minha Primeira Camisa purchase counter row ──────────────────────────
  mpcPurchaseRef: (userId: string, orderId: string) => ({
    PK: `USER#${userId}`,
    SK: `MPC_PURCHASE#${orderId}`,
  }),

  // ── Coupon ───────────────────────────────────────────────────────────────
  coupon: (code: string) => ({ PK: `COUPON#${code}`, SK: 'METADATA' }),
  couponRedemption: (code: string, userId: string) => ({
    PK: `COUPON#${code}`,
    SK: `REDEMPTION#${userId}`,
  }),
} as const;

// ── GSI partition values ───────────────────────────────────────────────────
export const Gsi = {
  listingFeed: (status: 'ACTIVE' | 'SOLD' | 'REMOVED' | 'DRAFT') => ({
    GSI1PK: `LISTING_FEED#${status}`,
  }),
  listingMpc: (status: 'ACTIVE' | 'SOLD') => ({
    GSI2PK: `LISTING_MPC#${status}`,
  }),
  reportQueue: (status: 'PENDING' | 'RESOLVED' | 'DISMISSED') => ({
    GSI1PK: `REPORT#${status}`,
  }),
  ordersAsBuyer: (buyerId: string) => ({ GSI1PK: `ORDER_BUYER#${buyerId}` }),
  ordersAsSeller: (sellerId: string) => ({ GSI2PK: `ORDER_SELLER#${sellerId}` }),
} as const;

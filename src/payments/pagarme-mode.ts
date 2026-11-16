/**
 * Pagar.me IDs only exist under the keys that created them: a recipient,
 * customer or saved card made with the test key is unknown to the live
 * account, and vice versa. Each one stored on a user is tagged with the mode
 * that made it; records from before the tag all came from the test key.
 */
export type PagarmeMode = 'test' | 'live';

export function currentPagarmeMode(): PagarmeMode {
  const key = process.env.PAGARME_API_KEY?.trim();
  return !key || key.startsWith('sk_test_') ? 'test' : 'live';
}

export interface PagarmeIds {
  pagarmeRecipientId?: string;
  pagarmeRecipientMode?: PagarmeMode;
  bankLockedAt?: string;
  bankChangedAt?: string;
  pagarmeCustomerId?: string;
  pagarmeCustomerMode?: PagarmeMode;
  savedCard?: unknown;
}

/**
 * The user as the current keys see them: a recipient from the other mode
 * counts as no bank account registered, so the seller saves it again (the form
 * comes back filled in) and a recipient is created under these keys; a
 * customer from the other mode counts as no saved card. Nothing is deleted.
 */
export function withCurrentPagarmeIds<T extends PagarmeIds>(u: T): T {
  const mode = currentPagarmeMode();
  const out = { ...u };
  if (u.pagarmeRecipientId && (u.pagarmeRecipientMode ?? 'test') !== mode) {
    delete out.pagarmeRecipientId;
    delete out.bankLockedAt;
    delete out.bankChangedAt;
  }
  if (u.pagarmeCustomerId && (u.pagarmeCustomerMode ?? 'test') !== mode) {
    delete out.pagarmeCustomerId;
    delete out.savedCard;
  }
  return out;
}

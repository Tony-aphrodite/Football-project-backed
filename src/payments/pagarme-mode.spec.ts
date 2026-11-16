import { currentPagarmeMode, withCurrentPagarmeIds } from './pagarme-mode';

describe('withCurrentPagarmeIds', () => {
  const saved = process.env.PAGARME_API_KEY;
  afterEach(() => { process.env.PAGARME_API_KEY = saved; });

  const seller = {
    displayName: 'Vendedor',
    pagarmeRecipientId: 're_test',
    bankLockedAt: '2026-06-01T00:00:00.000Z',
    pagarmeCustomerId: 'cus_test',
    savedCard: { cardId: 'card_test' },
  };

  it('keeps untagged IDs while the test key is in use', () => {
    process.env.PAGARME_API_KEY = 'sk_test_abc';
    expect(currentPagarmeMode()).toBe('test');
    expect(withCurrentPagarmeIds(seller)).toEqual(seller);
  });
  it('hides untagged (test) IDs once the live key is in use', () => {
    process.env.PAGARME_API_KEY = 'sk_abc';
    const u = withCurrentPagarmeIds(seller);
    expect(u.pagarmeRecipientId).toBeUndefined();
    expect(u.bankLockedAt).toBeUndefined();
    expect(u.pagarmeCustomerId).toBeUndefined();
    expect(u.savedCard).toBeUndefined();
    expect(u.displayName).toBe('Vendedor');
    expect(seller.pagarmeRecipientId).toBe('re_test'); // the stored record is untouched
  });
  it('keeps IDs created under the live key', () => {
    process.env.PAGARME_API_KEY = 'sk_abc';
    const live = { ...seller, pagarmeRecipientMode: 'live' as const, pagarmeCustomerMode: 'live' as const };
    expect(withCurrentPagarmeIds(live)).toEqual(live);
  });
  it('treats a missing key as test', () => {
    delete process.env.PAGARME_API_KEY;
    expect(currentPagarmeMode()).toBe('test');
  });
});

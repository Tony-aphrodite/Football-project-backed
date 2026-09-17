import { PagarmeService } from './pagarme.service';

describe('PagarmeService.buildSplit', () => {
  const svc = new PagarmeService({ get: () => undefined } as never);
  const amounts = (rules: { recipient_id: string; amount: number }[]) =>
    Object.fromEntries(rules.map((r) => [r.recipient_id, r.amount]));

  it('gives Arena the commission plus all of the shipping', () => {
    // R$ 149,90 jersey + R$ 32,00 shipping = R$ 181,90
    const split = amounts(svc.buildSplit(18190, 'arena', 'seller', 7, 3200));
    expect(split.arena).toBe(1049 + 3200);   // 7% of 149,90 = 10,49
    expect(split.seller).toBe(14990 - 1049); // 139,41
  });

  it('always adds up to the charged amount', () => {
    for (const [total, shipping] of [[18190, 3200], [16500, 0], [1001, 999], [99999, 4567]]) {
      const split = amounts(svc.buildSplit(total, 'arena', 'seller', 7, shipping));
      expect(split.arena + split.seller).toBe(total);
    }
  });

  it('hand delivery (no shipping) is a plain 7% commission', () => {
    const split = amounts(svc.buildSplit(16500, 'arena', 'seller', 7, 0));
    expect(split.arena).toBe(1155);
    expect(split.seller).toBe(15345);
  });

  it('with a coupon, commission is on what the buyer paid for the jersey', () => {
    // 149,90 − 10% coupon (14,99) = 134,91 item + 32,00 shipping
    const split = amounts(svc.buildSplit(16691, 'arena', 'seller', 7, 3200));
    expect(split.arena).toBe(944 + 3200);
    expect(split.seller).toBe(13491 - 944);
  });
});

import { OrdersService } from './orders.service';

// Only the purchase history matters for this rule.
function serviceWith(statuses: string[]) {
  const db = { query: jest.fn().mockResolvedValue(statuses.map((status, i) => ({ orderId: `o${i}`, status }))) };
  const svc = new OrdersService(db as never, {} as never, {} as never, {} as never, {} as never);
  return (svc as unknown as { assertWithinNewAccountLimit(id: string): Promise<void> }).assertWithinNewAccountLimit.bind(svc);
}

describe('new-account purchase limit', () => {
  it('allows the first and second purchase', async () => {
    await expect(serviceWith([])('u')).resolves.toBeUndefined();
    await expect(serviceWith(['PAID'])('u')).resolves.toBeUndefined();
  });

  it('refuses a third purchase in progress', async () => {
    await expect(serviceWith(['PAID', 'PENDING_PAYMENT'])('u')).rejects.toThrow('até 2 compras em andamento');
    await expect(serviceWith(['SHIPPED', 'DISPUTED'])('u')).rejects.toThrow('até 2 compras em andamento');
  });

  it('ignores cancelled orders', async () => {
    await expect(serviceWith(['CANCELLED', 'CANCELLED', 'PAID'])('u')).resolves.toBeUndefined();
  });

  it('lifts the limit after one completed purchase', async () => {
    await expect(serviceWith(['COMPLETED', 'PAID', 'PAID', 'SHIPPED'])('u')).resolves.toBeUndefined();
  });
});

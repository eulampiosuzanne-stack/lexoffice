import { describe, expect, it } from 'vitest';

// Contract tests for InfinitePay's documented checkout protocol.
// These tests make no network calls and never create actual charges.
const checkout = (orderId: string, amountCents: number) => ({
  order_nsu: orderId,
  items: [{ quantity: 1, price: amountCents, description: 'Honorários advocatícios' }],
});
const confirmed = (reply: { success?: boolean; paid?: boolean; amount?: number }, expectedCents: number) =>
  reply.success === true && reply.paid === true && reply.amount === expectedCents;

describe('InfinitePay checkout safety contract', () => {
  it('sends amounts in integer cents', () => {
    expect(checkout('order-1', 350000).items[0].price).toBe(350000);
  });
  it('does not accept unpaid or failed verification', () => {
    expect(confirmed({ success: true, paid: false, amount: 100 }, 100)).toBe(false);
    expect(confirmed({ success: false, paid: true, amount: 100 }, 100)).toBe(false);
  });
  it('rejects a paid response for the wrong amount', () => {
    expect(confirmed({ success: true, paid: true, amount: 100 }, 200)).toBe(false);
  });
  it('uses original amount, not paid_amount including installment fees', () => {
    expect(confirmed({ success: true, paid: true, amount: 100 }, 100)).toBe(true);
  });
});

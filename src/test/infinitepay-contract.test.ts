// Self-contained checkout protocol checks. No network calls or actual charges.
const checkout = (orderId: string, amountCents: number) => ({
  order_nsu: orderId,
  items: [{ quantity: 1, price: amountCents, description: 'Honorários advocatícios' }],
});
const confirmed = (reply: { success?: boolean; paid?: boolean; amount?: number }, expectedCents: number) =>
  reply.success === true && reply.paid === true && reply.amount === expectedCents;

export const infinitePayContractChecks = {
  integerCents: checkout('order-1', 350000).items[0].price === 350000,
  unpaidRejected: !confirmed({ success: true, paid: false, amount: 100 }, 100),
  failedRejected: !confirmed({ success: false, paid: true, amount: 100 }, 100),
  wrongAmountRejected: !confirmed({ success: true, paid: true, amount: 100 }, 200),
  validAmountAccepted: confirmed({ success: true, paid: true, amount: 100 }, 100),
};

// Regras puras da cobrança InfinitePay (sem rede, sem banco). Testadas em scripts/test-infinitepay.mjs.
export const METHODS = ['pix_card', 'card_only', 'recurring'];
export const toCents = (v) => Math.round(Number(v) * 100);

// Saldo de uma parcela = valor do lançamento - soma dos pagamentos já registrados.
export function balanceCents(entryAmount, paymentsSum) {
  return Math.max(0, toCents(entryAmount) - toCents(paymentsSum));
}

// Confere a seleção contra o que veio do banco. Devolve { ok, error, items, totalCents }.
// installments: fee_installments carregadas do banco para o contrato; entries: financial_entries ligadas.
export function buildChargePlan({ installmentIds, installments, entries, payments, blockedEntryIds = [], clientId, contractId, userId }) {
  const ids = [...new Set(installmentIds || [])];
  if (!ids.length) return { ok: false, error: 'Selecione ao menos uma parcela.' };
  const items = [];
  for (const id of ids) {
    const inst = installments.find((i) => i.id === id);
    if (!inst) return { ok: false, error: 'Parcela não encontrada neste contrato.' };
    if (inst.client_id !== clientId || inst.contract_id !== contractId) return { ok: false, error: 'Parcela não pertence ao cliente/contrato informado.' };
    if (userId && inst.owner_user_id && inst.owner_user_id !== userId) return { ok: false, error: 'Parcela não pertence à sua carteira.' };
    if (['paid', 'cancelled'].includes(inst.status)) return { ok: false, error: `Parcela ${inst.installment_number} já está ${inst.status === 'paid' ? 'paga' : 'cancelada'}.` };
    const entry = entries.find((e) => e.installment_id === id && e.type === 'income');
    if (!entry) return { ok: false, error: `Parcela ${inst.installment_number} não tem lançamento financeiro.` };
    if (blockedEntryIds.includes(entry.id)) return { ok: false, error: `Parcela ${inst.installment_number} já possui cobrança InfinitePay em aberto.` };
    const paid = payments.filter((p) => p.financial_entry_id === entry.id).reduce((s, p) => s + Number(p.amount || 0), 0);
    const cents = balanceCents(entry.amount, paid);
    if (cents < 100) return { ok: false, error: `Parcela ${inst.installment_number} não tem saldo a cobrar.` };
    items.push({ installmentId: id, entryId: entry.id, number: inst.installment_number, dueDate: inst.due_date, amountCents: cents });
  }
  items.sort((a, b) => a.number - b.number);
  return { ok: true, items, totalCents: items.reduce((s, i) => s + i.amountCents, 0) };
}

// Agrupa em cobranças: recorrente = uma por parcela; demais = uma só com todas.
export function groupCharges(method, items) {
  if (method === 'recurring') return items.map((i) => ({ items: [i], amountCents: i.amountCents, dueDate: i.dueDate }));
  return [{ items, amountCents: items.reduce((s, i) => s + i.amountCents, 0), dueDate: items.map((i) => i.dueDate).sort()[0] }];
}

export const describeCharge = (items) => `Honorários advocatícios · parcela${items.length > 1 ? 's' : ''} ${items.map((i) => i.number).join(', ')}`;

// Payload do link de checkout (valores sempre em centavos inteiros).
export function checkoutPayload({ handle, orderNsu, description, amountCents, redirectUrl, webhookUrl }) {
  return { handle, order_nsu: orderNsu, items: [{ quantity: 1, price: amountCents, description }], redirect_url: redirectUrl, webhook_url: webhookUrl };
}

// Só aceita como pago o que a InfinitePay confirmou, com valor igual ou maior que o da cobrança.
export function paymentConfirmed(reply, expectedCents) {
  if (!reply || reply.success !== true || reply.paid !== true) return false;
  const paid = Number(reply.paid_amount ?? reply.amount);
  return Number.isInteger(paid) && paid >= expectedCents;
}

export const safeEqual = (a, b) => {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length || !a) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

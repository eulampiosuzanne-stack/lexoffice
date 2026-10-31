// Regras puras da cobrança InfinitePay (sem rede, sem banco). Testadas em scripts/test-infinitepay.mjs.
export const METHODS = ['pix_card', 'recurring']; // cartão-only exige chave de API da InfinitePay; recorrência = um link por parcela
export const toCents = (v) => Math.round(Number(v) * 100);
export const balanceCents = (entryAmount, paymentsSum) => Math.max(0, toCents(entryAmount) - toCents(paymentsSum));

// Confere a seleção contra o que veio do banco (financial_entries do contrato). Devolve { ok, error, items, totalCents }.
export function buildChargePlan({ entryIds, entries, payments, blockedEntryIds = [], clientId, contractId, userId }) {
  const ids = [...new Set(entryIds || [])];
  if (!ids.length) return { ok: false, error: 'Selecione ao menos uma parcela.' };
  const items = [];
  for (const id of ids) {
    const e = entries.find((x) => x.id === id);
    if (!e) return { ok: false, error: 'Parcela não encontrada neste contrato.' };
    if (e.type !== 'income') return { ok: false, error: 'Só lançamentos de receita podem ser cobrados.' };
    if (e.client_id !== clientId || e.contract_id !== contractId) return { ok: false, error: 'Parcela não pertence ao cliente/contrato informado.' };
    if (userId && e.owner_user_id && e.owner_user_id !== userId) return { ok: false, error: 'Parcela não pertence à sua carteira.' };
    const label = (e.description || 'Parcela').slice(0, 60);
    if (['paid', 'cancelled'].includes(e.status)) return { ok: false, error: `"${label}" já está ${e.status === 'paid' ? 'paga' : 'cancelada'}.` };
    if (blockedEntryIds.includes(e.id)) return { ok: false, error: `"${label}" já possui cobrança InfinitePay em aberto.` };
    const paid = payments.filter((p) => p.financial_entry_id === e.id).reduce((s, p) => s + Number(p.amount || 0), 0);
    const cents = balanceCents(e.amount, paid);
    if (cents < 100) return { ok: false, error: `"${label}" não tem saldo a cobrar.` };
    items.push({ entryId: e.id, label, dueDate: e.due_date || null, amountCents: cents });
  }
  items.sort((a, b) => String(a.dueDate || '9').localeCompare(String(b.dueDate || '9')));
  return { ok: true, items, totalCents: items.reduce((s, i) => s + i.amountCents, 0) };
}

// Recorrente = uma cobrança (um link) por parcela; demais = uma só com todas.
export function groupCharges(method, items) {
  if (method === 'recurring') return items.map((i) => ({ items: [i], amountCents: i.amountCents, dueDate: i.dueDate }));
  return [{ items, amountCents: items.reduce((s, i) => s + i.amountCents, 0), dueDate: items.map((i) => i.dueDate).filter(Boolean).sort()[0] || null }];
}

export const describeCharge = (items) => (items.length === 1 ? `Honorários advocatícios · ${items[0].label}` : `Honorários advocatícios · ${items.length} parcelas`).slice(0, 200);

// Payload do link (preço sempre em centavos inteiros).
export const checkoutPayload = ({ handle, orderNsu, description, amountCents, redirectUrl, webhookUrl }) =>
  ({ handle, order_nsu: orderNsu, items: [{ quantity: 1, price: amountCents, description }], redirect_url: redirectUrl, webhook_url: webhookUrl });

// O campo da URL na resposta não é documentado: aceita url/link e exige https.
export const extractCheckoutUrl = (reply) => {
  const u = reply?.url || reply?.link || reply?.checkout_url || reply?.checkoutUrl;
  return typeof u === 'string' && u.startsWith('https://') ? u : null;
};

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

// Porta de entrada do aviso de pagamento. Devolve o motivo da rejeição ou null se pode seguir para a confirmação.
// (Não revela ao chamador se a cobrança existe: a resposta é sempre a mesma.)
export function webhookGate({ charge, token, txn, slug }) {
  if (!charge || !safeEqual(charge.webhook_token, token)) return 'rejected_unknown_or_token';
  if (charge.environment !== 'production' || charge.status !== 'active') return `ignored_${charge.status}`;
  if (!txn || !slug) return 'rejected_missing_fields';
  return null;
}

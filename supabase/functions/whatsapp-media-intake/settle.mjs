// 27/11/2026 (Dra. Suzanne): comprovante de cliente dá baixa na parcela. Na dúvida, NÃO baixa e avisa.
const OPEN = ['pending', 'overdue'];
const brl = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',');
const br = (iso) => String(iso || '').split('-').reverse().join('/');

// Parcela de valor exato, a mais antiga primeiro; ignora vencimentos distantes (mais de 35 dias).
export function pickEntry(entries, amount, now = Date.now()) {
  const limit = new Date(now + 35 * 86400000).toISOString().slice(0, 10);
  return (entries || [])
    .filter((e) => OPEN.includes(e.status) && Math.abs(Number(e.amount) - amount) < 0.01 && e.due_date && e.due_date <= limit)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] || null;
}

// Devolve o aviso para a Dra. (ou "" quando é o mesmo comprovante reenviado).
export async function settleInstallment(db, { orgId, ownerId, clientId, who, check, now = Date.now() }) {
  const no = (why) => `⚠️ ${who} mandou um comprovante e NÃO dei baixa: ${why}. Confira no Financeiro.`;
  if (!check.ok) return no(check.reason);
  const used = await db.from('payment_receipts').select('id,client_id').eq('org_id', orgId).eq('payment_reference', check.reference).limit(1);
  if (used.error) return no('não consegui conferir se o comprovante já foi usado');
  if (used.data?.length) return used.data[0].client_id === clientId ? '' : no('este comprovante já foi usado por outra pessoa');
  const open = await db.from('financial_entries').select('id,amount,due_date,status,description,installment_id,contract_id')
    .eq('org_id', orgId).eq('client_id', clientId).eq('type', 'income').in('status', OPEN);
  if (open.error) return no('não consegui consultar as parcelas');
  const entry = pickEntry(open.data, check.amount, now);
  if (!entry) return no(`${brl(check.amount)} não bate com nenhuma parcela em aberto`);
  const receipt = await db.from('payment_receipts').insert({
    org_id: orgId, client_id: clientId, contract_id: entry.contract_id, installment_id: entry.installment_id,
    amount: check.amount, payment_method: 'pix', payment_reference: check.reference, owner_user_id: ownerId,
    notes: 'Baixa automática pelo comprovante (conferir no extrato)',
  });
  if (receipt.error) return no('não consegui registrar o recebimento');
  const paid = await db.from('financial_entries')
    .update({ status: 'paid', paid_at: check.paidAt, payment_method: 'pix', updated_at: new Date(now).toISOString() })
    .eq('id', entry.id).eq('org_id', orgId).in('status', OPEN).select('id');
  if (paid.error || !paid.data?.length) return no('registrei o recebimento, mas a parcela não mudou para paga');
  // cobranças já na fila deixam de fazer sentido (se ainda houver atraso, a rotina gera de novo).
  await db.from('notification_queue').update({ status: 'cancelled', last_error: 'Parcela paga por comprovante' })
    .eq('org_id', orgId).eq('client_id', clientId).eq('status', 'pending').like('template_key', 'collection%');
  return `💰 PARCELA PAGA\n${who}\n${brl(check.amount)} — ${entry.description || 'parcela'} (venc. ${br(entry.due_date)})\nDei baixa pelo comprovante. Confira no extrato.`;
}

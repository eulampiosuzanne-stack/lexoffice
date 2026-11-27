// Registra o pagamento da consulta de quem ainda não é cliente. É o que libera os dias na Helena.
export async function confirmConsultPayment(db: any, o: { orgId: string; userId: string; conversationId: string; contactId?: string | null; amount: number }): Promise<string> {
  if (!o.orgId || !o.userId) return 'Sessão não identificada. Entre novamente.';
  if (!Number.isFinite(o.amount) || o.amount <= 0) return 'Valor inválido. Nada foi registrado.';
  const cv = await db.from('whatsapp_conversations').select('lead_id').eq('id', o.conversationId).maybeSingle();
  let leadId = cv.data?.lead_id || null;
  if (!leadId && o.contactId) {
    const ct = await db.from('whatsapp_contacts').select('lead_id').eq('id', o.contactId).maybeSingle();
    leadId = ct.data?.lead_id || null;
  }
  if (!leadId) return 'Este contato não está cadastrado como lead. Nada foi registrado.';
  const prev = await db.from('payment_receipts').select('id').eq('org_id', o.orgId).eq('lead_id', leadId).limit(1);
  if (prev.error) return 'Não foi possível conferir pagamentos. Nada foi registrado.';
  if (prev.data?.length) return 'O pagamento deste contato já estava confirmado.';
  const ins = await db.from('payment_receipts').insert({ org_id: o.orgId, lead_id: leadId, amount: o.amount, payment_method: 'pix', owner_user_id: o.userId, registered_by: o.userId, notes: 'Consulta confirmada pela caixa de entrada' });
  if (ins.error) return 'Não foi possível registrar o pagamento. Tente novamente.';
  return 'Pagamento confirmado. Os dias serão liberados quando a pessoa pedir para agendar.';
}

export function parseAmount(text: string): number {
  const t = String(text || '').replace(/[R$\s]/g, '');
  return Number(t.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t);
}

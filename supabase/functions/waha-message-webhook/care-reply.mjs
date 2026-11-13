export function quotedMessageId(payload) {
  const value = payload.replyTo?.id ?? payload._data?.quotedMsg?.id;
  const id = typeof value === 'string' ? value : value?._serialized;
  return typeof id === 'string' && id.length <= 256 && /^true_[\w@.+:-]+$/.test(id) ? id : null;
}

export function careReplyContext(kind) {
  const labels = {
    process_distributed: 'aviso de distribuição processual',
    verified_movement: 'aviso de movimentação processual',
    hearing_preparation: 'orientação sobre audiência',
    document_checklist: 'orientação sobre documentos',
    favorable_decision: 'aviso de decisão processual',
    case_closed_nps: 'pesquisa de satisfação',
    agreement_poll: 'consulta sobre atendimento para acordo',
  };
  return Object.hasOwn(labels, kind) ? labels[kind] : 'comunicação de acompanhamento';
}

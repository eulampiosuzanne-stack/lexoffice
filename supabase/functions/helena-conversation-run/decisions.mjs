const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function decideConversation(message, noticeAgent) {
  const text = normalize(message);
  if (/\b(ameaca|agressao|prisao|flagrante|risco de vida|violencia)\b/.test(text)) return 'urgent';
  if (/\b(falar com (a )?(dra|doutora|suzanne|advogada)|me ligue)\b/.test(text)) return 'lawyer';
  if (/\b(atendimento humano|falar com (uma pessoa|a equipe|um atendente)|quero um atendente)\b/.test(text)) return 'human';
  if (/\b(reclamacao|reclamar|insatisfeit[oa])\b/.test(text)) return 'complaint';
  if (/\b(paguei|pagamento|financeiro|boleto|segunda via|honorarios|parcelamento|cobranca|comprovante)\b/.test(text)) return 'finance';
  if (/\b(processo|andamento|sentenca|audiencia|prazo|distribuicao)\b/.test(text)) return 'case';
  if (/\b(documentos?|anexo|pdf)\b/.test(text)) return 'document';
  if (/\b(reuniao|agendar|consulta|horario disponivel)\b/.test(text)) return 'schedule';
  if (/\b(parcerias?|fornecedores?|administrativ[oa]|endereco|expediente)\b/.test(text)) return 'administrative';
  if (noticeAgent === 'billing') return 'finance';
  if (noticeAgent === 'client_process_updates') return 'case';
  return 'clarify';
}

export function needsSecureChannel(intent, matchedClient) {
  return intent === 'case' || (intent === 'finance' && matchedClient);
}

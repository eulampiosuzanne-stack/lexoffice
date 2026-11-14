const office = 'b3dd3ed0-2a05-4087-8220-307a44352cec';

export function weekendNotice(orgId, now = new Date()) {
  if (orgId !== office) return '';
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (day !== '2026-11-14' && day !== '2026-11-15') return '';
  return 'A Dra. Suzanne e a Dra. Gláucia retomam o atendimento na segunda-feira, 16/11. Se preferir, deixe um recado na área de mensagens do Aplicativo do Cliente:\n\nhttps://lexoffice.univittagroup.com.br/cliente';
}

export const isSuzanneOffice = orgId => orgId === office;

export function requestsLawyerContact(message) {
  const text = message.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const person = '(?:suzanne|glaucia|dra\\.?|doutora|advogada)';
  return new RegExp('\\b(?:falar|conversar|ligar|reuniao|atendimento)\\b.{0,35}\\b(?:com|para|pra)\\s+(?:a\\s+)?'+person+'(?=\\W|$)|\\b'+person+'\\W+.{0,20}\\b(?:pode|consegue)\\s+(?:falar|conversar|me ligar)\\b').test(text);
}

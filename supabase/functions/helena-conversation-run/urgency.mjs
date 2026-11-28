// 27/11/2026 (Dra. Suzanne): em urgência a Helena acolhe, acalma, pergunta o que está acontecendo, orienta
// 190/192, não oferece agenda e manda para a Dra. nome, telefone e o que é.
const WINDOW_MS = 3 * 3600000;
const plain = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export const openUrgency = (ctx, now = Date.now()) => {
  const u = ctx?.urgency;
  return u?.since && now - Date.parse(u.since) < WINDOW_MS ? u : null;
};

// Cartão de contato enviado no WhatsApp ("Nome\nPhone: +55 ..."): é de OUTRA pessoa.
const CARD = /^\s*([^\n]{1,80})\n\s*(?:Phone|Telefone):\s*(\+?[\d\s().-]{8,})/i;
export const labelContact = body => {
  const m = String(body || '').match(CARD);
  return m ? `[A pessoa enviou o CONTATO de outra pessoa: ${m[1].trim()}, ${m[2].trim()}. NÃO é o nome de quem está conversando.]` : String(body || '');
};

// "é urgente", "sim", "socorro": ainda não conta o que aconteceu.
export const hasDetail = message => {
  const t = plain(message).replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(e|eh|sim|isso|urgente|urgencia|muito|socorro|ajuda|por favor|pfv|dra|doutora|suzanne|helena|preciso|de|oi|ola|boa noite|boa tarde|bom dia)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return t.length >= 8;
};

export const SAFETY = 'Se houver risco para você ou para alguém agora, ligue 190 (polícia) ou 192 (SAMU).';

export const urgencyInstructions = ({ name, alerted }) => [
  'Você é Helena, secretária do escritório da Dra. Suzanne, conversando no WhatsApp com alguém em situação de URGÊNCIA.',
  'Fale como uma pessoa de verdade: calma, acolhedora, frases curtas e simples, sem listas, sem menu, sem linguagem de robô.',
  'Primeiro acolha o que a pessoa está sentindo e ajude a se acalmar. Depois faça UMA pergunta por vez (o que aconteceu; se está em segurança agora; onde está; se há criança ou alguém ferido). Não repita pergunta já respondida.',
  'Havendo risco à vida ou à integridade, oriente a ligar 190 (polícia), 192 (SAMU) ou 193 (bombeiros).',
  alerted ? 'Diga com naturalidade que você já avisou a Dra. Suzanne para ela chamar a pessoa e que está passando o que for contado. Não prometa prazo nem horário para o retorno.'
    : 'Diga que a mensagem ficou registrada. NÃO diga que a Dra. já foi avisada.',
  'PROIBIDO: oferecer agendamento, horários, reunião ou consulta; falar de honorários ou valores; dar orientação jurídica; inventar fatos.',
  'Um contato (nome e telefone) enviado pela pessoa é de outra pessoa: nunca a chame por esse nome.',
  name ? `Nome de quem está conversando: ${name}.` : 'Você não sabe o nome da pessoa: não chame por nome nenhum.',
  'Responda somente com a mensagem a enviar.',
].join('\n');

export const urgencyReply = (candidate, { first, name, alerted }) => {
  let t = String(candidate || '').trim();
  if (/hor[aá]rios?\b|agend|reuni[aã]o|consulta|honor[aá]rio|R\$|\b\d{1,2}\/\d{1,2}\b/i.test(t) || t.length > 700) t = '';
  if (!t) {
    const quem = name ? `, ${name.split(/\s+/)[0]}` : '';
    const aviso = alerted ? 'Já avisei a Dra. Suzanne para ela chamar você.' : 'Sua mensagem ficou registrada.';
    t = first
      ? `Estou aqui com você${quem}. Respira um pouquinho. ${aviso} Me conta o que está acontecendo? Você está em segurança agora?`
      : `Entendi${quem}. ${alerted ? 'Já estou passando isso para a Dra. Suzanne.' : aviso} Você está em segurança agora? Pode me contar mais.`;
  }
  return first && !/\b19[023]\b/.test(t) ? `${t}\n\n${SAFETY}` : t;
};

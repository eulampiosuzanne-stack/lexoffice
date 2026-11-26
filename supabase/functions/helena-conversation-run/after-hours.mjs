// 26/11/2026 (Dra. Suzanne): cliente que escreve fora do expediente é avisado e perguntado se é urgência.
// Expediente: segunda a sexta, 8h às 18h (Brasília). Feriados não são considerados.
const TZ = 'America/Sao_Paulo';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(now) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const g = t => f.find(x => x.type === t).value;
  return { wd: DAYS.indexOf(g('weekday')), date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) };
}

/** null = escritório aberto. Fora do expediente: { period, when } (period identifica o intervalo até reabrir). */
export function afterHours(now = new Date()) {
  const p = parts(now);
  const weekday = p.wd >= 1 && p.wd <= 5;
  if (weekday && p.hour >= 8 && p.hour < 18) return null;
  let ahead = weekday && p.hour < 8 ? 0 : 1;
  while ([0, 6].includes((p.wd + ahead) % 7)) ahead++;
  const period = new Date(Date.parse(p.date + 'T12:00:00Z') + ahead * 86400000).toISOString().slice(0, 10);
  const when = ahead === 0 ? 'hoje a partir das 8h' : ahead === 1 ? 'amanhã a partir das 8h' : 'na segunda-feira a partir das 8h';
  return { period, when };
}

export const afterHoursNotice = when =>
  `Olá! 💛 Agora estamos fora do horário de atendimento. Voltamos ${when}.\n\nÉ urgência? Se for, responda *URGENTE*. Se não for, pode deixar sua mensagem por aqui.`;

const clean = message => String(message || '').replace(/^\[[^\]]*\]\s*/, '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** asked = já perguntamos "é urgência?" neste período (aí um "sim" vale como urgente). */
export function saysUrgent(message, asked = false) {
  const t = clean(message);
  if (/\b(nao|nem)\b[^.!?,]{0,20}\burgen|\bsem urgencia\b/.test(t)) return false;
  if (/\burgente\b|\burgencia\b/.test(t)) return true;
  return asked && /^(sim|e sim|isso|e)[\s!.,]*$/.test(t);
}

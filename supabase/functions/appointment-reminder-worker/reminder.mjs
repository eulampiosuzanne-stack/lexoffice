// Regras do lembrete de reunião/consulta (puras, para teste).
export const HELENA_MARK = 'Agendada pela Helena via WhatsApp';
export const EVENT_TYPES = ['consultation_online', 'consultation', 'client_consultation', 'meeting'];
const TZ = 'America/Sao_Paulo';

export const isHelena = (ev) => String(ev.description || '').startsWith(HELENA_MARK);

// "meeting" só entra quando foi a Helena que marcou (reunião interna não recebe lembrete).
export const eligible = (ev) => ev.event_type !== 'meeting' || isHelena(ev);

export function hoursFor(ev, configured) {
  if (isHelena(ev)) return [24, 1];
  if (ev.event_type === 'client_consultation') return [24, 2]; // mesmas horas gravadas pelo app
  return configured;
}

// Horas já vencidas, da mais próxima para a mais distante. Não lembra de algo marcado depois da hora do aviso.
export function dueHours(ev, hours, nowMs) {
  const start = new Date(ev.starts_at).getTime();
  const created = ev.created_at ? new Date(ev.created_at).getTime() : 0;
  return hours
    .filter((h) => { const at = start - h * 3600000; return nowMs >= at && at >= created; })
    .sort((a, b) => a - b);
}

// Telefone de quem ainda não é cliente: a Helena grava "Contato: ..." na descrição.
export function phoneFromDescription(ev) {
  if (!isHelena(ev)) return '';
  const m = String(ev.description).match(/Contato:\s*\+?(\d{10,15})\b/);
  return m ? m[1] : '';
}

const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

export function reminderText(ev, nowMs) {
  const start = new Date(ev.starts_at);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(start);
  const date = day(start) === day(new Date(nowMs)) ? 'hoje'
    : day(start) === day(new Date(nowMs + 86400000)) ? 'amanhã'
    : 'em ' + new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(start);
  const who = isHelena(ev) ? (String(ev.description).match(/Com:\s*(.+?)\.?\s*$/m)?.[1] || '') : '';
  const url = /^https:\/\/\S+$/.test(String(ev.meeting_url || '')) ? ev.meeting_url : '';
  return (isHelena(ev) ? 'Oi! Aqui é a Helena 😊\n\n' : 'Olá! 😊\n\n')
    + `Passando para lembrar da sua reunião online ${date}, às ${time}`
    + (who ? ` (com ${who})` : '') + '.'
    + (url ? `\n\n🔗 Link: ${url}` : '')
    + '\n\nSe precisar remarcar, é só responder aqui.';
}

import { receptionMessages } from './reception-messages.mjs';
// Ferramentas reais da Helena (06/11/2026): período excepcional (taxas) e agenda (horários reais + registro).
// Brasil sem horário de verão desde 2019: America/Sao_Paulo = UTC-3 fixo.
const SP_OFFSET_MS = 3 * 3600000;
const LAWYER_ID = '0e98483f-a464-422b-bf3e-68f454cdd405';
const ASSESSOR_ID = 'dea3f3a2-9c41-4d5d-b781-3b5140d2c7ec';
const DOW = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export type Slot = { iso: string; label: string; who: 'dra' | 'glaucia'; dow: number; hour: number; date: string };

const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// "Relógio" de São Paulo: campos UTC deste Date equivalem à hora local de SP.
export const spClock = (d: Date) => new Date(d.getTime() - SP_OFFSET_MS);
const ymd = (c: Date) => c.toISOString().slice(0, 10);
const brl = (v: number) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

export function exceptionalPeriodKey(now: Date, holidays: Set<string>): string | null {
  const c = spClock(now), h = c.getUTCHours(), dow = c.getUTCDay(), day = ymd(c);
  if (h >= 22 || h < 7) return 'overnight';
  if (dow === 0 || holidays.has(day)) return 'sunday_holiday';
  if (dow === 6) return 'saturday';
  if (h >= 18) return 'weekday_evening';
  if (h < 8) return 'message_off_hours';
  return null;
}

export function periodBlock(key: string | null, fees: any[]): string {
  if (!key) return 'HORÁRIO ATUAL: horário comercial (dias úteis, 08h às 18h). Não há taxa extraordinária agora.';
  const all = (fees || []).filter((f: any) => f.active !== false && Number(f.amount) > 0);
  const cur = (fees || []).find((f: any) => f.period_key === key);
  const table = all.map((f: any) => `${f.period_label}: ${brl(Number(f.amount))} ${f.unit || ''} (${f.condition || ''})`.trim()).join(' | ');
  if (!cur || Number(cur.amount) <= 0) return `AGORA ESTAMOS FORA DO HORÁRIO COMERCIAL (${cur?.period_label || 'fora do horário'}). Mensagens comuns ficam registradas, sem taxa, e seguem no próximo dia útil. Se a pessoa pedir atendimento, reunião ou ligação ainda fora do horário comercial, informe que é atendimento excepcional com taxa própria, conforme tabela: ${table}.`;
  return `AGORA É PERÍODO DE ATENDIMENTO EXCEPCIONAL: ${cur.period_label}. Se a pessoa pedir atendimento, reunião, ligação ou retorno agora ou neste período, informe com elegância, uma única vez, que por ser fora do horário comercial é atendimento excepcional, com taxa de ${brl(Number(cur.amount))} ${cur.unit || ''}, sujeito a ${String(cur.condition || 'disponibilidade e aceite prévio').toLowerCase()}. Ofereça como alternativa o próximo horário comercial, sem taxa extraordinária. Mensagens comuns (recado, dúvida, documento) ficam registradas sem taxa. Nunca diga que a Dra. vai atender agora. Tabela completa: ${table}.`;
}

function slotFrom(c: Date, hour: number, who: 'dra' | 'glaucia'): Slot {
  const local = Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), hour);
  const iso = new Date(local + SP_OFFSET_MS).toISOString();
  const dd = String(c.getUTCDate()).padStart(2, '0'), mm = String(c.getUTCMonth() + 1).padStart(2, '0');
  return { iso, who, dow: c.getUTCDay(), hour, date: ymd(c), label: `${DOW[c.getUTCDay()]}, ${dd}/${mm}, às ${hour}h` };
}

export function wantsAssessor(message: string) { return /\bglaucia\b|\bmanha\b|\bassessora\b/.test(norm(message)); }

// busy: [{starts_at, ends_at, all_day, event_type}]
export function computeSlots(now: Date, who: 'dra' | 'glaucia', busy: any[], holidays: Set<string>, count = 3): Slot[] {
  const [h0, h1] = who === 'dra' ? [14, 18] : [8, 14];
  const hearingDays = new Set(busy.filter((e: any) => e.event_type === 'hearing').map((e: any) => ymd(spClock(new Date(e.starts_at)))));
  const blocks = busy.filter((e: any) => e.event_type !== 'deadline' && !e.all_day).map((e: any) => {
    const s = new Date(e.starts_at).getTime(); const en = e.ends_at ? new Date(e.ends_at).getTime() : s + 3600000; return [s, en];
  });
  const out: Slot[] = [];
  const base = spClock(now);
  for (let i = 1; i <= 21 && out.length < count; i++) { // a partir do próximo dia útil
    const c = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    const dow = c.getUTCDay();
    if (dow === 0 || dow === 6 || holidays.has(ymd(c)) || hearingDays.has(ymd(c))) continue;
    for (let h = h0; h < h1; h++) {
      const s = slotFrom(c, h, who), st = new Date(s.iso).getTime(), en = st + 3600000;
      if (blocks.some(([bs, be]) => st < be && en > bs)) continue;
      out.push(s); break; // um horário por dia: três dias diferentes
    }
  }
  return out;
}

// Interpreta a escolha da pessoa entre os horários oferecidos. Retorna o slot só se a escolha for inequívoca.
export function pickSlot(message: string, offered: Slot[]): Slot | null {
  if (!offered?.length) return null;
  const t = norm(message).trim();
  if (t.includes('?') || /\b(?:nao|talvez|cancelar|desmarcar)\b/.test(t)) return null;
  // "segunda" fica de fora dos ordinais: em português é quase sempre o dia da semana.
  const ord: Array<[RegExp, number]> = [[/\b(primeiro|primeira)\b/, 0], [/\b(segundo|segunda opcao)\b/, 1], [/\b(terceiro|terceira)\b/, 2], [/\b(ultimo|ultima)\b/, offered.length - 1]];
  if (/^(?:opcao\s*)?[1-3](?:\s+(?:por favor|obrigad[oa]))?[.!)]?$/.test(t)) { const i = Number(t.match(/[1-3]/)![0]) - 1; return offered[i] || null; }
  const ordinalAnswer = /^(?:(?:prefiro|quero|pode ser|fico com)\s+)?(?:a\s+|o\s+)?(?:opcao\s+)?(?:primeir[oa]|segund[oa]|terceir[oa]|ultim[oa])(?:\s+(?:opcao|horario|por favor|obrigad[oa]))?[.!]?$/;
  const hits = ord.filter(([re]) => re.test(t));
  if (ordinalAnswer.test(t) && hits.length === 1) return offered[hits[0][1]] || null;
  let cand = offered;
  const hm = t.match(/\b(\d{1,2})\s*(h|:00|horas?)\b/);
  if (hm) cand = cand.filter(s => s.hour === Number(hm[1]));
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dm) cand = cand.filter(s => Number(s.date.slice(8, 10)) === Number(dm[1]) && Number(s.date.slice(5, 7)) === Number(dm[2]));
  const days = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const di = days.findIndex(d => new RegExp(`\\b${d}\\b`).test(t));
  if (di >= 0) cand = cand.filter(s => s.dow === di);
  if ((hm || dm || di >= 0) && cand.length === 1) return cand[0];
  return null;
}

const AGENDA_RE = /\b(agendar|agendamento|agenda|marcar|marca|reuniao|horario|horarios|consulta|remarcar|falar com (a )?(dra|doutora|suzanne|glaucia|advogada)|me liga|ligacao)\b/;
export const asksAgenda = (m: string) => AGENDA_RE.test(norm(m));

async function holidaySet(a: any, orgId: string): Promise<Set<string>> {
  const { data, error } = await a.from('office_holidays').select('holiday_date').eq('org_id', orgId).gte('holiday_date', new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10)).limit(60);
  if (error) throw error;
  return new Set((data || []).map((h: any) => String(h.holiday_date).slice(0, 10)));
}

export async function exceptionalContext(a: any, orgId: string): Promise<string> {
  try {
    const hol = await holidaySet(a, orgId);
    const key = exceptionalPeriodKey(new Date(), hol);
    const { data: fees } = await a.from('extraordinary_service_fees').select('period_key,period_label,amount,unit,condition,active,sort_order').eq('org_id', orgId).order('sort_order');
    return periodBlock(key, fees || []);
  } catch (e) { console.error('exceptionalContext', e); return ''; }
}

// A seleção é comparada com a oferta efetivamente enviada ao cliente.
export type AgendaReply = { reply: string; idempotencyKey?: string; slots?: Slot[] };
// v75 (12/11/2026): título curto do botão de horário (limite da Meta: 24 caracteres na lista). Ex.: "Sex 13/11 às 14h".
const DOW_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// v76: emoji de calendário na frente (pedido da Dra.: botões com desenhos). Emoji ocupa 2 posições; o total continua ≤ 24.
export const SLOT_ICON = '\u{1F4C6}';
export function slotButtonTitle(s: Slot): string { return (SLOT_ICON + ' ' + `${DOW_SHORT[s.dow] || ''} ${s.date.slice(8, 10)}/${s.date.slice(5, 7)} às ${s.hour}h`.trim()).slice(0, 24); }

export async function agendaTool(a: any, o: { orgId: string; conversationId: string; message: string; ctx: any; clientId: string | null; leadId: string | null; name: string; phone: string; policyId: string; dryRun: boolean; lastOutbound?: string }): Promise<string | AgendaReply> {
  const unavailable = { reply: receptionMessages.schedule_failed };
  try {
    const offeredAt = Number(o.ctx?.offered_at || 0);
    const offered: Slot[] = Array.isArray(o.ctx?.offered_slots) && Date.now() - offeredAt < 72 * 3600000 ? o.ctx.offered_slots : [];
    const last = norm(o.lastOutbound || '');
    const shown = offered.filter(s => last.includes(norm(s.label)));
    const numbered = /^(?:opcao\s*)?[1-3](?:\s+(?:por favor|obrigad[oa]))?[.!)]?$/.test(norm(o.message).trim());
    const acceptsSingle = shown.length === 1 && offered.length === 1 && last.includes('qual opcao voce prefere?') && /^(?:sim|confirmo|pode ser|combinado|fechado)[.!]?$/.test(norm(o.message).trim());
    const choice = acceptsSingle ? shown[0] : numbered && shown.length !== offered.length ? null : pickSlot(o.message, shown);
    if (!choice && !asksAgenda(o.message)) {
      if (shown.length && numbered) return { reply: 'Qual data e horário da lista você prefere?' };
      return '';
    }
    if (!o.clientId) {
      const { count, error } = o.leadId
        ? await a.from('payment_receipts').select('id', { count: 'exact', head: true }).eq('org_id', o.orgId).eq('lead_id', o.leadId)
        : { count: 0, error: null };
      if (error) return unavailable;
      if (!count) return 'AGENDA: pagamento da consulta não confirmado. Não ofereça horários e siga o fluxo da consulta paga.';
    }
    if (choice && !o.dryRun) {
      const responsible = choice.who === 'dra' ? LAWYER_ID : ASSESSOR_ID;
      const person = choice.who === 'dra' ? 'Dra. Suzanne' : 'assessora Gláucia';
      const { data, error } = await a.rpc('helena_book_offered_slot', {
        p_org: o.orgId, p_conversation: o.conversationId, p_start: choice.iso, p_offered_at: offeredAt,
        p_client: o.clientId, p_lead: o.leadId, p_responsible: responsible, p_policy: o.policyId,
        p_title: `Reunião online — ${o.name || o.phone} (${person})`,
        p_description: `Agendada pela Helena via WhatsApp. Contato: ${o.phone}. Com: ${person}.`,
      });
      if (error || !data) { console.error('agenda_booking_failed', error?.code); return unavailable; }
      if (data.status === 'booked' && data.id) {
        const who = data.who === 'dra' ? 'Dra. Suzanne' : 'assessora Gláucia';
        const label = typeof data.label === 'string' ? data.label : '';
        const confirmed = /^(.+), às (\d{1,2}h(?:\d{2})?)$/.exec(label);
        if (!confirmed) return unavailable;
        const reply = receptionMessages.schedule_confirmed
          .replace('{date}', () => confirmed[1])
          .replace('{time}', () => confirmed[2]);
        return { reply: `${reply}\nReunião online com a ${who}.`, idempotencyKey: `helena-booking:${data.id}` };
      }
      if (!['unavailable', 'expired'].includes(data.status)) return unavailable;
    }
    if (choice && o.dryRun) return { reply: `Simulação de agendamento para ${choice.label}. Nenhum horário foi reservado.` };

    const hol = await holidaySet(a, o.orgId);
    const now = new Date(), to = new Date(now.getTime() + 25 * 86400000).toISOString();
    const { data: busy, error: calendarError } = await a.from('calendar_events')
      .select('starts_at,ends_at,all_day,event_type').eq('org_id', o.orgId)
      .neq('status', 'cancelled').lt('starts_at', to)
      .or(`ends_at.gt.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${new Date(now.getTime() - 3600000).toISOString()})`).limit(500);
    if (calendarError || (busy || []).length >= 500) return unavailable;
    const who = wantsAssessor(o.message) ? 'glaucia' : offered[0]?.who || 'dra';
    const slots = computeSlots(now, who, busy || [], hol);
    if (!slots.length) return { reply: receptionMessages.schedule_unavailable };
    if (!o.dryRun) {
      const { error: saveError } = await a.from('whatsapp_conversations')
        .update({ chatbot_context: { ...(o.ctx || {}), offered_slots: slots, offered_at: now.getTime() }, updated_at: now.toISOString() })
        .eq('id', o.conversationId).eq('org_id', o.orgId).eq('bot_ativo', true).select('id').single();
      if (saveError) return unavailable;
    }
    const person = who === 'dra' ? 'Dra. Suzanne' : 'assessora Gláucia';
    const intro = choice ? 'O horário escolhido não está mais disponível.\n\n' : '';
    return { reply: `${intro}Horários para reunião online com a ${person} (horário de Brasília):\n\n${slots.map((slot, n) => `${n + 1}) ${slot.label}`).join('\n')}\n\nQual opção você prefere?`, slots };
  } catch (error) { console.error('agenda_tool_failed', error instanceof Error ? error.name : 'unknown'); return unavailable; }
}

// v77 (12/11/2026): cliente pede para falar com a Dra. -> Helena diz que ela está em atendimento e mostra dois botões
// (deixar mensagem pelo aplicativo / agendar reunião). Pedido da Dra. Suzanne.
export const CLIENT_APP_URL = 'https://lexoffice.univittagroup.com.br/cliente';
const LAWYER_TALK_RE = /(falar com (a |o )?(dra|doutora|dr|doutor|advogad[ao]|suzanne|humano|atendente|pessoa|alguem|equipe)|quero (um |uma )?(humano|atendente|pessoa)|atendimento humano|me liga|me ligue|liga (pra|para) mim|ligar (pra|para) mim|pode me ligar|me telefona|(chama|chamar|passa|passar) (a |pra |para a? ?)?(dra|doutora|suzanne|advogada))/;
export function lawyerTalkRequest(message: string): boolean {
  const t = norm(message).trim();
  if (!t || /^a cliente selecionou:/.test(t) || /^\[o cliente enviou/.test(t)) return false;
  return LAWYER_TALK_RE.test(t);
}
export const LAWYER_BUTTONS = [{ id: 'falar_app', title: '\u{1F4F1} Mensagem pelo app' }, { id: 'falar_reuniao', title: '\u{1F4C6} Agendar reunião' }];
const plainText = (s: string) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const isAppChoice = (message: string) => plainText(message) === 'mensagem pelo app';
export const LAWYER_BUSY_FALLBACK = 'A Dra. Suzanne está em atendimento neste momento.\n\nVocê pode deixar sua mensagem para ela pelo aplicativo ou agendar uma reunião online.';

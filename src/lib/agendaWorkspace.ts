export const OFFICE_ZONE = 'America/Sao_Paulo';
export const PAGE_SIZE = 25;
export const CANCELLED = ['cancelled', 'canceled', 'cancelada', 'cancelado'];
export const COMPLETED = ['completed', 'realizada', 'realizado', 'concluida', 'concluido', 'done'];
export const HEARING_CHECKLIST = ['Conferir petição inicial, contestação e decisões', 'Identificar fatos controvertidos e ônus da prova', 'Revisar documentos e possíveis contradições', 'Conferir rol e disponibilidade de testemunhas', 'Preparar perguntas para partes e testemunhas', 'Verificar poderes para acordo e limites autorizados', 'Confirmar endereço ou link, horário, documentos e equipamentos'];
export function officeDay(value: Date | string = new Date()) { const date = new Date(value); if (!Number.isFinite(date.getTime()))
    return ''; const parts = new Intl.DateTimeFormat('en-CA', { timeZone: OFFICE_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date); const part = (key: string) => parts.find(item => item.type === key)?.value || ''; return `${part('year')}-${part('month')}-${part('day')}`; }
export function addDays(day: string, n: number) { const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10); }
export function officeInput(value?: string | null) { if (!value)
    return ''; const d = new Date(value); if (!Number.isFinite(d.getTime()))
    return ''; const parts = new Intl.DateTimeFormat('en-CA', { timeZone: OFFICE_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d); const p = (key: string) => parts.find(item => item.type === key)?.value || ''; return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`; }
export function fromOfficeInput(value: string) { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Informe uma data e um horário válidos.'); const wanted = Date.parse(value + 'Z'); let stamp = wanted; for (let i = 0; i < 3; i++) {
    const shown = Date.parse(officeInput(new Date(stamp).toISOString()) + 'Z');
    stamp += wanted - shown;
} if (!Number.isFinite(stamp) || officeInput(new Date(stamp).toISOString()) !== value)
    throw new Error('Data ou horário inválido.'); return new Date(stamp).toISOString(); }
export function officeDate(value?: string | null) { if (!value)
    return 'Não informado'; const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', { timeZone: OFFICE_ZONE, dateStyle: 'short', timeStyle: 'short' }) : 'Data inválida'; }
export function dateOnly(value?: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : 'Sem data'; }
export function cancelled(status?: string | null) { return CANCELLED.includes((status || '').toLowerCase()); }
export function completed(status?: string | null) { return COMPLETED.includes((status || '').toLowerCase()); }
export function hearingStatus(status?: string | null) { return cancelled(status) ? 'Cancelada' : completed(status) ? 'Realizada' : status === 'confirmed' ? 'Confirmada' : status === 'postponed' ? 'Adiada' : status === 'scheduled' || !status ? 'Agendada' : status; }
export function taskBucket(task: {
    done_at?: string | null;
    due_date?: string | null;
}, today = officeDay()) { return task.done_at ? 'completed' : !task.due_date ? 'undated' : task.due_date < today ? 'late' : task.due_date === today ? 'today' : 'upcoming'; }
export function taskCompletion(done: boolean) { return { done_at: done ? new Date().toISOString() : null }; }
export function safeMeetingUrl(value?: string | null) { try {
    const url = new URL(value || '');
    return url.protocol === 'https:' ? url.href : null;
}
catch {
    return null;
} }
/** Read all lookup/month rows without silently hiding records beyond Supabase's page limit. */
export async function readAll<T = any>(query: () => any, maximum = 10000): Promise<T[]> { const rows: T[] = []; for (let offset = 0; offset < maximum; offset += 500) {
    const result = await query().range(offset, offset + 499);
    if (result.error)
        throw new Error(result.error.message || 'Consulta indisponível.');
    rows.push(...(result.data || []));
    if ((result.data || []).length < 500)
        return rows;
} throw new Error('A consulta excedeu 10 mil registros. Refine o período antes de continuar.'); }
export type HearingPreparation = {
    checked: number[];
    brief: string;
    generatedAt: string | null;
};
export const emptyPreparation = (): HearingPreparation => ({ checked: [], brief: '', generatedAt: null });
export const preparationKey = (org: string, user: string, id: string) => `lexoffice:hearing-preparation:v1:${encodeURIComponent(org)}:${encodeURIComponent(user)}:${encodeURIComponent(id)}`;
export function readPreparation(key: string): HearingPreparation { const raw = localStorage.getItem(key); if (!raw)
    return emptyPreparation(); const data = JSON.parse(raw); if (!Array.isArray(data.checked) || typeof data.brief !== 'string')
    throw new Error('Preparação local inválida.'); return { checked: data.checked.filter((i: any) => Number.isInteger(i) && i >= 0 && i < HEARING_CHECKLIST.length), brief: data.brief, generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : null }; }
export function savePreparation(key: string, value: HearingPreparation) { localStorage.setItem(key, JSON.stringify(value)); }
export type CalendarRecord = {
    id: string;
    title: string;
    starts_at: string;
    status?: string | null;
    event_type?: string | null;
    description?: string | null;
    location?: string | null;
    process_id?: string | null;
    source?: 'calendar' | 'hearing' | 'task';
    sourceId?: string;
    [key: string]: any;
};
/** Prefer a linked hearing over an old calendar mirror, while retaining unrelated events. */
export function composeCalendar(events: CalendarRecord[], hearings: CalendarRecord[], tasks: any[]): CalendarRecord[] {
    const eventIds = new Set(events.map(e => e.id));
    const mirrored = (event: CalendarRecord) => hearings.some(h => h.id === event.id && !h.source_calendar_event_id);
    const canonicalHearings = hearings.filter(h => !h.source_calendar_event_id || !eventIds.has(h.source_calendar_event_id));
    return [...events.filter(e => !mirrored(e)).map(e => ({ ...e, source: 'calendar' as const, sourceId: e.id })), ...canonicalHearings.map(h => ({ ...h, id: 'hearing:' + h.id, source: 'hearing' as const, sourceId: h.id, event_type: 'hearing' })), ...tasks.filter(t => t.due_date).map(t => ({ id: 'task:' + t.id, source: 'task' as const, sourceId: t.id, title: t.title, description: t.notes, starts_at: fromOfficeInput(t.due_date + 'T12:00'), event_type: 'task', status: t.done_at ? 'completed' : 'scheduled', allDay: true }))].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** Keep each visible page grouped by work urgency without mutating query results. */
export function orderTaskPage<T extends {done_at?:string|null;due_date?:string|null;priority?:string}>(rows:T[],today=officeDay()):T[]{const groups:Record<string,number>={today:0,late:1,upcoming:2,undated:3,completed:4};const priorities:Record<string,number>={urgente:0,urgent:0,alta:1,high:1,normal:2,baixa:3};return [...rows].sort((a,b)=>groups[taskBucket(a,today)]-groups[taskBucket(b,today)]||(a.due_date||'').localeCompare(b.due_date||'')||(priorities[a.priority||'normal']??2)-(priorities[b.priority||'normal']??2));}

import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Search, Plus, RefreshCw, Clock3, AlertTriangle, Scale, Video, MapPin, FileText, Cloud, Sparkles, ExternalLink, ChevronLeft, ChevronRight, X } from 'lucide-react';
import InternalNavigation from '../components/InternalNavigation';
import { supabase } from '../lib/supabase';
import { useConfirmNavigation } from '../lib/useConfirmNavigation';
import { confirmDiscard } from '../lib/ux';
import { HEARING_CHECKLIST, CANCELLED, COMPLETED, PAGE_SIZE, officeDay, addDays, officeInput, fromOfficeInput, officeDate, dateOnly, hearingStatus, safeMeetingUrl, readAll, preparationKey, readPreparation, savePreparation, emptyPreparation, type HearingPreparation } from '../lib/agendaWorkspace';
import './process-workspace.css';
import './agenda-workspace.css';
type Hearing = {
    id: string;
    process_id: string | null;
    title: string | null;
    hearing_type: string | null;
    starts_at: string;
    location: string | null;
    meeting_url: string | null;
    notes: string | null;
    status: string | null;
    source_calendar_event_id?: string | null;
};
type Process = {
    id: string;
    client_id?: string | null;
    cnj_number: string | null;
    internal_number: string | null;
    subject: string | null;
    clients?: {
        name: string;
    } | {
        name: string;
    }[] | null;
};
type Draft = {
    id: string;
    title: string;
    process_id: string;
    hearing_type: string;
    starts_at: string;
    location: string;
    meeting_url: string;
    notes: string;
    status: string;
};
const caseClient = (p?: Process) => Array.isArray(p?.clients) ? p?.clients[0]?.name : p?.clients?.name;
const columns = 'id,process_id,title,hearing_type,starts_at,location,meeting_url,notes,status,source_calendar_event_id';
function applyView(q: any, view: string, today: string) {
    const start = fromOfficeInput(today + 'T00:00');
    if (view === 'cancelled')
        return q.in('status', CANCELLED);
    if (view === 'history')
        return q.or(`and(starts_at.lt.${start},or(status.is.null,status.not.in.(${CANCELLED.join(',')}))),status.in.(${COMPLETED.join(',')})`);
    return q.gte('starts_at', start).or(`status.is.null,status.not.in.(${[...CANCELLED, ...COMPLETED].join(',')})`);
}
export default function Hearings() {
    const [params, setParams] = useSearchParams();
    const selectedId = params.get('audiencia');
    const section = params.get('secao') || 'preparacao';
    const [orgId, setOrgId] = useState(''), [userId, setUserId] = useState(''), [processes, setProcesses] = useState<Record<string, Process>>({}), [items, setItems] = useState<Hearing[]>([]), [selected, setSelected] = useState<Hearing | null>(null), [draft, setDraft] = useState<Draft | null>(null), [initial, setInitial] = useState(''), [preparation, setPreparation] = useState<HearingPreparation>(emptyPreparation), [view, setView] = useState('upcoming'), [query, setQuery] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [kind, setKind] = useState('all'), [missing, setMissing] = useState(false), [page, setPage] = useState(0), [total, setTotal] = useState(0), [counts, setCounts] = useState<Record<string, number | null>>({ today: null, week: null, missing: null }), [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0), [generating, setGenerating] = useState<string | null>(null), [briefError, setBriefError] = useState('');
    const request = useRef(0), locked = useRef(false);
    const dirty = !!draft && JSON.stringify(draft) !== initial;
    useConfirmNavigation(dirty);
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const auth = await supabase.auth.getUser();
                if (auth.error || !auth.data.user)
                    throw new Error('Entre novamente para consultar as audiências.');
                const profile = await supabase.from('profiles').select('org_id').eq('id', auth.data.user.id).maybeSingle();
                if (profile.error || !profile.data?.org_id)
                    throw new Error('Escritório não identificado.');
                const officeId = profile.data.org_id;
                const cases = await readAll<Process>(() => supabase.from('processes').select('id,client_id,cnj_number,internal_number,subject,clients(name)').eq('org_id', officeId).order('id'));
                if (active) {
                    setProcesses(Object.fromEntries(cases.map(p => [p.id, p])));
                    setUserId(auth.data.user.id);
                    setOrgId(officeId);
                }
            }
            catch (err) {
                if (active) {
                    setError(err instanceof Error ? err.message : 'Falha ao carregar a pauta.');
                    setLoading(false);
                }
            }
        })();
        return () => { active = false; };
    }, []);
    useEffect(() => {
        if (!orgId)
            return;
        const run = ++request.current;
        const timer = setTimeout(() => void load(run), 200);
        return () => { clearTimeout(timer); request.current++; };
    }, [orgId, view, query, from, to, kind, missing, page, refresh]);
    async function load(run: number) {
        setLoading(true);
        setError('');
        try {
            const today = officeDay();
            const base = () => supabase.from('process_hearings').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
            let q = applyView(supabase.from('process_hearings').select(columns, { count: 'exact' }).eq('org_id', orgId), view, today);
            if (missing)
                q = q.or('and(or(location.is.null,location.eq.),or(meeting_url.is.null,meeting_url.eq.))');
            if (from)
                q = q.gte('starts_at', fromOfficeInput(from + 'T00:00'));
            if (to)
                q = q.lt('starts_at', fromOfficeInput(addDays(to, 1) + 'T00:00'));
            if (from && to && from > to)
                throw new Error('O início do período deve ser anterior ao fim.');
            if (kind !== 'all')
                q = q.eq('hearing_type', kind);
            const term = query.replace(/[(),%_*]/g, ' ').trim();
            if (term) {
                const ids = Object.values(processes).filter(p => [p.cnj_number, p.internal_number, p.subject, caseClient(p)].some(v => v?.toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR')))).map(p => p.id);
                q = q.or(`title.ilike.%${term}%,location.ilike.%${term}%${ids.length ? `,process_id.in.(${ids.join(',')})` : ''}`);
            }
            q = q.order('starts_at', { ascending: view === 'upcoming' }).order('id');
            const [result, ...stats] = await Promise.all([q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1), applyView(base(), 'upcoming', today).lt('starts_at', fromOfficeInput(addDays(today, 1) + 'T00:00')), applyView(base(), 'upcoming', today).lt('starts_at', fromOfficeInput(addDays(today, 7) + 'T00:00')), applyView(base(), 'upcoming', today).or('and(or(location.is.null,location.eq.),or(meeting_url.is.null,meeting_url.eq.))')]);
            if (run !== request.current)
                return;
            if (result.error || result.count === null)
                throw new Error(result.error?.message || 'Contagem indisponível.');
            setItems(result.data || []);
            setTotal(result.count);
            setCounts(Object.fromEntries(['today', 'week', 'missing'].map((key, i) => [key, stats[i].error ? null : stats[i].count])));
            if (stats.some(s => s.error))
                setError('Parte dos indicadores está indisponível.');
            if (page > 0 && page * PAGE_SIZE >= result.count)
                setPage(0);
        }
        catch (err) {
            if (run === request.current) {
                setError(err instanceof Error ? err.message : 'Não foi possível consultar a pauta.');
                setItems([]);
                setTotal(0);
                setCounts({ today: null, week: null, missing: null });
            }
        }
        finally {
            if (run === request.current)
                setLoading(false);
        }
    }
    function edit(row: Hearing) { const next = { id: row.id, title: row.title || '', process_id: row.process_id || '', hearing_type: row.hearing_type || 'Conciliação', starts_at: officeInput(row.starts_at), location: row.location || '', meeting_url: row.meeting_url || '', notes: row.notes || '', status: row.status || 'scheduled' }; setDraft(next); setInitial(JSON.stringify(next)); }
    useEffect(() => {
        if (!orgId || !selectedId) {
            setSelected(null);
            return;
        }
        let active = true;
        setDetailLoading(true);
        setBriefError('');
        setPreparation(emptyPreparation());
        (async () => {
            try {
                const result = await supabase.from('process_hearings').select(columns).eq('id', selectedId).eq('org_id', orgId).maybeSingle();
                if (result.error || !result.data)
                    throw new Error(result.error?.message || 'Audiência indisponível ou sem acesso.');
                if (!active)
                    return;
                setSelected(result.data);
                edit(result.data);
                try {
                    setPreparation(readPreparation(preparationKey(orgId, userId, selectedId)));
                }
                catch {
                    setNotice('Não foi possível ler a preparação salva neste navegador.');
                }
            }
            catch (err) {
                if (active) {
                    setSelected(null);
                    setNotice(err instanceof Error ? err.message : 'Consulta indisponível.');
                }
            }
            finally {
                if (active)
                    setDetailLoading(false);
            }
        })();
        return () => { active = false; };
    }, [orgId, userId, selectedId]);
    function choose(row: Hearing) {
        if (locked.current || generating || dirty && !confirmDiscard())
            return;
        setDraft(null);
        setNotice('');
        setParams({ audiencia: row.id, secao: 'preparacao' });
    }
    useEffect(() => {
        if (orgId && params.get('novo') === '1')
            newHearing();
    }, [orgId, params]);
    function newHearing() {
        if (locked.current || dirty && !confirmDiscard())
            return;
        setParams({});
        setSelected(null);
        const next: Draft = { id: '', title: '', process_id: '', hearing_type: 'Conciliação', starts_at: '', location: '', meeting_url: '', notes: '', status: 'scheduled' };
        setDraft(next);
        setInitial(JSON.stringify(next));
        setNotice('');
    }
    function back() {
        if (locked.current || generating || dirty && !confirmDiscard())
            return;
        setParams({});
        setDraft(null);
        setSelected(null);
        setNotice('');
    }
    function storePreparation(next: HearingPreparation) {
        if (!selected)
            return;
        setPreparation(next);
        try {
            savePreparation(preparationKey(orgId, userId, selected.id), next);
            setNotice('Preparação salva neste navegador.');
        }
        catch {
            setNotice('Não foi possível salvar a preparação neste navegador. Mantenha a tela aberta e baixe o dossiê para preservar o texto.');
        }
    }
    async function save() {
        if (!draft || locked.current)
            return;
        if (selected?.source_calendar_event_id) {
            setNotice('Esta audiência é vinculada a um compromisso da Agenda. Abra o cadastro de origem para editar.');
            return;
        }
        if (!draft.title.trim() || !draft.starts_at) {
            setNotice('Preencha o título, a data e o horário.');
            return;
        }
        if (!draft.id && !draft.process_id) {
            setNotice('Vincule um processo para agendar a audiência.');
            return;
        }
        if (draft.meeting_url && !safeMeetingUrl(draft.meeting_url)) {
            setNotice('Informe um link de videoconferência HTTPS válido.');
            return;
        }
        locked.current = true;
        setBusy(true);
        setNotice('');
        try {
            const starts_at = fromOfficeInput(draft.starts_at);
            const payload = { org_id: orgId, title: draft.title.trim(), process_id: draft.process_id || null, client_id: processes[draft.process_id]?.client_id || null, hearing_type: draft.hearing_type, starts_at, location: draft.location.trim() || null, meeting_url: draft.meeting_url.trim() || null, notes: draft.notes.trim() || null, status: draft.status };
            const result = draft.id ? await supabase.from('process_hearings').update(payload).eq('id', draft.id).eq('org_id', orgId).select(columns) : await supabase.from('process_hearings').insert({ ...payload, owner_user_id: userId, created_by: userId }).select(columns);
            if (result.error || !result.data?.length)
                throw new Error(result.error?.message || 'O salvamento não foi confirmado.');
            const row = result.data[0];
            setSelected(row);
            edit(row);
            setParams({ audiencia: row.id, secao: 'logistica' });
            setRefresh(v => v + 1);
            setNotice('Audiência salva no cadastro principal. O calendário exibirá o mesmo registro.');
        }
        catch (err) {
            setNotice(err instanceof Error ? err.message : 'Não foi possível salvar. Seus dados foram preservados.');
        }
        finally {
            locked.current = false;
            setBusy(false);
        }
    }
    async function generateBrief(h: Hearing) {
        if (!supabase || !h.process_id || !orgId) {
            setBriefError('Vincule a audiência a um processo antes de gerar o dossiê.');
            return;
        }
        ;
        if (generating)
            return;
        setGenerating(h.id);
        setBriefError('');
        try {
            const [pr, m, d, j, docs] = await Promise.all([
                supabase.from('processes').select('cnj_number,internal_number,subject,area,vara,comarca,court,opposing_party,class_name,clients(name)').eq('id', h.process_id).eq('org_id', orgId).maybeSingle(),
                supabase.from('process_movements').select('movement_date,title,description').eq('process_id', h.process_id).eq('org_id', orgId).order('movement_date', { ascending: false }).limit(35),
                supabase.from('process_deadlines').select('title,due_at,status,description').eq('process_id', h.process_id).eq('org_id', orgId).order('due_at', { ascending: true }).limit(30),
                supabase.from('process_judge_analyses').select('result,created_at,sample_size').eq('process_id', h.process_id).eq('org_id', orgId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
                supabase.from('documents').select('name,category,created_at').eq('process_id', h.process_id).eq('org_id', orgId).order('created_at', { ascending: false }).limit(80)
            ]);
            const errors = [pr, m, d, j, docs].map(x => x.error).filter(Boolean);
            if (errors.length)
                throw errors[0];
            if (!pr.data)
                throw new Error('Processo não encontrado ou sem acesso.');
            const source = { audiencia: { data: h.starts_at, tipo: h.hearing_type, titulo: h.title, local: h.location, observacoes: h.notes }, processo: pr.data, andamentos: m.data || [], prazos: d.data || [], perfil_do_juizo: j.data?.result || null, amostra_perfil_juizo: j.data?.sample_size || null, documentos_disponiveis_apenas_metadados: docs.data || [] };
            const result = await supabase.functions.invoke('ai-provider-gateway', { body: { org_id: orgId, purpose: 'process_dossier', instructions: 'Você prepara um Dossiê Estratégico de Audiência para revisão exclusiva da advogada. Use SOMENTE os dados fornecidos. Não afirme ter lido o conteúdo de documentos quando apenas nomes/metadados estão disponíveis. Não invente depoimentos, provas, pedidos, decisões, comportamento do magistrado ou jurisprudência. Responda em português jurídico, estruturado com seções: 1. Identificação e logística; 2. Síntese do processo e cronologia; 3. Pontos controvertidos confirmados e pontos a conferir nos autos; 4. Provas favoráveis e contrárias efetivamente identificáveis; 5. Contradições identificadas com referência ao dado de origem; 6. Perfil do juízo (distinguir observação estatística de fato e informar limites da amostra); 7. Perguntas SUGERIDAS para partes e testemunhas, condicionadas à confirmação dos fatos e da pertinência; 8. Estratégia e riscos a conferir; 9. Acordo: critérios e limites a validar, sem inventar valores; 10. Checklist de véspera e dia. Em cada seção com dados insuficientes, registrar expressamente Não identificado nos dados disponíveis e quais documentos faltam. Não prometer resultado. Não criar perguntas que pressuponham fatos não comprovados.', input: JSON.stringify(source) } });
            if (result.error || !result.data?.ok || !result.data?.text)
                throw result.error || new Error(result.data?.error || 'A IA não retornou o dossiê.');
            storePreparation({ ...preparation, brief: String(result.data.text), generatedAt: new Date().toISOString() });
        }
        catch (e: any) {
            setBriefError(e?.message || 'Erro ao preparar dossiê.');
        }
        finally {
            setGenerating(null);
        }
    }
    function downloadBrief() {
        if (!selected || !preparation.brief)
            return;
        const blob = new Blob([preparation.brief], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dossie-audiencia-' + officeDay(selected.starts_at) + '.txt';
        link.click();
        URL.revokeObjectURL(url);
    }
    function change(fn: () => void) { setPage(0); fn(); }
    const chosen = selected?.process_id ? processes[selected.process_id] : undefined;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const editing = !!draft && !draft.id;
    const detail = !!selectedId || editing;
    const form = draft && <form className="work-form" onSubmit={e => { e.preventDefault(); void save(); }}><label>Título<input required maxLength={300} value={draft.title} disabled={busy || !!generating} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label><label>Processo<select required={!draft.id} value={draft.process_id} disabled={busy || !!generating} onChange={e => setDraft({ ...draft, process_id: e.target.value })}><option value="">Selecione um processo</option>{Object.values(processes).map(p => <option key={p.id} value={p.id}>{p.cnj_number || p.internal_number || p.subject} · {caseClient(p) || 'Cliente não identificado'}</option>)}{draft.process_id && !processes[draft.process_id] && <option value={draft.process_id}>Vínculo atual · processo não disponível</option>}</select></label><div className="work-form-grid"><label>Tipo<select value={draft.hearing_type} disabled={busy || !!generating} onChange={e => setDraft({ ...draft, hearing_type: e.target.value })}>{[...new Set(['Conciliação', 'Instrução e julgamento', 'Una', 'Mediação', 'Outra', draft.hearing_type])].map(type => <option key={type}>{type}</option>)}</select></label><label>Data e horário · Brasília<input type="datetime-local" required value={draft.starts_at} disabled={busy || !!generating} onChange={e => setDraft({ ...draft, starts_at: e.target.value })}/></label></div><label>Local ou endereço<input value={draft.location} disabled={busy || !!generating} maxLength={1000} onChange={e => setDraft({ ...draft, location: e.target.value })}/></label><label>Link da sala virtual<input type="url" placeholder="https://" value={draft.meeting_url} disabled={busy || !!generating} maxLength={2000} onChange={e => setDraft({ ...draft, meeting_url: e.target.value })}/></label><label>Situação<select value={draft.status} disabled={busy || !!generating} onChange={e => setDraft({ ...draft, status: e.target.value })}>{[...new Set(['scheduled', 'confirmed', 'completed', 'cancelled', draft.status])].map(status => <option key={status} value={status}>{hearingStatus(status)}</option>)}</select></label><label>Observações e resultado<textarea rows={5} maxLength={10000} value={draft.notes} disabled={busy || !!generating} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label><div className="work-form-actions"><button className="primary" disabled={busy || !!generating || !draft.title.trim()}>{busy ? 'Salvando…' : 'Salvar audiência'}</button></div></form>;
    const prepLabels = ['Conferir peças e decisões', 'Identificar fatos controvertidos', 'Revisar documentos', 'Confirmar testemunhas', 'Preparar perguntas', 'Validar limites de acordo', 'Confirmar local e equipamentos'];
    const groupLabel = (value: string) => { const day = officeDay(value), today = officeDay(); return day === today ? 'Hoje, ' + new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long' }) : day === addDays(today, 1) ? 'Amanhã, ' + new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long' }) : new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' }); };
    return <div className="process-workspace agenda-workspace hearing-approved">
      <header className="process-page-heading"><div><h1>Audiências</h1><p>Sua pauta organizada. Preparação no momento certo.</p></div><div className="process-heading-actions"><Link className="secondary" to="/agenda"><CalendarDays size={17}/>Calendário</Link><button className="primary" disabled={!orgId || busy || !!generating} onClick={newHearing}><Plus size={17}/>Agendar audiência</button></div></header>
      {notice && <p className="process-notice" role="status">{notice}</p>}{briefError && <p className="process-error" role="alert">{briefError}</p>}
      <div className={`approved-workspace ${detail ? 'has-panel' : ''}`}>
      <div className="approved-main">
        <div className="work-metrics hearing-metrics">{[['today', 'Hoje', CalendarDays], ['week', 'Próximos 7 dias', Clock3], ['missing', 'Sem local e sem link', AlertTriangle]].map(([value, label, Icon]) => { const key = String(value), MetricIcon = Icon as typeof CalendarDays; return <button key={key} aria-pressed={key === 'missing' ? missing : key === 'today' ? from === officeDay() && to === officeDay() : from === officeDay() && to === addDays(officeDay(), 6)} onClick={() => change(() => { setView('upcoming'); setFrom(key === 'today' || key === 'week' ? officeDay() : ''); setTo(key === 'today' ? officeDay() : key === 'week' ? addDays(officeDay(), 6) : ''); setMissing(key === 'missing'); })}><MetricIcon size={23}/><div><span>{String(label)}</span><strong>{loading ? '—' : counts[key] ?? '—'}</strong></div></button>; })}</div>
        <InternalNavigation label="Visões de audiências">{[['upcoming', 'Próximas'], ['history', 'Histórico'], ['cancelled', 'Canceladas']].map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => change(() => { setView(key); setMissing(false); setFrom(''); setTo(''); })}>{label}</button>)}</InternalNavigation>
        <div className="work-filters approved-filter-bar"><label className="process-search"><Search size={17}/><input aria-label="Buscar audiências" value={query} onChange={e => change(() => setQuery(e.target.value))} placeholder="Buscar cliente ou processo"/></label><details className="work-filter-disclosure"><summary><CalendarDays size={16}/>{from || to ? `${from ? dateOnly(from) : 'Início'} a ${to ? dateOnly(to) : 'fim'}` : 'Período'}</summary><div><label>De<input type="date" value={from} onChange={e => change(() => setFrom(e.target.value))}/></label><label>Até<input type="date" value={to} onChange={e => change(() => setTo(e.target.value))}/></label></div></details><select aria-label="Tipo de audiência" value={kind} onChange={e => change(() => setKind(e.target.value))}><option value="all">Todos os tipos</option>{['Conciliação', 'Instrução e julgamento', 'Una', 'Mediação', 'Outra'].map(k => <option key={k}>{k}</option>)}</select><button className="secondary approved-refresh" aria-label="Atualizar pauta" disabled={loading} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={16}/></button></div>
        {(query || from || to || kind !== 'all' || missing) && <button className="process-text-button" onClick={() => change(() => { setQuery(''); setFrom(''); setTo(''); setKind('all'); setMissing(false); })}><X size={14}/>Limpar filtros{missing ? ' · Sem local e sem link' : ''}</button>}
        {error && <p className="process-error" role="alert">{error}</p>}
        <section className="hearing-pauta" aria-label="Pauta de audiências">
          {loading ? <div className="process-empty" role="status">Consultando pauta…</div> : items.length === 0 ? <div className="process-panel process-empty"><CalendarDays size={30}/><h2>{error ? 'Consulta indisponível' : 'Nenhuma audiência nesta busca'}</h2><p>Confira o período ou agende uma audiência.</p></div> : items.map((h, index) => { const p = h.process_id ? processes[h.process_id] : undefined; return <Fragment key={h.id}>{(index === 0 || officeDay(items[index - 1].starts_at) !== officeDay(h.starts_at)) && <h2 className="work-group-heading">{groupLabel(h.starts_at)}</h2>}<article className={`hearing-pauta-row ${selectedId === h.id ? 'selected' : ''}`}><div className="hearing-time"><small>{new Date(h.starts_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' })}</small><strong>{new Date(h.starts_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</strong></div><button className="hearing-row-content" disabled={busy || !!generating} onClick={() => choose(h)} aria-pressed={selectedId === h.id}><div><strong>{h.title || h.hearing_type || 'Audiência'}</strong><small>{caseClient(p) || 'Cliente não identificado'} · {p?.cnj_number || p?.internal_number || 'Sem processo'}</small>{h.hearing_type && <small><Scale size={14}/>{h.hearing_type}</small>}</div><div className="hearing-row-place">{h.meeting_url ? <Video size={15}/> : <MapPin size={15}/>}<span>{h.meeting_url ? 'Sala virtual' : h.location || 'Local a confirmar'}</span></div><div className="hearing-row-status"><span className={`movement-state ${h.status === 'confirmed' ? 'confirmed' : !h.location && !h.meeting_url ? 'review' : 'muted'}`}>{!h.location && !h.meeting_url ? 'Sem local' : hearingStatus(h.status)}</span><span className="hearing-prepare-link"><FileText size={14}/>Preparar</span></div></button></article></Fragment>; })}
          <footer className="process-pagination"><span>{total ? `${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)} de ${total} audiências` : '0 audiências'}</span><div><button className="secondary" aria-label="Página anterior" disabled={page === 0 || loading} onClick={() => setPage(v => v - 1)}><ChevronLeft size={16}/></button>{page + 1} / {pages}<button className="secondary" aria-label="Próxima página" disabled={page + 1 >= pages || loading} onClick={() => setPage(v => v + 1)}><ChevronRight size={16}/></button></div></footer>
        </section><small className="work-scope-note">Indicadores do escritório antes dos filtros. A pauta inclui todo o dia de hoje · horário de Brasília.</small>
      </div>
      {detail && <aside className="process-panel approved-panel hearing-preparation-panel" aria-label={editing ? 'Agendar audiência' : 'Preparar audiência'}><div className="work-panel-heading"><div><h2>{editing ? 'Agendar audiência' : 'Preparar audiência'}</h2>{selected && <><p>{caseClient(chosen) || 'Cliente não identificado'} <small>· {chosen?.cnj_number || chosen?.internal_number || 'Sem processo'}</small></p><small>{officeDate(selected.starts_at)} · {selected.hearing_type || 'Audiência'}</small></>}</div><button className="work-close" aria-label="Fechar preparação" disabled={busy || !!generating} onClick={back}><X size={20}/></button></div>
        {detailLoading ? <p role="status">Consultando audiência…</p> : editing ? form : selected ? <>
        <InternalNavigation label="Seções da audiência">{[['preparacao', 'Preparação'], ['logistica', 'Logística']].map(([key, label]) => <button key={key} aria-pressed={section === key} disabled={busy || !!generating} onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.set('secao', key); return next; })}>{label}</button>)}</InternalNavigation>
        {section === 'preparacao' ? <div className="hearing-preparation-content"><small>{preparation.checked.length} de {HEARING_CHECKLIST.length} verificações concluídas</small><progress className="hearing-progress" value={preparation.checked.length} max={HEARING_CHECKLIST.length} aria-label="Progresso da preparação"/><div className="hearing-checklist">{HEARING_CHECKLIST.map((label, index) => <label key={label} title={label}><input type="checkbox" aria-label={label} checked={preparation.checked.includes(index)} disabled={!!generating} onChange={e => storePreparation({ ...preparation, checked: e.target.checked ? [...preparation.checked, index] : preparation.checked.filter(i => i !== index) })}/>{prepLabels[index]}</label>)}</div><p className="preparation-storage"><Cloud size={17}/>Salvo neste navegador · não compartilhado</p><div className="hearing-dossier"><h3>Dossiê estratégico</h3><p>Material de apoio para revisão da advogada.</p><button className="primary" disabled={!selected.process_id || !!generating || busy || dirty} onClick={() => void generateBrief(selected)}><Sparkles size={16}/>{generating ? 'Preparando dossiê…' : preparation.brief ? 'Gerar nova versão com IA' : 'Gerar dossiê com IA'}</button>{dirty && <small>Salve as alterações da audiência antes de gerar o dossiê.</small>}{preparation.brief && <><small>Gerado em {officeDate(preparation.generatedAt)}.</small><button className="secondary" onClick={downloadBrief}>Baixar texto do dossiê</button><details><summary>Ler dossiê e limites da análise</summary><p className="process-muted">A IA usa os registros disponíveis; metadados não equivalem à leitura integral dos autos.</p><pre className="hearing-brief">{preparation.brief}</pre></details></>}</div></div> : <>{dirty && <small className="work-dirty">Alterações não salvas</small>}{selected.source_calendar_event_id ? <><p className="process-muted">Esta audiência está vinculada a um compromisso. Edite sua origem para manter os dados consistentes.</p><Link className="primary" to={`/agenda?evento=${selected.source_calendar_event_id}`}>Editar compromisso de origem</Link></> : form}{safeMeetingUrl(selected.meeting_url) && <a className="secondary" href={safeMeetingUrl(selected.meeting_url)!} target="_blank" rel="noopener noreferrer">Entrar na sala<ExternalLink size={15}/></a>}</>}
        {selected.process_id && <footer className="hearing-context-actions"><Link to={`/processos/${selected.process_id}?secao=hearings`}><ExternalLink size={15}/>Abrir processo</Link><Link to={'/conducao-processual?processo=' + encodeURIComponent(selected.process_id)}><Scale size={15}/>Análise do juízo</Link><Link to={'/dossie/' + selected.process_id}><FileText size={15}/>Dossiê do processo</Link></footer>}
        </> : <p className="process-muted">A audiência não está disponível. Feche este painel para continuar.</p>}
      </aside>}
      </div>
    </div>;
}

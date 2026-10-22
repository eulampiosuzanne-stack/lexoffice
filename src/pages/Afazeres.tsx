import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, RefreshCw, ChevronLeft, ChevronRight, X, Check, CalendarDays } from 'lucide-react';
import InternalNavigation from '../components/InternalNavigation';
import { supabase } from '../lib/supabase';
import { useConfirmNavigation } from '../lib/useConfirmNavigation';
import { confirmDiscard } from '../lib/ux';
import { officeDay, officeDate, dateOnly, taskBucket, orderTaskPage, taskCompletion, readAll, PAGE_SIZE } from '../lib/agendaWorkspace';
import './process-workspace.css';
import './agenda-workspace.css';
const AREAS = ['Família', 'Sucessões', 'Cível', 'Consumidor', 'Bancário', 'Trabalhista', 'Criminal', 'Imobiliário', 'Saúde', 'Previdenciário', 'Tributário', 'Empresarial', 'Administrativo', 'Outros'];
const ATIVIDADES = ['Solicitar documento', 'Buscar ou retirar documento', 'Receber e conferir documento', 'Enviar documento para assinatura', 'Cobrar assinatura', 'Digitalizar documento', 'Elaborar petição inicial', 'Ajuizar ação', 'Protocolar manifestação', 'Contestação ou réplica', 'Interpor recurso', 'Cumprir despacho', 'Verificar andamento', 'Cumprir decisão', 'Agendar reunião', 'Realizar reunião', 'Retornar contato', 'Preparar consulta', 'Atualizar cliente', 'Contatar cartório ou gabinete', 'Elaborar contrato', 'Enviar contrato para assinatura', 'Preparar proposta', 'Conferir pagamento', 'Solicitar certidão', 'Providenciar procuração', 'Cumprir prazo processual', 'Outra atividade'];
type Task = {
    id: string;
    title: string;
    notes: string | null;
    due_date: string | null;
    responsible: string;
    assignee_user_id?: string | null;
    priority: string;
    done_at: string | null;
    created_at: string;
    client_id: string | null;
    external_person_name: string | null;
    law_area: string | null;
    activity_type: string | null;
    clients?: {
        name: string;
    } | {
        name: string;
    }[] | null;
};
type Draft = {
    id: string;
    title: string;
    notes: string;
    due_date: string;
    responsible: string;
    priority: string;
    client_id: string;
    external_person_name: string;
    law_area: string;
    activity_type: string;
    vinculo: string;
    done_at: string | null;
};
const blank = (): Draft => ({ id: '', title: '', notes: '', due_date: '', responsible: 'ambas', priority: 'normal', client_id: '', external_person_name: '', law_area: 'Família', activity_type: 'Solicitar documento', vinculo: 'interno', done_at: null });
const columns = 'id,title,notes,due_date,responsible,assignee_user_id,priority,done_at,created_at,law_area,activity_type,external_person_name,client_id,clients(name)';
const legacy: Record<string, string> = { suzanne: 'Suzanne', glaucia: 'Gláucia', ambas: 'Equipe / responsabilidade compartilhada' };
export default function Afazeres({ embedded = false }: {
    embedded?: boolean;
}) {
    const [params, setParams] = useSearchParams();
    const selectedId = embedded ? null : params.get('tarefa');
    const [rows, setRows] = useState<Task[]>([]), [clients, setClients] = useState<any[]>([]), [members, setMembers] = useState<any[]>([]), [org, setOrg] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0), [page, setPage] = useState(0), [total, setTotal] = useState(0), [query, setQuery] = useState(''), [view, setView] = useState('pending'), [bucket, setBucket] = useState('all'), [responsible, setResponsible] = useState('all'), [priority, setPriority] = useState('all'), [client, setClient] = useState('all'), [area, setArea] = useState('all'), [counts, setCounts] = useState<Record<string, number | null>>({ late: null, today: null, upcoming: null, undated: null }), [draft, setDraft] = useState<Draft | null>(null), [initial, setInitial] = useState(''), [quick, setQuick] = useState(''), [todayEvents, setTodayEvents] = useState<any[]>([]), [eventsError, setEventsError] = useState('');
    const serial = useRef(0), locked = useRef(false), panel = useRef<HTMLElement>(null);
    const dirty = !!draft && JSON.stringify(draft) !== initial;
    useConfirmNavigation(dirty);
    useEffect(() => { let active = true; (async () => { try {
        const auth = await supabase.auth.getUser();
        if (auth.error || !auth.data.user)
            throw new Error('Entre novamente para acessar as tarefas.');
        const profile = await supabase.from('profiles').select('org_id').eq('id', auth.data.user.id).maybeSingle();
        if (profile.error || !profile.data?.org_id)
            throw new Error('Escritório não identificado.');
        const orgId = profile.data.org_id;
        const [cs, ms] = await Promise.all([readAll(() => supabase.from('clients').select('id,name').eq('org_id', orgId).order('id')), readAll(() => supabase.from('profiles').select('id,name,status').eq('org_id', orgId).order('id'))]);
        if (active) {
            setClients(cs);
            setMembers(ms.filter(m => !['inactive', 'disabled'].includes(m.status)));
            setOrg(orgId);
        }
    }
    catch (err) {
        if (active) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar os responsáveis.');
            setLoading(false);
        }
    } })(); return () => { active = false; }; }, []);
    useEffect(() => { if (!org)
        return; const run = ++serial.current; const timer = setTimeout(() => void load(run), 200); return () => { clearTimeout(timer); serial.current++; }; }, [org, view, bucket, responsible, priority, client, area, query, page, refresh, embedded]);
    useEffect(() => { if (!org)
        return; const ch = supabase.channel('lexoffice-tasks-workspace').on('postgres_changes', { event: '*', schema: 'public', table: 'office_tasks', filter: `org_id=eq.${org}` }, () => setRefresh(v => v + 1)).subscribe(); return () => { void supabase.removeChannel(ch); }; }, [org]);
    useEffect(() => { if (!org || embedded)
        return; let active = true; (async () => { try {
        const day = officeDay();
        const { fromOfficeInput, addDays } = await import('../lib/agendaWorkspace');
        const result = await supabase.from('calendar_events').select('id,title,starts_at,status').eq('org_id', org).gte('starts_at', fromOfficeInput(day + 'T00:00')).lt('starts_at', fromOfficeInput(addDays(day, 1) + 'T00:00')).order('starts_at').limit(12);
        if (result.error)
            throw result.error;
        if (active) {
            setTodayEvents((result.data || []).filter(row => row.status !== 'cancelled'));
            setEventsError('');
        }
    }
    catch {
        if (active)
            setEventsError('Não foi possível consultar os compromissos de hoje.');
    } })(); return () => { active = false; }; }, [org, refresh, embedded]);
    async function load(run: number) { setLoading(true); setError(''); try {
        const today = officeDay();
        let q = supabase.from('office_tasks').select(columns, { count: 'exact' }).eq('org_id', org).eq('scope', 'geral');
        if (view === 'pending')
            q = q.is('done_at', null);
        if (view === 'completed')
            q = q.not('done_at', 'is', null);
        if (bucket !== 'all') {
            q = q.is('done_at', null);
            if (bucket === 'late')
                q = q.lt('due_date', today);
            if (bucket === 'today')
                q = q.eq('due_date', today);
            if (bucket === 'upcoming')
                q = q.gt('due_date', today);
            if (bucket === 'undated')
                q = q.is('due_date', null);
        }
        if (responsible !== 'all')
            q = responsible.startsWith('member:') ? q.eq('assignee_user_id', responsible.slice(7)) : q.is('assignee_user_id', null).in('responsible', responsible === 'ambas' ? ['ambas'] : [responsible, 'ambas']);
        if (priority !== 'all')
            q = q.in('priority', priority === 'alta' ? ['alta', 'high'] : priority === 'urgente' ? ['urgente', 'urgent'] : [priority]);
        if (client !== 'all')
            q = q.eq('client_id', client);
        if (area !== 'all')
            q = q.eq('law_area', area);
        const term = query.replace(/[(),%_*]/g, ' ').trim();
        if (term) {
            const ids = clients.filter(c => c.name.toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR'))).map(c => c.id);
            q = q.or(`title.ilike.%${term}%,notes.ilike.%${term}%,external_person_name.ilike.%${term}%${ids.length ? `,client_id.in.(${ids.join(',')})` : ''}`);
        }
        q = q.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).order('id');
        const base = () => supabase.from('office_tasks').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('scope', 'geral').is('done_at', null);
        const [result, ...stats] = await Promise.all([q.range(embedded ? 0 : page * PAGE_SIZE, embedded ? 5 : (page + 1) * PAGE_SIZE - 1), base().lt('due_date', today), base().eq('due_date', today), base().gt('due_date', today), base().is('due_date', null)]);
        if (run !== serial.current)
            return;
        if (result.error || result.count === null)
            throw new Error(result.error?.message || 'Contagem indisponível.');
        setRows(orderTaskPage(result.data || []));
        setTotal(result.count);
        setCounts(Object.fromEntries(['late', 'today', 'upcoming', 'undated'].map((key, i) => [key, stats[i].error ? null : stats[i].count])));
        if (stats.some(s => s.error))
            setError('Parte dos indicadores está indisponível.');
        if (page > 0 && page * PAGE_SIZE >= result.count)
            setPage(0);
    }
    catch (err) {
        if (run === serial.current) {
            setRows([]);
            setTotal(0);
            setCounts({ late: null, today: null, upcoming: null, undated: null });
            setError(err instanceof Error ? err.message : 'Não foi possível carregar as tarefas.');
        }
    }
    finally {
        if (run === serial.current)
            setLoading(false);
    } }
    function install(row?: Task) { const next: Draft = row ? { id: row.id, title: row.title, notes: row.notes || '', due_date: row.due_date || '', responsible: row.assignee_user_id ? 'member:' + row.assignee_user_id : row.responsible || 'ambas', priority: row.priority === 'high' ? 'alta' : row.priority === 'urgent' ? 'urgente' : row.priority || 'normal', client_id: row.client_id || '', external_person_name: row.external_person_name || '', law_area: row.law_area || 'Família', activity_type: row.activity_type || 'Outra atividade', vinculo: row.client_id ? 'cliente' : row.external_person_name ? 'externo' : 'interno', done_at: row.done_at } : blank(); setDraft(next); setInitial(JSON.stringify(next)); setNotice(''); requestAnimationFrame(() => panel.current?.focus()); }
    function open(row?: Task) { if (locked.current || dirty && !confirmDiscard())
        return; if (embedded)
        return; install(row); setParams(previous => { const next = new URLSearchParams(previous); if (row)
        next.set('tarefa', row.id);
    else
        next.delete('tarefa'); return next; }); }
    function close() { if (locked.current || dirty && !confirmDiscard())
        return; setDraft(null); setParams(previous => { const next = new URLSearchParams(previous); next.delete('tarefa'); return next; }); }
    useEffect(() => { if (!org || !selectedId || draft?.id === selectedId)
        return; let active = true; (async () => { const result = await supabase.from('office_tasks').select(columns).eq('id', selectedId).eq('org_id', org).eq('scope', 'geral').maybeSingle(); if (!active)
        return; if (result.error || !result.data) {
        setNotice('A tarefa selecionada não está disponível.');
        return;
    } install(result.data); })(); return () => { active = false; }; }, [org, selectedId]);
    async function save(event?: FormEvent) { event?.preventDefault(); const value = draft || { ...blank(), title: quick }; if (locked.current || !org)
        return; if (!value.title.trim() || value.title.trim().length > 300) {
        setNotice('Informe um título com até 300 caracteres.');
        return;
    } locked.current = true; setBusy(true); setNotice(''); try {
        const assignment = value.responsible.startsWith('member:');
        const payload = { org_id: org, scope: 'geral', title: value.title.trim(), notes: value.notes.trim() || null, due_date: value.due_date || null, responsible: assignment ? 'ambas' : value.responsible, assignee_user_id: assignment ? value.responsible.slice(7) : null, priority: value.priority, law_area: value.law_area, activity_type: value.activity_type, client_id: value.vinculo === 'cliente' ? value.client_id || null : null, external_person_name: value.vinculo === 'externo' ? value.external_person_name.trim() || null : null };
        const result = value.id ? await supabase.from('office_tasks').update(payload).eq('id', value.id).eq('org_id', org).eq('scope', 'geral').select('id') : await supabase.from('office_tasks').insert(payload).select('id');
        if (result.error || !result.data?.length)
            throw new Error(result.error?.message || 'O salvamento não foi confirmado.');
        setDraft(null);
        setQuick('');
        setParams(previous => { const next = new URLSearchParams(previous); next.delete('tarefa'); return next; });
        setNotice(value.id ? 'Tarefa atualizada.' : 'Tarefa criada.');
        setRefresh(v => v + 1);
    }
    catch (err) {
        setNotice(err instanceof Error ? err.message : 'Não foi possível salvar. Seus dados foram preservados.');
    }
    finally {
        locked.current = false;
        setBusy(false);
    } }
    async function toggle(row: Task) { if (locked.current)
        return; locked.current = true; setBusy(true); try {
        const payload = taskCompletion(!row.done_at);
        let update = supabase.from('office_tasks').update(payload).eq('id', row.id).eq('org_id', org).eq('scope', 'geral');
        update = row.done_at ? update.eq('done_at', row.done_at) : update.is('done_at', null);
        const result = await update.select('id');
        if (result.error || !result.data?.length)
            throw new Error(result.error?.message || 'A tarefa mudou. Atualize a lista.');
        setNotice(row.done_at ? 'Tarefa reaberta.' : 'Tarefa concluída.');
        if (draft?.id === row.id) {
            const next = { ...draft, ...payload };
            setDraft(next);
            setInitial(JSON.stringify(next));
        }
        setRefresh(v => v + 1);
    }
    catch (err) {
        setNotice(err instanceof Error ? err.message : 'Alteração não confirmada.');
    }
    finally {
        locked.current = false;
        setBusy(false);
    } }
    async function remove() { if (!draft?.id || locked.current || !window.confirm(`Excluir a tarefa “${draft.title}”?`))
        return; locked.current = true; setBusy(true); try {
        const result = await supabase.from('office_tasks').delete().eq('id', draft.id).eq('org_id', org).eq('scope', 'geral').select('id');
        if (result.error || !result.data?.length)
            throw new Error(result.error?.message || 'Exclusão não confirmada.');
        setDraft(null);
        setParams({});
        setNotice('Tarefa excluída.');
        setRefresh(v => v + 1);
    }
    catch (err) {
        setNotice(err instanceof Error ? err.message : 'Não foi possível excluir.');
    }
    finally {
        locked.current = false;
        setBusy(false);
    } }
    function change(callback: () => void) { setPage(0); callback(); }
    const who = (row: Task):string => row.assignee_user_id ? members.find(m => m.id === row.assignee_user_id)?.name || 'Integrante não disponível' : (row.responsible==='ambas'?'Equipe':legacy[row.responsible]) || 'Responsável não informado';
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const lateLabel=(date:string|null)=>{const days=Math.round((Date.parse(officeDay())-Date.parse(date||officeDay()))/86400000);return days===1?'Venceu ontem':`Venceu há ${days} dias`;};
    return <div className={`process-workspace agenda-workspace tasks-approved ${embedded?'work-embedded':''}`}>
 {!embedded && <header className="process-page-heading"><div><h1>Tarefas</h1><p>O trabalho do escritório, com prioridades e responsáveis claros.</p></div><div className="process-heading-actions"><button className="secondary" disabled={loading || busy} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={16}/>Atualizar</button><button className="primary" disabled={busy || !org} onClick={() => open()}><Plus size={16}/>Nova tarefa</button></div></header>}
 {embedded && <form className="work-filters" onSubmit={save}><label className="process-search"><input aria-label="Novo afazer" value={quick} maxLength={300} onChange={e => setQuick(e.target.value)} placeholder="Anotar uma tarefa"/></label><button className="primary" disabled={busy || !org}>Adicionar</button></form>}
 {error&&<p className="process-error" role="alert">{error}</p>}{notice&&<p className="process-notice" role="status">{notice}</p>}
 <div className={`approved-workspace ${draft?'has-panel':''}`}><div className="approved-main">
 {!embedded&&<><div className="work-metrics">{[['late', 'Atrasadas'], ['today', 'Hoje'], ['upcoming', 'Próximas'], ['undated', 'Sem data']].map(([key, label]) => <button key={key} aria-pressed={bucket === key} onClick={() => change(() => { setView('pending'); setBucket(bucket === key ? 'all' : key); })}><span>{label}</span><strong>{loading ? '—' : counts[key] ?? '—'}</strong></button>)}</div><InternalNavigation label="Situação das tarefas">{[['pending', 'Pendentes'], ['completed', 'Concluídas'], ['all', 'Todas']].map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => change(() => { setView(key); setBucket('all'); })}>{label}</button>)}</InternalNavigation><div className="work-filters approved-filter-bar"><label className="process-search"><Search size={17}/><input aria-label="Buscar tarefas" placeholder="Buscar tarefa ou cliente" value={query} onChange={e=>change(()=>setQuery(e.target.value))}/></label><select aria-label="Filtrar responsável" value={responsible} onChange={e=>change(()=>setResponsible(e.target.value))}><option value="all">Responsável: Todos</option>{members.map(m=><option key={m.id} value={'member:'+m.id}>{m.name||'Integrante da equipe'}</option>)}{Object.entries(legacy).map(([key,label])=><option key={key} value={key}>{label}{key==='ambas'?'':' · vínculo anterior'}</option>)}</select><details className="work-filter-disclosure task-filter-disclosure"><summary><SlidersHorizontal size={17}/>Filtros{priority!=='all'||client!=='all'||area!=='all'?' · ativos':''}</summary><div><label>Prioridade<select value={priority} onChange={e=>change(()=>setPriority(e.target.value))}><option value="all">Todas</option>{['baixa','normal','alta','urgente'].map(p=><option key={p} value={p}>{p[0].toUpperCase()+p.slice(1)}</option>)}</select></label><label>Cliente<select value={client} onChange={e=>change(()=>setClient(e.target.value))}><option value="all">Todos</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Área<select value={area} onChange={e=>change(()=>setArea(e.target.value))}><option value="all">Todas</option>{AREAS.map(a=><option key={a}>{a}</option>)}</select></label></div></details></div>{(bucket!=='all'||priority!=='all'||client!=='all'||area!=='all'||query||responsible!=='all')&&<button className="process-text-button" onClick={()=>change(()=>{setBucket('all');setPriority('all');setClient('all');setArea('all');setQuery('');setResponsible('all');})}><X size={14}/>Limpar filtros</button>}</>}
 <section className="work-list" aria-label="Lista de tarefas">{loading ? <div className="process-empty" role="status">Consultando tarefas…</div> : rows.length === 0 ? <div className="process-empty"><h2>{error ? 'Consulta indisponível' : 'Nenhuma tarefa nesta busca'}</h2><p>Ajuste os filtros ou crie uma tarefa para começar.</p></div> : rows.map((row,index) => { const state = taskBucket(row); return <Fragment key={row.id}>{!embedded&&(index===0||taskBucket(rows[index-1])!==state)&&<h2 className="work-group-heading task-group-heading">{state==='today'?'Hoje, '+new Date(officeDay()+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'numeric',month:'long'}):state==='late'?'Atrasadas':state==='upcoming'?'Próximas':state==='undated'?'Sem data':'Concluídas'}</h2>}<article className={`work-row ${row.done_at ? 'work-completed' : ''} ${draft?.id === row.id ? 'selected' : ''}`} key={row.id}><input type="checkbox" aria-label={`${row.done_at ? 'Reabrir' : 'Concluir'} tarefa ${row.title}`} checked={!!row.done_at} disabled={busy || dirty} onChange={() => void toggle(row)}/>{embedded ? <Link className="work-row-open" to={`/afazeres?tarefa=${row.id}`}><div><strong>{row.title}</strong><small>{who(row)} · {dateOnly(row.due_date)}</small></div></Link> : <button className="work-row-open task-row-open" onClick={() => open(row)} disabled={busy}><div><strong>{row.title}</strong><small>{(Array.isArray(row.clients) ? row.clients[0]?.name : row.clients?.name) || clients.find(c => c.id === row.client_id)?.name || row.external_person_name || 'Atividade interna'}{row.law_area?' · '+row.law_area:''}</small></div><span className="task-row-assignee" title={who(row)}><span className="task-avatar">{who(row).split(/\s+/).filter(part=>/^[A-Za-zÀ-ÿ]/.test(part)).map(part=>part[0]).slice(0,2).join('')}</span><span className="task-assignee-name">{who(row).split(/\s+/)[0]}</span></span><div className="work-row-meta"><span className={`movement-state ${state === 'late' ? 'error' : state === 'today' ? 'review' : 'muted'}`}>{state==='today'?'Hoje':state==='late'?lateLabel(row.due_date):row.done_at?'Concluída':dateOnly(row.due_date)}</span>{['alta', 'high', 'urgente', 'urgent'].includes(row.priority) && <span className="process-tag gold">{['urgente', 'urgent'].includes(row.priority) ? 'Urgente' : 'Alta'}</span>}</div></button>}</article></Fragment>; })}{!embedded && <footer className="process-pagination"><span>{total ? `${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)} de ${total} tarefas` : '0 tarefas'}</span><div><button className="secondary" aria-label="Página anterior" disabled={page === 0 || loading} onClick={() => setPage(v => v - 1)}><ChevronLeft size={16}/></button>Página {page + 1} de {pages}<button className="secondary" aria-label="Próxima página" disabled={page + 1 >= pages || loading} onClick={() => setPage(v => v + 1)}><ChevronRight size={16}/></button></div></footer>}</section><small className="work-scope-note">Indicadores das tarefas pendentes do escritório, antes dos filtros.</small>{embedded ? <Link to="/afazeres">Ver todas as tarefas →</Link> : <details className="process-panel work-today-summary"><summary><CalendarDays size={15}/> Compromissos de hoje · apoio da agenda</summary><p>Até 12 registros do Calendário. Consulte a pauta completa na Agenda.</p>{eventsError ? <p role="alert">{eventsError}</p> : todayEvents.length ? todayEvents.map(e => <Link key={e.id} to={`/agenda?evento=${e.id}`}>{officeDate(e.starts_at)} · {e.title}</Link>) : <p>Nenhum compromisso retornado para hoje.</p>}<Link to="/agenda">Abrir calendário →</Link></details>}
 </div> {draft && <aside ref={panel} tabIndex={-1} className="process-panel work-panel approved-panel task-edit-panel" aria-label={draft.id ? 'Editar tarefa' : 'Nova tarefa'}><div className="work-panel-heading"><div><h2>{draft.id ? 'Editar tarefa' : 'Nova tarefa'}</h2><small className={dirty?"work-dirty":""}>{dirty ? 'Alterações não salvas' : 'Defina o que precisa ser feito.'}</small></div><button className="work-close" aria-label="Fechar edição" disabled={busy} onClick={close}><X size={16}/></button></div><form className="work-form" onSubmit={save}><label>Título<input autoFocus required maxLength={300} value={draft.title} disabled={busy} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label><label>Responsável<select value={draft.responsible} disabled={busy} onChange={e => setDraft({ ...draft, responsible: e.target.value })}>{members.map(m => <option key={m.id} value={'member:' + m.id}>{m.name || 'Integrante da equipe'}</option>)}{draft.responsible.startsWith('member:') && !members.some(m => 'member:' + m.id === draft.responsible) && <option value={draft.responsible}>Responsável atual · indisponível</option>}{Object.entries(legacy).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><div className="work-form-grid"><label>Vencimento<input type="date" value={draft.due_date} disabled={busy} onChange={e => setDraft({ ...draft, due_date: e.target.value })}/></label><label>Prioridade<select value={draft.priority} disabled={busy} onChange={e => setDraft({ ...draft, priority: e.target.value })}>{['baixa', 'normal', 'alta', 'urgente'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label></div><details><summary>Informações complementares<small>Cliente, área jurídica e tipo de atividade</small></summary><div className="work-form-grid"><label>Vínculo<select value={draft.vinculo} disabled={busy} onChange={e => setDraft({ ...draft, vinculo: e.target.value })}><option value="interno">Atividade interna</option><option value="cliente">Cliente cadastrado</option><option value="externo">Pessoa ou instituição externa</option></select></label>{draft.vinculo === 'cliente' && <label>Cliente<select value={draft.client_id} disabled={busy} onChange={e => setDraft({ ...draft, client_id: e.target.value })}><option value="">Selecione</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}{draft.vinculo === 'externo' && <label>Pessoa ou instituição<input maxLength={300} value={draft.external_person_name} disabled={busy} onChange={e => setDraft({ ...draft, external_person_name: e.target.value })}/></label>}<label>Área do Direito<select value={draft.law_area} disabled={busy} onChange={e => setDraft({ ...draft, law_area: e.target.value })}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></label><label>Atividade<select value={draft.activity_type} disabled={busy} onChange={e => setDraft({ ...draft, activity_type: e.target.value })}>{ATIVIDADES.map(a => <option key={a}>{a}</option>)}</select></label></div></details><label>Observações<textarea rows={4} maxLength={2000} value={draft.notes} disabled={busy} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label>{draft.done_at && <small>Concluída em {officeDate(draft.done_at)}.</small>}<div className="work-form-actions">{draft.id && <button className="secondary work-danger" type="button" disabled={busy} onClick={() => void remove()}>Excluir</button>}<button className="primary" disabled={busy || !draft.title.trim()}><Check size={16}/>{busy ? 'Salvando…' : 'Salvar tarefa'}</button></div></form></aside>}
 </div></div>;
}

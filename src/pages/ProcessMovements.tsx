import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, Search, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, CheckCircle2, ShieldCheck, FileText, AlertTriangle, Clock3 } from 'lucide-react';
import InternalNavigation from '../components/InternalNavigation';
import { supabase } from '../lib/supabase';
import { captureBounds, movementDate, movementPriority, movementDelivery, decideProcessNotice, type ProcessRow } from '../lib/processWorkspace';
import './process-workspace.css';
import { appendJournal, consultationResult, journalKey } from '../lib/monitoringWorkspace';
const PAGE_SIZE = 25;
const movementColumns = 'id,org_id,process_id,movement_date,title,description,source,client_message,approved_for_client,sent_to_client_at,created_at,processes(cnj_number,internal_number,subject,status,clients(name))';
const queueColumns = 'id,process_id,client_id,movement_id,notification_type,channel,scheduled_at,message_text,status,last_error,sent_at,delivered_at,read_at,external_message_id,send_to_client_app,clients(name),processes(cnj_number,internal_number,status,subject)';
export default function ProcessMovements() {
    const [params, setParams] = useSearchParams();
    const contextProcess = params.get('processo');
    const section = params.get('secao');
    const view = section === 'aprovacoes' || section === 'envios' ? section : 'movimentacoes';
    const [rows, setRows] = useState<ProcessRow[]>([]), [page, setPage] = useState(0), [total, setTotal] = useState(0), [query, setQuery] = useState(''), [period, setPeriod] = useState('48h'), [processStatus, setProcessStatus] = useState(''), [sendStatus, setSendStatus] = useState(''), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(''), [notice, setNotice] = useState(''), [updated, setUpdated] = useState<Date | null>(null), [orgId, setOrgId] = useState(''), [refresh, setRefresh] = useState(0);
    const [counts, setCounts] = useState<{
        review: number | null;
        pending: number | null;
        failed: number | null;
    }>({ review: null, pending: null, failed: null });
    const [selected, setSelected] = useState<ProcessRow | null>(null), [movement, setMovement] = useState<ProcessRow | null>(null), [related, setRelated] = useState<ProcessRow[]>([]), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState(''), [selection, setSelection] = useState<string[]>([]), [busy, setBusy] = useState(false), [syncing, setSyncing] = useState(false);
    const request = useRef(0), detailRequest = useRef(0), locked = useRef(false), mutation = useRef(false), identityRef = useRef('');
    locked.current = busy || syncing;
    async function identity() { const { data, error } = await supabase.auth.getUser(); if (error || !data.user)
        throw new Error('Sessão inválida. Entre novamente.'); const profile = await supabase.from('profiles').select('org_id').eq('id', data.user.id).maybeSingle(); if (profile.error || !profile.data?.org_id)
        throw new Error('Escritório não identificado.'); identityRef.current = profile.data.org_id; setOrgId(profile.data.org_id); return profile.data.org_id; }
    async function searchProcesses(org: string, term: string) { const customer = await supabase.from('clients').select('id').eq('org_id', org).ilike('name', `%${term}%`).limit(501); if (customer.error)
        throw customer.error; if (customer.data?.length === 501)
        throw new Error('A busca corresponde a muitos clientes. Refine o nome ou informe o número do processo.'); const pieces = [`cnj_number.ilike.%${term}%`, `internal_number.ilike.%${term}%`, `subject.ilike.%${term}%`]; if (customer.data?.length)
        pieces.push(`client_id.in.(${customer.data.map(row => row.id).join(',')})`); const result = await supabase.from('processes').select('id').eq('org_id', org).or(pieces.join(',')).limit(501); if (result.error)
        throw result.error; if (result.data?.length === 501)
        throw new Error('A busca corresponde a muitos processos. Refine os termos.'); return (result.data || []).map(row => row.id); }
    async function load(run: number) {
        setLoading(true);
        setLoadError('');
        try {
            const org = await identity();
            const term = query.replace(/[(),]/g, ' ').trim();
            const ids = term ? await searchProcesses(org, term) : [];
            if (run !== request.current)
                return;
            let dataQuery = view === 'movimentacoes' ? supabase.from('process_movements').select(processStatus ? movementColumns.replace('processes(', 'processes!inner(') : movementColumns, { count: 'exact' }).eq('org_id', org).order('created_at', { ascending: false }).order('id') : supabase.from('process_notification_queue').select(queueColumns, { count: 'exact' }).eq('org_id', org).order('scheduled_at', { ascending: false }).order('id');
            if (contextProcess)
                dataQuery = dataQuery.eq('process_id', contextProcess);
            if (view === 'movimentacoes') {
                const since = captureBounds(period);
                if (since)
                    dataQuery = dataQuery.gte('created_at', since);
                if (processStatus)
                    dataQuery = dataQuery.eq('processes.status', processStatus);
                if (term)
                    dataQuery = dataQuery.or([`title.ilike.%${term}%`, `description.ilike.%${term}%`, ...(ids.length ? [`process_id.in.(${ids.join(',')})`] : [])].join(','));
            }
            else {
                if (view === 'aprovacoes')
                    dataQuery = dataQuery.eq('status', 'awaiting_review');
                else {
                    dataQuery = dataQuery.neq('status', 'awaiting_review');
                    if (sendStatus === 'read')
                        dataQuery = dataQuery.not('read_at', 'is', null);
                    else if (sendStatus === 'delivered')
                        dataQuery = dataQuery.or('status.eq.delivered,delivered_at.not.is.null');
                    else if (sendStatus === 'waiting')
                        dataQuery = dataQuery.in('status', ['pending', 'processing']);
                    else if (sendStatus === 'failed')
                        dataQuery = dataQuery.in('status', ['failed', 'error']);
                    else if (sendStatus)
                        dataQuery = dataQuery.eq('status', sendStatus);
                }
                if (term)
                    dataQuery = dataQuery.or([`message_text.ilike.%${term}%`, `notification_type.ilike.%${term}%`, ...(ids.length ? [`process_id.in.(${ids.join(',')})`] : [])].join(','));
            }
            const [result, review, pending, failed] = await Promise.all([dataQuery.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1), supabase.from('process_notification_queue').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('status', 'awaiting_review'), supabase.from('process_notification_queue').select('id', { count: 'exact', head: true }).eq('org_id', org).in('status', ['pending', 'processing']), supabase.from('process_notification_queue').select('id', { count: 'exact', head: true }).eq('org_id', org).in('status', ['failed', 'error'])]);
            if (run !== request.current)
                return;
            setCounts({ review: review.error ? null : review.count, pending: pending.error ? null : pending.count, failed: failed.error ? null : failed.count });
            if (result.error)
                throw new Error(result.error.message);
            if (result.count === null)
                throw new Error('A consulta não retornou a contagem. Atualize para verificar a lista.');
            setRows(result.data || []);
            setTotal(result.count);
            if (page > 0 && page * PAGE_SIZE >= result.count) {
                setPage(0);
                return;
            }
            setUpdated(new Date());
            if (review.error || pending.error || failed.error)
                setLoadError('A lista foi consultada, mas parte dos indicadores está indisponível.');
        }
        catch (error) {
            if (run === request.current) {
                setRows([]);
                setTotal(0);
                setCounts({ review: null, pending: null, failed: null });
                setLoadError(error instanceof Error ? error.message : 'Não foi possível consultar os registros.');
            }
        }
        finally {
            if (run === request.current)
                setLoading(false);
        }
    }
    useEffect(() => { const run = ++request.current; setLoading(true); setSelected(null); setMovement(null); setRelated([]); setSelection([]); detailRequest.current++; const timer = setTimeout(() => void load(run), 250); return () => { clearTimeout(timer); request.current++; }; }, [view, page, query, period, processStatus, sendStatus, refresh, contextProcess]);
    useEffect(() => { const focus = () => { if (!locked.current)
        setRefresh(value => value + 1); }; window.addEventListener('focus', focus); return () => { window.removeEventListener('focus', focus); detailRequest.current++; }; }, []);
    function changeView(value: string) { if (locked.current)
        return; setNotice(''); setLoading(true); setRows([]); setPage(0); setQuery(''); setSelected(null); if (value === view)
        setRefresh(previous => previous + 1); setParams(previous => { const next = new URLSearchParams(previous); next.set('secao', value); return next; }); }
    async function open(row: ProcessRow) {
        if (locked.current)
            return;
        setNotice('');
        const run = ++detailRequest.current;
        setSelected(row);
        setMovement(view === 'movimentacoes' ? row : null);
        setRelated([]);
        setDetailError('');
        setDetailLoading(true);
        try {
            const org = identityRef.current || await identity();
            if (view === 'movimentacoes') {
                const result = await supabase.from('process_notification_queue').select(queueColumns).eq('org_id', org).eq('movement_id', row.id).order('scheduled_at', { ascending: false }).limit(20);
                if (result.error)
                    throw result.error;
                if (run === detailRequest.current)
                    setRelated(result.data || []);
            }
            else if (row.movement_id) {
                const result = await supabase.from('process_movements').select('id,process_id,title,description,source,movement_date,created_at,client_message,approved_for_client,sent_to_client_at').eq('org_id', org).eq('id', row.movement_id).maybeSingle();
                if (result.error)
                    throw result.error;
                if (!result.data)
                    throw new Error('A movimentação vinculada não está disponível para consulta.');
                if (run === detailRequest.current)
                    setMovement(result.data);
            }
        }
        catch (error) {
            if (run === detailRequest.current)
                setDetailError(error instanceof Error ? error.message : 'Não foi possível consultar o registro vinculado.');
        }
        finally {
            if (run === detailRequest.current)
                setDetailLoading(false);
        }
    }
    async function decide(items: ProcessRow[], approved: boolean) { if (mutation.current || locked.current || !items.length || !orgId)
        return; const visible = items.filter(item => rows.some(row => row.id === item.id) && item.status === 'awaiting_review'); if (!visible.length)
        return; if (!window.confirm(`${approved ? 'Autorizar para envio' : 'Não autorizar e cancelar'} ${visible.length} comunicação(ões)? ${approved ? 'O envio seguirá a fila automática; a entrega terá confirmação separada.' : ''}`))
        return; mutation.current = true; setBusy(true); setNotice(''); let ok = 0; const failures: string[] = []; try {
        for (const item of visible) {
            try {
                await decideProcessNotice(supabase, item, approved, orgId);
                ok++;
            }
            catch (error) {
                failures.push(`${item.clients?.name || item.processes?.cnj_number || item.id}: ${error instanceof Error ? error.message : 'Não confirmado.'}`);
            }
        }
        setNotice(`${ok} decisão(ões) confirmada(s).${failures.length ? ' ' + failures.length + ' falha(s): ' + failures.join(' | ') : approved ? ' As comunicações autorizadas aguardam envio; a entrega ainda não está confirmada.' : ' As comunicações foram canceladas.'}`);
    }
    finally {
        mutation.current = false;
        setBusy(false);
        setRefresh(value => value + 1);
    } }
    async function toggleApp(item: ProcessRow, value: boolean) { if (mutation.current || locked.current || !orgId)
        return; mutation.current = true; setBusy(true); try {
        const result = await supabase.from('process_notification_queue').update({ send_to_client_app: value }).eq('org_id', orgId).eq('id', item.id).eq('status', 'awaiting_review').select('id');
        if (result.error || !result.data?.length)
            throw new Error(result.error?.message || 'A comunicação mudou. Atualize antes de alterar o destino.');
        setSelected(previous => previous?.id === item.id ? { ...previous, send_to_client_app: value } : previous);
        setRows(previous => previous.map(row => row.id === item.id ? { ...row, send_to_client_app: value } : row));
        setNotice('Preferência de envio ao aplicativo salva. A mensagem ainda depende de aprovação.');
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : 'Alteração não confirmada.');
    }
    finally {
        mutation.current = false;
        setBusy(false);
    } }
    async function sync() { if (locked.current)
        return; ; setSyncing(true); setNotice('Consultando novas publicações no DJEN…'); try {
        const auth = await supabase.auth.getUser();
        if (!auth.data.user)
            throw new Error('Sessão expirada.');
        const org = identityRef.current || await identity();
        const flags = await supabase.from('platform_feature_flags').select('status').eq('feature_key', 'tribunals_public_monitoring').maybeSingle();
        if (flags.error || (flags.data && flags.data.status !== 'enabled'))
            throw new Error('A consulta está indisponível para este usuário.');
        const result = await supabase.functions.invoke('djen-sync', { body: {} });
        let entry;
        try {
            if (result.error)
                throw result.error;
            entry = { ...consultationResult('DJEN', result.data), id: crypto.randomUUID(), at: new Date().toISOString() };
        }
        catch (error) {
            entry = { source: 'DJEN' as const, id: crypto.randomUUID(), at: new Date().toISOString(), status: 'Falhou', checked: null, inserted: null, failed: null, message: error instanceof Error ? error.message : 'Consulta não confirmada.' };
        }
        setNotice(entry.status + ': ' + entry.message);
        try {
            appendJournal(journalKey(org, auth.data.user.id), entry);
        }
        catch {
            setNotice(entry.message + ' Histórico local indisponível.');
        }
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : 'Não foi possível consultar o DJEN.');
    }
    finally {
        setSyncing(false);
        setRefresh(value => value + 1);
    } }
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), selectedRows = rows.filter(row => selection.includes(row.id)), allSelected = rows.length > 0 && rows.every(row => selection.includes(row.id));
    const activeQueue = view === 'movimentacoes' ? (related[0] || null) : selected;
    const delivery = movementDelivery(movement, activeQueue);
    const record = selected?.processes;
    const processId = selected?.process_id;
    const client = selected?.clients?.name || record?.clients?.name || 'Cliente não identificado';
    return <div className="process-workspace movement-workspace"><header className="process-page-heading"><div><h1>Andamentos</h1><p>Acompanhe movimentações, revise comunicações e confira os envios.</p></div><div className="process-heading-actions"><Link className="secondary" to="/tribunais">Monitoramento</Link><button className="secondary" disabled={loading || busy || syncing} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16}/>Atualizar lista</button><button className="primary" disabled={loading || busy || syncing} onClick={() => void sync()}><Search size={16}/>{syncing ? 'Consultando DJEN…' : 'Consultar DJEN'}</button></div></header>
 <div className="movement-counts"><button disabled={busy || syncing} onClick={() => changeView('aprovacoes')}><span>{loading ? '—' : counts.review ?? '—'}</span>Aprovações pendentes</button><button disabled={busy || syncing} onClick={() => { setSendStatus('waiting'); changeView('envios'); }}><span>{loading ? '—' : counts.pending ?? '—'}</span>Aguardando / em processamento</button><button disabled={busy || syncing} onClick={() => { setSendStatus('failed'); changeView('envios'); }}><span>{loading ? '—' : counts.failed ?? '—'}</span>Falhas no envio</button><div><Clock3 size={15}/><span>{updated ? 'Última consulta da lista: ' + movementDate(updated) : 'Lista ainda não consultada.'}</span></div></div>
 <InternalNavigation label="Visões de andamentos">{[['movimentacoes', 'Movimentações'], ['aprovacoes', 'Aprovações'], ['envios', 'Envios']].map(([value, label]) => <button key={value} aria-current={view === value ? 'page' : undefined} disabled={busy || syncing} onClick={() => changeView(value)}>{label}</button>)}</InternalNavigation>
 {contextProcess && <p className='process-notice'>Exibindo registros do processo selecionado. <button className='process-text-button' onClick={() => { setPage(0); setParams(previous => { const next = new URLSearchParams(previous); next.delete('processo'); return next; }); }}>Ver todos os processos</button></p>}
 {loadError && <p className="process-error" role="alert">{loadError}</p>}{notice && <p className="process-notice" role="status">{notice}</p>}
 <div className="movement-workspace-tools"><label className="process-search"><Search size={17}/><input aria-label="Buscar nesta visão" value={query} disabled={busy || syncing} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Cliente, processo ou conteúdo"/></label>{view === 'movimentacoes' ? <><label>Período de captura<select aria-label="Período de captura" value={period} disabled={busy || syncing} onChange={event => { setPeriod(event.target.value); setPage(0); }}><option value="48h">Últimas 48 horas</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="all">Todo o período</option></select></label><label>Processos<select aria-label="Situação dos processos" value={processStatus} disabled={busy || syncing} onChange={event => { setProcessStatus(event.target.value); setPage(0); }}><option value="">Todas as situações</option><option value="active">Ativos</option><option value="completed">Encerrados</option><option value="archived">Arquivados</option><option value="suspended">Suspensos</option></select></label></> : view === 'aprovacoes' ? <p><ShieldCheck size={16}/>Todas as idades: pendências antigas continuam nesta visão.</p> : <label>Situação do envio<select aria-label="Situação do envio" value={sendStatus} disabled={busy || syncing} onChange={event => { setSendStatus(event.target.value); setPage(0); }}><option value="">Todas as situações</option><option value="waiting">Aguardando / em processamento</option><option value="pending">Aguardando envio</option><option value="processing">Em processamento</option><option value="sent">Disparo registrado</option><option value="delivered">Entrega confirmada</option><option value="read">Leitura confirmada</option><option value="failed">Falhas</option><option value="cancelled">Cancelados</option></select></label>}</div>
 {view === 'aprovacoes' && rows.length > 0 && <div className="movement-batch"><label><input type="checkbox" checked={allSelected} disabled={busy || syncing || loading} onChange={event => setSelection(event.target.checked ? rows.map(row => row.id) : [])}/>Selecionar esta página</label><span>{selectedRows.length} selecionada(s)</span><button className="secondary" disabled={!selectedRows.length || busy || syncing || loading} onClick={() => void decide(selectedRows, false)}>Não autorizar</button><button className="primary" disabled={!selectedRows.length || busy || syncing || loading} onClick={() => void decide(selectedRows, true)}>Autorizar selecionadas</button></div>}
 <div className={`movement-two-pane ${selected ? 'movement-selected' : ''}`}><section className="movement-list" aria-label={view === 'aprovacoes' ? 'Comunicações para aprovação' : view === 'envios' ? 'Comunicações e envios' : 'Movimentações consultadas'}>{loading ? <p className="process-empty" role="status">Consultando registros…</p> : !rows.length ? <div className="process-empty"><FileText size={30}/><h2>{loadError ? 'Consulta indisponível' : 'Nenhum registro encontrado'}</h2><p>{view === 'aprovacoes' ? 'Nenhuma aprovação retornada nesta busca.' : 'Ajuste a busca ou os filtros para consultar outros registros.'}</p></div> : rows.map(row => { const customer = row.clients?.name || row.processes?.clients?.name || 'Cliente não identificado'; const number = row.processes?.cnj_number || row.processes?.internal_number || 'Processo sem número'; const state = movementDelivery(view === 'movimentacoes' ? row : null, view === 'movimentacoes' ? null : row); return <div key={row.id} className={`movement-list-row ${selected?.id === row.id ? 'is-selected' : ''}`}>{view === 'aprovacoes' && <input type="checkbox" aria-label={`Selecionar comunicação de ${customer}`} checked={selection.includes(row.id)} disabled={busy || syncing} onChange={event => setSelection(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))}/>}<button type="button" aria-pressed={selected?.id === row.id} disabled={busy || syncing} onClick={() => void open(row)}><span className="movement-list-top"><strong>{customer}</strong><small>{movementDate(view === 'movimentacoes' ? row.created_at : row.scheduled_at)}</small></span><span className="movement-list-title">{view === 'movimentacoes' ? row.title || 'Movimentação processual' : row.notification_type || 'Comunicação processual'}</span><span className="movement-list-number">{number}</span><span className="movement-list-preview">{view === 'movimentacoes' ? row.description || 'Sem descrição registrada' : row.message_text || 'Mensagem sem texto registrado'}</span>{view === 'movimentacoes' ? <span className="movement-state muted">{movementPriority(row.title)} · por termos do título</span> : <span className={`movement-state ${state.kind}`}>{state.label}</span>}</button></div>; })}</section>
 <section className="movement-reader" aria-label="Detalhes do registro">{!selected ? <div className="process-empty"><FileText size={32}/><h2>Selecione um registro</h2><p>Leia a movimentação e confira as comunicações neste espaço.</p></div> : <><header className="movement-reader-header"><button className="process-text-button movement-reader-back" onClick={() => { detailRequest.current++; setSelected(null); }} disabled={busy || syncing}><ArrowLeft size={16}/>Voltar à lista</button><div><h2>{client}</h2><p>{record?.cnj_number || record?.internal_number || 'Processo sem número'}</p></div>{processId && <Link className="secondary" to={`/processos/${processId}?secao=movements`}>Abrir processo<ArrowRight size={15}/></Link>}</header><div className="movement-reader-content">{detailLoading ? <p role="status">Consultando detalhes…</p> : <>{detailError && <p className="process-error" role="alert">{detailError}</p>}<div className="movement-reader-meta"><span className={`movement-state ${delivery.kind}`}>{delivery.label}</span><p>{delivery.detail}</p></div>{movement ? <article className="movement-original"><h3>{movement.title || 'Movimentação processual'}</h3><p className="process-muted">{movement.source || 'Fonte não informada'} · Data da movimentação: {movementDate(movement.movement_date)}</p><small>Capturado em {movementDate(movement.created_at)}</small><h4>Registro original</h4><p className="movement-text">{movement.description || 'Nenhum texto adicional registrado pela fonte.'}</p></article> : !selected.movement_id ? <p className="process-muted">Comunicação sem movimentação vinculada.</p> : null}{view === 'movimentacoes' ? <div className="movement-communications"><h3>Comunicações desta movimentação</h3><small>Até 20 registros mais recentes. Consulte a visão Envios para pesquisar o histórico paginado.</small>{related.length ? related.map(item => { const state = movementDelivery(movement, item); return <article key={item.id}><span className={`movement-state ${state.kind}`}>{state.label}</span><p className="movement-text">{item.message_text || 'Mensagem sem texto registrado.'}</p><small>{item.channel || 'Canal não informado'} · {state.detail}</small>{item.status === 'awaiting_review' && <button className="secondary" onClick={() => { changeView('aprovacoes'); setQuery(record?.cnj_number || record?.internal_number || client); }}>Revisar na fila de aprovações</button>}</article>; }) : !detailError && <p className="process-muted">Nenhuma comunicação retornada para esta movimentação.</p>}</div> : <article className="movement-message"><h3>{view === 'aprovacoes' ? 'Mensagem para revisão' : 'Mensagem registrada'}</h3><p className="movement-text">{selected.message_text || 'Mensagem sem texto registrado.'}</p><small>Canal: {selected.channel || 'Não informado'} · Agendado: {movementDate(selected.scheduled_at)}</small>{selected.last_error && <p className="process-error">{selected.last_error}</p>}<p className="process-muted">{selected.send_to_client_app ? 'Solicitado envio também ao aplicativo. A confirmação deste canal deve ser conferida separadamente.' : 'Envio adicional ao aplicativo não solicitado.'}</p></article>}</>}</div>{view === 'aprovacoes' && <footer className="movement-decision-bar"><label><input type="checkbox" disabled={busy || syncing || detailLoading || Boolean(detailError)} checked={Boolean(selected.send_to_client_app)} onChange={event => void toggleApp(selected, event.target.checked)}/>Solicitar envio também ao aplicativo</label><p>Revise a mensagem e os destinos. Autorizar libera o processamento; não confirma entrega.</p><div><button className="secondary" disabled={busy || syncing || detailLoading || Boolean(detailError)} onClick={() => void decide([selected], false)}>Não autorizar</button><button className="primary" disabled={busy || syncing || detailLoading || Boolean(detailError) || !String(selected.message_text || '').trim()} onClick={() => void decide([selected], true)}><CheckCircle2 size={16}/>{busy ? 'Confirmando…' : 'Autorizar envio'}</button></div></footer>}</>}</section></div>
 <footer className="process-pagination"><span>{loading ? 'Consultando…' : loadError && !rows.length ? 'Consulta não confirmada' : `${total ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}` : '0'} de ${total} registros nesta busca`}</span><div><button className="secondary" aria-label="Página anterior" disabled={page === 0 || loading || busy || syncing} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16}/></button><span>Página {page + 1} de {pages}</span><button className="secondary" aria-label="Próxima página" disabled={page + 1 >= pages || loading || busy || syncing} onClick={() => setPage(value => value + 1)}><ChevronRight size={16}/></button></div></footer>
 </div>;
}

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, RefreshCw, ArrowRight, Plus, ShieldCheck } from 'lucide-react';
import InternalNavigation from '../components/InternalNavigation';
import { supabase } from '../lib/supabase';
import { appendJournal, consultationResult, journalKey, readJournal, type Consultation, type MonitoringSource } from '../lib/monitoringWorkspace';
import './process-workspace.css';
import './monitoring-workspace.css';
type Monitor = {
    id: string;
    oab_number: string;
    oab_uf: string;
    enabled: boolean;
    last_checked_at?: string;
    last_success_at?: string;
    last_error?: string;
};
const date = (value?: string) => value ? new Date(value).toLocaleString('pt-BR') : 'Sem registro disponível';
export default function Tribunals() {
    const [params, setParams] = useSearchParams();
    const section = params.get('secao') || 'visao';
    const [monitors, setMonitors] = useState<Monitor[]>([]), [history, setHistory] = useState<Consultation[]>([]), [flags, setFlags] = useState<Record<string, string>>({}), [connections, setConnections] = useState<any[]>([]), [connectionError, setConnectionError] = useState(''), [loadError, setLoadError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [automatic, setAutomatic] = useState(false), [identity, setIdentity] = useState({ org: '', user: '' }), [oab, setOab] = useState(''), [uf, setUf] = useState('MG'), [processFailures, setProcessFailures] = useState<any[]>([]), [latestAttempt, setLatestAttempt] = useState<string>();
    const lock = useRef(false);
    const enabled = !loading && !loadError && flags.tribunals_public_monitoring === 'enabled';
    async function load() {
        setLoading(true);
        setLoadError('');
        try {
            const auth = await supabase.auth.getUser();
            if (auth.error || !auth.data.user)
                throw new Error('Sessão expirada.');
            const profile = await supabase.from('profiles').select('org_id').eq('id', auth.data.user.id).single();
            if (profile.error || !profile.data?.org_id)
                throw new Error('Escritório não identificado.');
            const org = profile.data.org_id, user = auth.data.user.id;
            setIdentity({ org, user });
            const [ms, fs, ps, issues] = await Promise.all([supabase.from('djen_monitors').select('id,oab_number,oab_uf,enabled,last_checked_at,last_success_at,last_error').eq('org_id', org).eq('owner_user_id', user).order('oab_uf'), supabase.from('platform_feature_flags').select('feature_key,status'), supabase.from('processes').select('last_synced_at').eq('org_id', org).not('last_synced_at', 'is', null).order('last_synced_at', { ascending: false }).limit(1), supabase.from('processes').select('id,cnj_number,internal_number,sync_error,sync_status').eq('org_id', org).not('sync_error', 'is', null).limit(50)]);
            if (ms.error || fs.error || ps.error || issues.error)
                throw new Error(ms.error?.message || fs.error?.message || ps.error?.message || issues.error?.message);
            setProcessFailures(issues.data || []);
            setMonitors(ms.data || []);
            setFlags(Object.fromEntries([['tribunals_public_monitoring', 'enabled'], ['tribunals_authenticated_access', 'coming_soon'], ...(fs.data || []).map(row => [row.feature_key, row.status])]));
            setLatestAttempt(ps.data?.[0]?.last_synced_at);
            try {
                setHistory(readJournal(journalKey(org, user)));
            }
            catch {
                setNotice('O histórico deste navegador não pôde ser lido. Os registros da fonte continuam disponíveis nas OABs.');
            }
        }
        catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Não foi possível consultar o monitoramento.');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => { void load(); }, []);
    useEffect(() => { if (section !== 'fontes' || flags.tribunals_authenticated_access !== 'enabled')
        return; let active = true; setConnectionError(''); supabase.functions.invoke('tribunal-connection-manager', { body: { action: 'list' } }).then(result => { if (!active)
        return; if (result.error || !Array.isArray(result.data?.connections))
        setConnectionError('Não foi possível consultar as conexões autenticadas.');
    else
        setConnections(result.data.connections); }); return () => { active = false; }; }, [section, flags]);
    async function consult(source: MonitoringSource) { if (lock.current || !enabled)
        return; ; lock.current = true; setBusy(true); setNotice('Consultando ' + source + '…'); let entry: Consultation; try {
        const response = await supabase.functions.invoke(source === 'DJEN' ? 'djen-sync' : 'tribunal-sync', { body: source === 'DJEN' ? {} : { action: 'sync_public_processes' } });
        if (response.error)
            throw new Error(response.error.message);
        entry = { ...consultationResult(source, response.data), id: crypto.randomUUID(), at: new Date().toISOString() };
    }
    catch (error) {
        entry = { id: crypto.randomUUID(), at: new Date().toISOString(), source, status: 'Falhou', checked: null, inserted: null, failed: null, message: error instanceof Error ? error.message : 'Consulta não confirmada.' };
    } setNotice(entry.status + ': ' + entry.message); try {
        const key = journalKey(identity.org, identity.user);
        appendJournal(key, entry);
        setHistory(readJournal(key));
    }
    catch {
        setNotice(entry.message + ' Não foi possível salvar o histórico neste navegador.');
    } lock.current = false; setBusy(false); void load(); }
    useEffect(() => { if (!automatic || section !== 'visao' || !enabled)
        return; const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !lock.current)
        void consult('DataJud'); }, 45000); return () => window.clearInterval(timer); }, [automatic, section, enabled, identity.org, identity.user]);
    async function mutate(task: () => Promise<void>) { if (lock.current || !enabled)
        return; lock.current = true; setBusy(true); try {
        await task();
        await load();
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : 'Alteração não confirmada.');
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    async function add() { const number = oab.replace(/\D/g, ''), state = uf.toUpperCase(); if (!number || !['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'].includes(state)) {
        setNotice('Informe OAB e UF válidas.');
        return;
    } if (monitors.some(row => row.oab_number === number && row.oab_uf === state)) {
        setNotice('Esta OAB já está cadastrada.');
        return;
    } await mutate(async () => { const result = await supabase.from('djen_monitors').insert({ org_id: identity.org, owner_user_id: identity.user, oab_number: number, oab_uf: state, enabled: true }).select('id'); if (result.error || !result.data?.length)
        throw new Error(result.error?.message || 'Cadastro não confirmado.'); setOab(''); setNotice('OAB adicionada ao acompanhamento.'); }); }
    async function toggle(row: Monitor) { await mutate(async () => { const result = await supabase.from('djen_monitors').update({ enabled: !row.enabled }).eq('id', row.id).eq('org_id', identity.org).eq('owner_user_id', identity.user).select('id'); if (result.error || !result.data?.length)
        throw new Error(result.error?.message || 'Alteração não confirmada.'); setNotice(row.enabled ? 'Acompanhamento pausado.' : 'Acompanhamento reativado.'); }); }
    const latest = (source: MonitoringSource) => history.find(row => row.source === source);
    const success = (source: MonitoringSource) => history.find(row => row.source === source && ['Concluída', 'Sem novidades'].includes(row.status));
    return <div className="process-workspace monitoring-workspace"><header className="process-page-heading"><div><h1>Monitoramento</h1><p>Saiba o que foi consultado, encontre falhas e gerencie suas fontes.</p></div><div className="process-heading-actions"><Link className="secondary" to="/andamentos">Ver andamentos<ArrowRight size={16}/></Link><button className="secondary" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={16}/>Atualizar painel</button></div></header>
 {false}
 <InternalNavigation label="Visões de monitoramento">{[['visao', 'Visão geral'], ['oabs', 'OABs acompanhadas'], ['consultas', 'Consultas e falhas'], ['fontes', 'Configurações das fontes']].map(([value, label]) => <button key={value} aria-current={section === value ? 'page' : undefined} disabled={busy} onClick={() => setParams({ secao: value })}>{label}</button>)}</InternalNavigation>
 {loadError && <p className="process-error" role="alert">Falha ao carregar: {loadError}. Atualize o painel para tentar novamente.</p>}{notice && <p className="process-notice" role="status">{notice}</p>}{loading ? <p role="status">Consultando configurações e registros…</p> : <>
 {section === 'visao' && <><div className="monitoring-summary"><article><Activity /><span>OABs ativas do usuário</span><strong>{loadError ? '—' : monitors.filter(row => row.enabled).length}</strong></article><article><ShieldCheck /><span>Fontes de consulta pública</span><strong>{enabled ? 'DataJud e DJEN' : 'Indisponíveis'}</strong></article><article><RefreshCw /><span>Rotina deste navegador</span><strong>{automatic ? 'A cada 45 segundos' : 'Consulta manual'}</strong></article></div><div className="monitoring-sources">{(['DataJud', 'DJEN'] as MonitoringSource[]).map(source => <article className="process-panel" key={source}><div className="monitoring-source-heading"><h2>{source}</h2><span className="process-tag gold">{enabled ? 'Disponível' : 'Recurso indisponível'}</span></div><p>{source === 'DataJud' ? 'Processos do escritório. Até 2 processos por execução; um lote não representa a carteira completa.' : 'Publicações das OABs ativas do usuário conectado. A consulta é separada do DataJud.'}</p><dl><dt>Última tentativa conhecida</dt><dd>{source === 'DataJud' ? date(latest(source)?.at || latestAttempt) : date(monitors.map(row => row.last_checked_at).filter(Boolean).sort().at(-1) || latest(source)?.at)}</dd><dt>Último sucesso conhecido{source === 'DataJud' ? ' neste navegador' : ''}</dt><dd>{source === 'DJEN' ? date(monitors.map(row => row.last_success_at).filter(Boolean).sort().at(-1) || success(source)?.at) : date(success(source)?.at)}</dd><dt>Resultado neste navegador</dt><dd>{latest(source)?.message || 'Nenhuma consulta registrada neste navegador.'}</dd></dl><button className="primary" disabled={!enabled || busy} onClick={() => void consult(source)}>Consultar {source}</button></article>)}</div><section className="process-panel"><h2>Rotina de consulta</h2><label className="monitoring-auto"><input type="checkbox" checked={automatic} disabled={!enabled || busy} onChange={event => setAutomatic(event.target.checked)}/>Consultar o próximo lote do DataJud a cada 45 segundos</label><p className="process-muted">Funciona somente com esta visão aberta e a página visível. O agendamento no servidor não foi verificado neste painel.</p></section></>}
 {section === 'oabs' && <section className="process-panel"><h2>OABs acompanhadas no DJEN</h2><p>Gerencie as OABs do seu usuário. Pausar interrompe sua participação nas próximas consultas.</p><form className="monitoring-form" onSubmit={event => { event.preventDefault(); void add(); }}><label>Número da OAB<input value={oab} onChange={event => setOab(event.target.value)} inputMode="numeric" required disabled={busy || !enabled}/></label><label>UF<input value={uf} onChange={event => setUf(event.target.value.toUpperCase())} maxLength={2} required disabled={busy || !enabled}/></label><button className="primary" disabled={busy || !enabled}><Plus size={16}/>Acompanhar OAB</button></form>{!loadError && monitors.length === 0 ? <div className="process-empty">Nenhuma OAB cadastrada para este usuário.</div> : <div className="monitoring-oabs">{monitors.map(row => <article key={row.id}><div><h3>OAB {row.oab_number}/{row.oab_uf}</h3><span className="process-tag">{row.enabled ? 'Acompanhando' : 'Pausada'}</span><p>Última tentativa: {date(row.last_checked_at)}<br />Último sucesso: {date(row.last_success_at)}</p>{row.last_error && <p className="process-error">{row.last_error}</p>}</div><button className="secondary" disabled={busy || !enabled} onClick={() => void toggle(row)}>{row.enabled ? 'Pausar' : 'Reativar'}</button></article>)}</div>}</section>}
 {section === 'consultas' && <section className="process-panel"><h2>Consultas e falhas</h2><p>Histórico das consultas iniciadas neste navegador, separado por escritório e usuário. Até 60 registros; não representa o histórico completo do servidor.</p><div className="monitoring-history">{history.length === 0 ? <div className="process-empty">Nenhuma consulta registrada neste navegador. Consulte as fontes na visão geral.</div> : history.filter(row => !params.get('fonte') || row.source === params.get('fonte')).map(row => <article key={row.id}><header><strong>{row.source}</strong><time>{date(row.at)}</time><span className={`movement-state ${row.status === 'Falhou' || row.status === 'Com falhas' ? 'error' : 'muted'}`}>{row.status}</span></header><p>{row.message}</p></article>)}</div><h3>Falhas atuais dos processos</h3><p className='process-muted'>Até 50 processos visíveis com erro registrado; uma nova tentativa pode estar pendente.</p>{processFailures.map(row => <p className='process-error' key={row.id}><Link to={`/processos/${row.id}`}>{row.cnj_number || row.internal_number || 'Abrir processo'}</Link>: {row.sync_error}</p>)}{!processFailures.length && <p className='process-muted'>{loadError ? 'Consulta indisponível.' : 'Nenhum erro retornado nos processos consultados.'}</p>}<h3>Falhas atuais das OABs</h3>{monitors.some(row => row.last_error) ? monitors.filter(row => row.last_error).map(row => <p className="process-error" key={row.id}>OAB {row.oab_number}/{row.oab_uf}: {row.last_error}</p>) : <p className="process-muted">{loadError ? 'Não foi possível verificar as falhas.' : 'Nenhuma falha retornada na configuração das OABs.'}</p>}</section>}
 {section === 'fontes' && <section className="process-panel"><h2>Disponibilidade das fontes</h2><p>Os recursos obedecem à liberação da plataforma. Alterações de credenciais não são realizadas neste painel.</p>{Object.entries(flags).filter(([key, status]) => key.startsWith('tribunals_') && status !== 'hidden').map(([key, status]) => <div className="monitoring-setting" key={key}><strong>{({ 'tribunals_public_monitoring': 'DataJud e DJEN', 'tribunals_authenticated_access': 'Acessos autenticados e 2FA', 'tribunals_oab_discovery': 'Descoberta de carteira por OAB', 'tribunals_manual_process': 'Cadastro por CNJ' } as Record<string, string>)[key] || key}</strong><span>{({ enabled: 'Liberado', coming_soon: 'Em desenvolvimento', admin_only: 'Restrito à administração' } as Record<string, string>)[status] || 'Indisponível'}</span></div>)}{connectionError && <p className="process-error">{connectionError}</p>}{connections.map(row => <p key={row.id}>{row.tribunal_name || row.tribunal_code}: {row.status}{row.error_message ? ' · ' + row.error_message : ''}</p>)}<Link className="secondary" to="/processos/adicionar">Adicionar ou descobrir processos<ArrowRight size={16}/></Link></section>}
 </>}</div>;
}

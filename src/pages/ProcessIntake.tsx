import { Link } from 'react-router-dom';
import InternalNavigation from '../components/InternalNavigation';
import { useEffect, useState } from 'react';
import { Landmark, Plus, RefreshCw, ShieldCheck, KeyRound, UserCheck, CheckCircle2, AlertTriangle, Play, Upload, Search, Clock3, Scale, Database, Car, FileSearch } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './integrations.css';
type Conn = {
    id: string;
    tribunal_code: string;
    tribunal_name: string;
    judicial_system: string | null;
    oab_number: string | null;
    oab_uf: string | null;
    status: string;
    requires_2fa: boolean;
    last_sync_at: string | null;
    error_message: string | null;
};
type FeatureStatus = 'enabled' | 'coming_soon' | 'hidden' | 'admin_only';
type FeatureFlag = {
    feature_key: string;
    status: FeatureStatus;
    label: string;
    description: string | null;
};
const defaults: Record<string, FeatureFlag> = {
    tribunals_authenticated_access: { feature_key: 'tribunals_authenticated_access', status: 'coming_soon', label: 'Acessos e 2FA', description: 'Integração autenticada com os sistemas judiciais está em desenvolvimento.' },
    tribunals_oab_discovery: { feature_key: 'tribunals_oab_discovery', status: 'coming_soon', label: 'Carteira por OAB', description: 'Descoberta automática da carteira será liberada após a validação do provedor.' },
    tribunals_public_monitoring: { feature_key: 'tribunals_public_monitoring', status: 'enabled', label: 'Monitoramento', description: 'Atualização pública dos processos conhecidos.' },
    tribunals_manual_process: { feature_key: 'tribunals_manual_process', status: 'enabled', label: 'Adicionar processo', description: 'Cadastro manual por número CNJ.' }
};
async function edgeErrorMessage(error: any) { const ctx = error?.context; if (ctx && typeof ctx.clone === 'function') {
    try {
        const data = await ctx.clone().json();
        const msg = data?.error || data?.message || data?.msg;
        if (msg)
            return String(msg);
    }
    catch { }
    const status = Number(ctx?.status || 0);
    if (status === 401)
        return 'Sua sessão expirou. Entre novamente no LEXOFFICE.';
    if (status === 403)
        return 'Seu usuário não tem permissão para executar esta operação.';
    if (status >= 500)
        return 'O serviço encontrou um erro interno.';
} return String(error?.message || 'Não foi possível concluir a operação.'); }
async function fn(name: string, body: any) { ; if (!supabase)
    throw new Error('Backend indisponível.'); const r = await supabase.functions.invoke(name, { body }); if (r.data?.error)
    throw new Error(r.data.error); if (r.error)
    throw new Error(await edgeErrorMessage(r.error)); return r.data || {}; }
export default function ProcessIntake() {
    const [tab, setTab] = useState('manual'), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState(false), [flags, setFlags] = useState<Record<string, FeatureFlag>>({});
    const [oab, setOab] = useState({ oab_number: '', oab_uf: 'MG', cnjs: '', status: 'ATIVO' }), [continueUrl, setContinueUrl] = useState(''), [discoverySummary, setDiscoverySummary] = useState<any>(null);
    const [manual, setManual] = useState({ cnj_number: '', tribunal_code: 'TJMG', judicial_system: 'DataJud', subject: '' });
    const flag = (key: string) => flags[key] || defaults[key];
    const usable = (key: string) => flags[key]?.status === 'enabled';
    async function load() { try {
        const f = await supabase.from('platform_feature_flags').select('feature_key,status,label,description');
        if (f.error)
            throw f.error;
        const next = { ...defaults };
        for (const row of (f.data || []) as FeatureFlag[])
            next[row.feature_key] = row;
        setFlags(next);
    }
    catch {
        setError(true);
        setNotice('Não foi possível carregar a disponibilidade dos recursos.');
        setFlags(Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { ...value, status: 'coming_soon' }])));
    } }
    useEffect(() => { void load(); }, []);
    async function run(cb: () => Promise<any>) { setBusy(true); setNotice(''); try {
        const r = await cb();
        if (r?.ok !== true)
            throw new Error(r?.error || 'A operação não foi confirmada.');
        setError(false);
        setNotice(r.message || 'Operação concluída.');
        await load();
        return r;
    }
    catch (e: any) {
        setError(true);
        setNotice(e?.message || 'Não foi possível concluir.');
        return null;
    }
    finally {
        setBusy(false);
    } }
    async function discoverOab(cont = false) { if (!usable('tribunals_oab_discovery'))
        return; const r = await run(() => fn('escavador-oab-discovery', { action: 'discover', oab_number: oab.oab_number, oab_uf: oab.oab_uf, status: oab.status || undefined, continue_url: cont ? continueUrl : undefined, max_pages: 5 })); if (r?.ok) {
        setDiscoverySummary(r);
        setContinueUrl(r.continue_url || '');
    } }
    async function importCnjs() { if (!usable('tribunals_oab_discovery'))
        return; const r = await run(() => fn('tribunal-connection-manager', { action: 'import_cnjs', oab_number: oab.oab_number, oab_uf: oab.oab_uf, cnjs: oab.cnjs, source: 'oab_authorized_list' })); if (r?.ok)
        setOab(v => ({ ...v, cnjs: '' })); }
    async function addManual() { if (!usable('tribunals_manual_process'))
        return; const result = await run(() => fn('tribunal-connection-manager', { action: 'add_process', ...manual })); if (result?.ok)
        setManual(v => ({ ...v, cnj_number: '', subject: '' })); }
    const items = [['access', 'tribunals_authenticated_access', KeyRound], ['oab', 'tribunals_oab_discovery', UserCheck], ['monitor', 'tribunals_public_monitoring', ShieldCheck], ['manual', 'tribunals_manual_process', Plus]] as const;
    const visible = items.filter(([id, k]) => (id === 'manual' || id === 'oab') && flag(k).status !== 'hidden');
    const ComingSoon = ({ featureKey }: {
        featureKey: string;
    }) => <section className="integration-panel"><h3>{flag(featureKey).label}</h3><p>{flag(featureKey).status === 'admin_only' ? 'Recurso restrito à administração.' : flag(featureKey).status === 'hidden' ? 'Recurso indisponível.' : flag(featureKey).description}</p></section>;
    return <div className="module tribunals-page"><div className="page-head"><div><h1>Adicionar processos</h1><p>Cadastre um CNJ ou importe a carteira quando o recurso estiver disponível.</p><Link to='/processos'>Voltar aos processos</Link></div><button className="integration-action" onClick={load}><RefreshCw size={16}/>Atualizar</button></div>{notice && <div className={`integration-notice ${error ? 'error' : ''}`}>{error ? <AlertTriangle size={17}/> : <CheckCircle2 size={17}/>} {notice}</div>}
 <InternalNavigation variant="underline" label="Navegação desta área">{visible.map(([id, key, Icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16}/>{flag(key).label}{flag(key).status === 'coming_soon' && <span style={{ fontSize: "var(--lx-font-xs)", fontWeight: 700, marginLeft: 5, opacity: .75 }}>EM BREVE</span>}</button>)}</InternalNavigation>
 {tab === 'oab' && !usable('tribunals_oab_discovery') && <ComingSoon featureKey="tribunals_oab_discovery"/>}
 {tab === 'oab' && usable('tribunals_oab_discovery') && <div className="integration-panel"><h3><UserCheck size={18}/> Descobrir carteira do advogado</h3><p>Informe sua OAB para descobrir os CNJs da sua carteira e preparar os processos para monitoramento.</p><div className="integration-form"><label>OAB<input value={oab.oab_number} onChange={e => setOab({ ...oab, oab_number: e.target.value })}/></label><label>UF<input value={oab.oab_uf} maxLength={2} onChange={e => setOab({ ...oab, oab_uf: e.target.value.toUpperCase() })}/></label><label>Situação<select value={oab.status} onChange={e => setOab({ ...oab, status: e.target.value })}><option value="ATIVO">Processos ativos</option><option value="">Todos</option><option value="INATIVO">Inativos</option></select></label><button className="integration-action" onClick={() => discoverOab(false)} disabled={busy || !oab.oab_number || oab.oab_uf.length !== 2}><Search size={15}/>Descobrir processos pela OAB</button>{continueUrl && <button className="secondary" onClick={() => discoverOab(true)} disabled={busy}><RefreshCw size={15}/>Continuar descoberta</button>}</div>{discoverySummary && <div className="integration-notice"><CheckCircle2 size={17}/> {discoverySummary.imported || 0} novo(s), {discoverySummary.duplicates || 0} já existente(s).</div>}<div style={{ marginTop: 24 }}><h3><Upload size={18}/> Importar CNJs manualmente</h3><div className="integration-form"><label className="wide">Números CNJ<textarea rows={6} value={oab.cnjs} onChange={e => setOab({ ...oab, cnjs: e.target.value })}/></label><button className="secondary" onClick={importCnjs} disabled={busy || !oab.oab_number || !oab.cnjs.trim()}><Upload size={15}/>Importar lista</button></div></div></div>}
 {tab === 'manual' && !usable('tribunals_manual_process') && <ComingSoon featureKey='tribunals_manual_process'/>}{tab === 'manual' && usable('tribunals_manual_process') && <div className="integration-panel"><h3><Landmark size={18}/> Adicionar processo</h3><p>Informe o número CNJ. O cadastro depende da confirmação do serviço.</p><div className="integration-form"><label className="wide">Número CNJ<input value={manual.cnj_number} onChange={e => setManual({ ...manual, cnj_number: e.target.value })} placeholder="0000000-00.0000.0.00.0000"/></label><label className="wide">Assunto<input value={manual.subject} onChange={e => setManual({ ...manual, subject: e.target.value })}/></label><button className="integration-action" onClick={addManual} disabled={busy || !manual.cnj_number}><Plus size={15}/>Adicionar processo</button></div></div>}
 </div>;
}

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, ClipboardList, Clock3, FileSignature, Pencil, Pause, Plus, RefreshCw, Save, Scale, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './jornada.css';

// Jornada Comercial 2026 — propostas com follow-up (dias 2, 5, 7 e 30), métricas mensais
// e tabelas internas (honorários de referência e atendimento extraordinário).

type Tab = 'propostas' | 'metricas' | 'honorarios' | 'extraordinario';
type Proposal = { id: string; lead_id: string | null; contact_name: string; phone: string; area: string | null; title: string; amount: number | null; valid_until: string | null; sent_at: string; status: string; followup_active: boolean; stop_reason: string | null; notes: string | null };
type Followup = { id: string; proposal_id: string; step_day: number; scheduled_at: string; status: string; sent_at: string | null; error_message: string | null };
type Lead = { id: string; name: string; phone: string | null; whatsapp: string | null; stage_key: string };
type Fee = { id: string; area: string; service: string; min_amount: number | null; max_amount: number | null; is_monthly: boolean; notes: string | null; active: boolean; reference_year: number };
type Extra = { id: string; period_key: string; period_label: string; amount: number | null; unit: string | null; condition: string | null; active: boolean; sort_order: number };

const money = (v: any) => v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (v: any) => v ? new Date(String(v).length === 10 ? v + 'T12:00:00' : v).toLocaleDateString('pt-BR') : '—';
const dateTimeBR = (v: any) => v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const statusLabel: Record<string, string> = { enviada: 'Enviada', respondida: 'Lead respondeu', contratada: 'Contratada', recusada: 'Sem interesse', expirada: 'Expirada', cancelada: 'Cancelada' };
const stopLabel: Record<string, string> = { lead_respondeu: 'lead respondeu', pausado_manual: 'pausado manualmente', sequencia_concluida: 'sequência concluída', contratada: 'contratou', recusada: 'sem interesse', cancelada: 'cancelada', expirada: 'expirada' };
const fuLabel: Record<string, string> = { pending: 'agendado', processing: 'enviando', sent: 'enviado', cancelled: 'interrompido', failed: 'falhou', skipped: 'pulado' };
const AREAS = ['Cível', 'Direito Médico', 'Médico preventivo', 'Consumidor', 'Administrativo', 'Família', 'Sucessões', 'Saúde', 'Imobiliário', 'Contratos', 'Empresas'];

const emptyDraft = { lead_id: '', contact_name: '', phone: '', area: 'Cível', title: '', amount: '', valid_until: plusDays(7), sent_at: new Date().toISOString().slice(0, 16), notes: '' };

export default function JornadaComercial() {
  const [tab, setTab] = useState<Tab>('propostas');
  const [orgId, setOrgId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { (async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle();
    if (p?.org_id) setOrgId(p.org_id); else setError('Organização do usuário não encontrada.');
  })(); }, []);
  const tabs: [Tab, string, any][] = [['propostas', 'Propostas e follow-up', FileSignature], ['metricas', 'Métricas mensais', BarChart3], ['honorarios', 'Honorários 2026', Scale], ['extraordinario', 'Atendimento extraordinário', Clock3]];
  const flash = (m: string) => { setNotice(m); setError(''); setTimeout(() => setNotice(''), 5000); };
  const fail = (m: string) => { setError(m); setNotice(''); };
  return <div className="module jornada-page">
    <div className="page-head"><div><h1>Jornada Comercial</h1><p>Da triagem boutique à contratação — propostas, follow-up, métricas e tabelas internas 2026.</p></div></div>
    <div className="campaign-tabs jornada-tabs" role="tablist">{tabs.map(([k, l, I]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => { setTab(k); setError(''); setNotice(''); }}><I size={15} />{l}</button>)}</div>
    {error && <div className="crm-error" role="alert">{error}</div>}
    {notice && <div className="integration-notice" role="status"><CheckCircle2 size={15} />{notice}</div>}
    {!orgId ? <div className="empty">Carregando...</div> :
      tab === 'propostas' ? <Proposals orgId={orgId} flash={flash} fail={fail} /> :
      tab === 'metricas' ? <Metrics orgId={orgId} /> :
      tab === 'honorarios' ? <Fees orgId={orgId} flash={flash} fail={fail} /> :
      <Extraordinary orgId={orgId} flash={flash} fail={fail} />}
  </div>;
}

function Proposals({ orgId, flash, fail }: { orgId: string; flash: (m: string) => void; fail: (m: string) => void }) {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [fus, setFus] = useState<Followup[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [filter, setFilter] = useState<'ativas' | 'todas'>('ativas');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ ...emptyDraft });
  async function load() {
    setLoading(true);
    const [p, f, l, w] = await Promise.all([
      supabase.from('commercial_proposals').select('*').eq('org_id', orgId).order('sent_at', { ascending: false }).limit(300),
      supabase.from('commercial_proposal_followups').select('id,proposal_id,step_day,scheduled_at,status,sent_at,error_message').eq('org_id', orgId).order('step_day'),
      supabase.from('leads').select('id,name,phone,whatsapp,stage_key').eq('org_id', orgId).neq('stage_key', 'perdido').order('updated_at', { ascending: false }).limit(300),
      supabase.from('whatsapp_settings').select('proposal_followup_enabled').eq('org_id', orgId).maybeSingle(),
    ]);
    if (p.error) fail(p.error.message);
    setRows((p.data || []) as Proposal[]); setFus((f.data || []) as Followup[]); setLeads((l.data || []) as Lead[]);
    setEnabled(w.data ? w.data.proposal_followup_enabled !== false : null);
    setLoading(false);
  }
  useEffect(() => { load(); }, [orgId]);
  function pickLead(id: string) {
    const l = leads.find(x => x.id === id);
    setDraft(d => ({ ...d, lead_id: id, contact_name: l?.name || d.contact_name, phone: l?.whatsapp || l?.phone || d.phone }));
  }
  async function save() {
    const digits = draft.phone.replace(/\D/g, '');
    if (!draft.contact_name.trim() || digits.length < 10 || !draft.title.trim()) { fail('Informe nome, WhatsApp (com DDD) e objeto da proposta.'); return; }
    const payload = {
      org_id: orgId, lead_id: draft.lead_id || null, contact_name: draft.contact_name.trim(),
      phone: digits.startsWith('55') ? digits : '55' + digits, area: draft.area || null, title: draft.title.trim(),
      amount: draft.amount ? Number(draft.amount) : null, valid_until: draft.valid_until || null,
      sent_at: draft.sent_at ? new Date(draft.sent_at).toISOString() : new Date().toISOString(), notes: draft.notes.trim() || null,
    };
    const { error } = await supabase.from('commercial_proposals').insert(payload);
    if (error) { fail(error.message); return; }
    setDraft({ ...emptyDraft, valid_until: plusDays(7), sent_at: new Date().toISOString().slice(0, 16) }); setShowNew(false);
    flash('Proposta registrada. O follow-up dos dias 2, 5, 7 e 30 foi agendado e para sozinho se o lead responder.');
    load();
  }
  function startEdit(p: Proposal) {
    setEditingId(p.id);
    setEditDraft({
      lead_id: p.lead_id || '', contact_name: p.contact_name || '', phone: p.phone || '', area: p.area || 'Cível',
      title: p.title || '', amount: p.amount == null ? '' : String(p.amount), valid_until: p.valid_until || '',
      sent_at: p.sent_at ? new Date(p.sent_at).toISOString().slice(0, 16) : '', notes: p.notes || ''
    });
  }
  async function saveEdit(p: Proposal) {
    const digits = editDraft.phone.replace(/\D/g, '');
    if (!editDraft.contact_name.trim() || digits.length < 10 || !editDraft.title.trim()) { fail('Informe nome, WhatsApp (com DDD) e objeto da proposta.'); return; }
    const { error } = await supabase.from('commercial_proposals').update({
      lead_id: editDraft.lead_id || null, contact_name: editDraft.contact_name.trim(),
      phone: digits.startsWith('55') ? digits : '55' + digits, area: editDraft.area || null, title: editDraft.title.trim(),
      amount: editDraft.amount ? Number(editDraft.amount) : null, valid_until: editDraft.valid_until || null,
      sent_at: editDraft.sent_at ? new Date(editDraft.sent_at).toISOString() : p.sent_at, notes: editDraft.notes.trim() || null,
      updated_at: new Date().toISOString()
    }).eq('id', p.id).eq('org_id', orgId);
    if (error) { fail(error.message); return; }
    setEditingId(null); flash('Proposta atualizada.'); load();
  }
  async function setStatus(p: Proposal, status: string) {
    const msg = status === 'contratada' ? 'Marcar como CONTRATADA? O follow-up será encerrado.' : status === 'recusada' ? 'Marcar como SEM INTERESSE? O follow-up será encerrado.' : 'Cancelar esta proposta? O follow-up será encerrado.';
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from('commercial_proposals').update({ status }).eq('id', p.id);
    if (error) { fail(error.message); return; }
    flash(status === 'contratada' ? 'Proposta contratada. Lembre-se de cadastrar o contrato e o processo no LEXOFFICE.' : 'Status atualizado e follow-up encerrado.');
    load();
  }
  async function pause(p: Proposal) {
    if (!window.confirm('Pausar o follow-up desta proposta? As mensagens pendentes não serão enviadas.')) return;
    const { error } = await supabase.from('commercial_proposals').update({ followup_active: false, stop_reason: 'pausado_manual' }).eq('id', p.id).eq('org_id', orgId);
    if (error) { fail(error.message); return; }
    flash('Follow-up pausado.'); load();
  }
  async function resume(p: Proposal) {
    if (!window.confirm('Retomar o follow-up desta proposta? Somente as etapas ainda não enviadas serão reativadas.')) return;
    const { error } = await supabase.from('commercial_proposals').update({ followup_active: true, stop_reason: null, updated_at: new Date().toISOString() }).eq('id', p.id).eq('org_id', orgId);
    if (error) { fail(error.message); return; }
    const { error: followupError } = await supabase.from('commercial_proposal_followups').update({ status: 'pending', error_message: null }).eq('proposal_id', p.id).eq('org_id', orgId).in('status', ['cancelled', 'skipped']).gte('scheduled_at', new Date().toISOString());
    if (followupError) { fail('A proposta foi reativada, mas houve falha ao reagendar as etapas pendentes: ' + followupError.message); await load(); return; }
    flash('Follow-up retomado. As etapas futuras pendentes foram reativadas.'); load();
  }
  async function toggleGlobal() {
    const next = !enabled;
    if (!next && !window.confirm('Desligar TODOS os follow-ups de proposta? Nenhuma mensagem de follow-up será enviada até religar.')) return;
    const { error } = await supabase.from('whatsapp_settings').update({ proposal_followup_enabled: next }).eq('org_id', orgId);
    if (error) { fail('Não foi possível alterar: ' + error.message); return; }
    setEnabled(next); flash(next ? 'Follow-up de propostas ligado.' : 'Follow-up de propostas desligado.');
  }
  const shown = rows.filter(r => filter === 'todas' || r.status === 'enviada' || r.status === 'respondida');
  const counts = useMemo(() => ({ ativas: rows.filter(r => r.followup_active).length, respondidas: rows.filter(r => r.status === 'respondida').length, contratadas: rows.filter(r => r.status === 'contratada').length }), [rows]);
  return <>
    <div className="crm-toolbar">
      <div className="crm-summary">
        <span className="crm-chip">{counts.ativas} com follow-up ativo</span>
        <span className="crm-chip">{counts.respondidas} aguardando retorno da Dra. Gláucia</span>
        <span className="crm-chip">{counts.contratadas} contratadas</span>
        {enabled !== null && <button type="button" className={`jornada-switch ${enabled ? 'on' : ''}`} onClick={toggleGlobal}>{enabled ? '● Follow-up ligado' : '○ Follow-up desligado'}</button>}
      </div>
      <div className="jornada-actions">
        <select value={filter} onChange={e => setFilter(e.target.value as any)} aria-label="Filtrar propostas"><option value="ativas">Em andamento</option><option value="todas">Todas</option></select>
        <button className="secondary" onClick={load} disabled={loading}><RefreshCw size={14} />Atualizar</button>
        <button className="integration-action" onClick={() => setShowNew(v => !v)}><Plus size={15} />Registrar proposta</button>
      </div>
    </div>
    {showNew && <div className="integration-panel crm-editor"><h3><FileSignature size={16} /> Registrar proposta enviada</h3>
      <div className="integration-form">
        <label>Lead do CRM (opcional)<select value={draft.lead_id} onChange={e => pickLead(e.target.value)}><option value="">— sem vínculo —</option>{leads.map(l => <option key={l.id} value={l.id}>{l.name}{(l.whatsapp || l.phone) ? ` · ${l.whatsapp || l.phone}` : ''}</option>)}</select></label>
        <label>Nome<input value={draft.contact_name} onChange={e => setDraft({ ...draft, contact_name: e.target.value })} /></label>
        <label>WhatsApp (com DDD)<input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="31 99999-9999" /></label>
        <label>Área<select value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></label>
        <label>Objeto da proposta<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Ex.: Ação contra plano com tutela de urgência" /></label>
        <label>Honorários propostos (R$)<input type="number" min="0" step="0.01" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} /></label>
        <label>Enviada em<input type="datetime-local" value={draft.sent_at} onChange={e => setDraft({ ...draft, sent_at: e.target.value })} /></label>
        <label>Válida até<input type="date" value={draft.valid_until} onChange={e => setDraft({ ...draft, valid_until: e.target.value })} /></label>
        <label className="wide">Observações internas<textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
        <div className="wide integration-notice">O follow-up sai pelo WhatsApp nos dias 2, 5, 7 e 30 após o envio, às 10h de dia útil (fim de semana passa para segunda). Ele para na hora se o lead responder, se você marcar Contratou/Sem interesse ou se pausar. O valor dos honorários nunca é mencionado nas mensagens.</div>
        <div className="crm-editor-actions"><button className="integration-action" onClick={save}><Save size={14} />Salvar e agendar follow-up</button><button className="secondary" onClick={() => setShowNew(false)}>Cancelar</button></div>
      </div></div>}
    {loading ? <div className="empty">Carregando propostas...</div> : shown.length === 0 ? <div className="empty">Nenhuma proposta {filter === 'ativas' ? 'em andamento' : 'registrada'}. Use “Registrar proposta” depois que a Dra. Gláucia enviar a proposta ao lead.</div> :
      <div className="jornada-cards">{shown.map(p => {
        const steps = fus.filter(f => f.proposal_id === p.id);
        return <article className="jornada-card" key={p.id}>
          <header><div><b>{p.contact_name}</b><small>{p.phone} · {p.area || 'Área não informada'}</small></div><span className={`jornada-status s-${p.status}`}>{statusLabel[p.status] || p.status}</span></header>
          {editingId === p.id ? <div className="integration-form crm-editor">
            <label>Nome<input value={editDraft.contact_name} onChange={e => setEditDraft({ ...editDraft, contact_name: e.target.value })} /></label>
            <label>WhatsApp<input value={editDraft.phone} onChange={e => setEditDraft({ ...editDraft, phone: e.target.value })} /></label>
            <label>Área<select value={editDraft.area} onChange={e => setEditDraft({ ...editDraft, area: e.target.value })}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></label>
            <label>Objeto da proposta<input value={editDraft.title} onChange={e => setEditDraft({ ...editDraft, title: e.target.value })} /></label>
            <label>Honorários propostos (R$)<input type="number" min="0" step="0.01" value={editDraft.amount} onChange={e => setEditDraft({ ...editDraft, amount: e.target.value })} /></label>
            <label>Enviada em<input type="datetime-local" value={editDraft.sent_at} onChange={e => setEditDraft({ ...editDraft, sent_at: e.target.value })} /></label>
            <label>Válida até<input type="date" value={editDraft.valid_until} onChange={e => setEditDraft({ ...editDraft, valid_until: e.target.value })} /></label>
            <label className="wide">Observações internas<textarea value={editDraft.notes} onChange={e => setEditDraft({ ...editDraft, notes: e.target.value })} /></label>
            <div className="wide crm-editor-actions"><button className="integration-action" onClick={() => saveEdit(p)}><Save size={14} />Salvar alterações</button><button className="secondary" onClick={() => setEditingId(null)}>Cancelar</button></div>
          </div> : <p className="jornada-title">{p.title}</p>}
          <div className="jornada-meta"><span>Honorários: <b>{money(p.amount)}</b></span><span>Enviada: {dateTimeBR(p.sent_at)}</span><span>Validade: {dateBR(p.valid_until)}</span></div>
          <div className="jornada-steps">{[2, 5, 7, 30].map(d => { const s = steps.find(x => x.step_day === d); return <div key={d} className={`jornada-step st-${s?.status || 'none'}`} title={s?.error_message || ''}><b>Dia {d}</b><small>{s ? fuLabel[s.status] || s.status : '—'}</small><small>{s ? (s.sent_at ? dateTimeBR(s.sent_at) : dateTimeBR(s.scheduled_at)) : ''}</small></div>; })}</div>
          {!p.followup_active && p.stop_reason && <small className="jornada-stop">Follow-up encerrado: {stopLabel[p.stop_reason] || p.stop_reason}</small>}
          {p.status === 'respondida' && <small className="jornada-stop warn">O lead respondeu — a Dra. Gláucia deve dar sequência à conversa.</small>}
          <div className="jornada-card-actions"><button className="secondary" onClick={() => startEdit(p)}><Pencil size={14} />Editar proposta</button></div>
          {['enviada', 'respondida'].includes(p.status) && <div className="jornada-card-actions">
            <button className="integration-action" onClick={() => setStatus(p, 'contratada')}><CheckCircle2 size={14} />Contratou</button>
            <button className="secondary" onClick={() => setStatus(p, 'recusada')}><XCircle size={14} />Sem interesse</button>
            {p.followup_active ? <button className="secondary" onClick={() => pause(p)}><Pause size={14} />Pausar follow-up</button> : p.stop_reason === 'pausado_manual' && <button className="secondary" onClick={() => resume(p)}><RefreshCw size={14} />Retomar follow-up</button>}
          </div>}
        </article>;
      })}</div>}
  </>;
}

type MetricRow = Record<string, any>;
function Metrics({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from('commercial_monthly_metrics').select('*').eq('org_id', orgId).order('month', { ascending: false }).limit(24);
    const r = (data || []) as MetricRow[];
    setRows(r);
    const current = new Date().toISOString().slice(0, 7);
    setMonth(m => m || (r.find(x => String(x.month).startsWith(current)) ? current : String(r[0]?.month || current).slice(0, 7)));
    setLoading(false);
  }
  useEffect(() => { load(); }, [orgId]);
  const m = rows.find(x => String(x.month).startsWith(month)) || {};
  const n = (k: string) => Number(m[k] || 0);
  const pct = (a: number, b: number) => b > 0 ? `${Math.round(a / b * 100)}%` : '—';
  const cards: [string, string, string, string][] = [
    ['Leads novos', String(n('leads_novos')), 'Leads qualificados → consulta paga', pct(n('consultas_pagas'), n('leads_novos'))],
    ['Consultas pagas', String(n('consultas_pagas')), 'Consulta paga → realizada (comparecimento)', pct(n('consultas_realizadas'), n('consultas_pagas'))],
    ['Consultas realizadas', String(n('consultas_realizadas')), 'Consultas → propostas enviadas', pct(n('propostas_enviadas'), n('consultas_realizadas'))],
    ['Propostas enviadas', String(n('propostas_enviadas')), 'Propostas → contratos', pct(n('propostas_contratadas'), n('propostas_enviadas'))],
    ['Leads quentes', String(n('leads_quentes')), 'Alertas à Dra. Gláucia enviados (meta: imediato)', `${n('alertas_glaucia_enviados')} enviados · ${n('alertas_glaucia_falhos')} falhas`],
    ['Follow-ups devidos', String(n('followups_devidos')), 'Executados no prazo (meta: 100%)', pct(n('followups_no_prazo'), n('followups_devidos'))],
    ['Contratos cadastrados', String(n('contratos_cadastrados')), 'Processos cadastrados no LEXOFFICE (meta: 100%)', String(n('processos_cadastrados'))],
    ['Parcelas inadimplentes', String(n('parcelas_inadimplentes_do_mes')), 'Falhas de automação (alertas não enviados)', String(n('falhas_de_alerta'))],
  ];
  const monthLabel = (v: string) => { const [y, mm] = v.split('-'); return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
  const months = Array.from(new Set([new Date().toISOString().slice(0, 7), ...rows.map(r => String(r.month).slice(0, 7))])).sort().reverse();
  return <>
    <div className="crm-toolbar"><div className="crm-summary"><span className="crm-chip">Indicadores da Jornada Comercial 2026</span></div>
      <div className="jornada-actions"><select value={month} onChange={e => setMonth(e.target.value)} aria-label="Mês">{months.map(v => <option key={v} value={v}>{monthLabel(v)}</option>)}</select><button className="secondary" onClick={load}><RefreshCw size={14} />Atualizar</button></div></div>
    {loading ? <div className="empty">Carregando métricas...</div> : <div className="report-grid jornada-metrics">{cards.map(([label, value, sub, rate]) => <div className="report-card" key={label}>
      <div className="report-card-head"><span>{label}</span><BarChart3 size={16} /></div><strong>{value}</strong>
      <div className="jornada-rate"><small>{sub}</small><b>{rate}</b></div></div>)}</div>}
    <p className="jornada-footnote">O ticket médio pode ser acompanhado como indicador financeiro, mas não deve funcionar como critério isolado de qualidade do cliente nem como rótulo de atendimento. “Consultas realizadas” conta os eventos de consulta na agenda cuja data já passou; “Follow-ups no prazo” considera os enviados até 1 dia após o horário agendado.</p>
  </>;
}

function Fees({ orgId, flash, fail }: { orgId: string; flash: (m: string) => void; fail: (m: string) => void }) {
  const [rows, setRows] = useState<Fee[]>([]);
  const [dirty, setDirty] = useState<Record<string, Fee>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  async function load() { setLoading(true); const { data, error } = await supabase.from('legal_fee_reference').select('*').eq('org_id', orgId).order('area').order('service'); if (error) fail(error.message); setRows((data || []) as Fee[]); setDirty({}); setLoading(false); }
  useEffect(() => { load(); }, [orgId]);
  const edit = (r: Fee, patch: Partial<Fee>) => { const next = { ...(dirty[r.id] || r), ...patch }; setDirty(d => ({ ...d, [r.id]: next })); };
  async function saveAll() {
    for (const r of Object.values(dirty)) {
      const { error } = await supabase.from('legal_fee_reference').update({ area: r.area, service: r.service, min_amount: r.min_amount, max_amount: r.max_amount, is_monthly: r.is_monthly, notes: r.notes, active: r.active, updated_at: new Date().toISOString() }).eq('id', r.id);
      if (error) { fail(error.message); return; }
    }
    flash('Tabela de honorários salva.'); load();
  }
  async function add() {
    const { error } = await supabase.from('legal_fee_reference').insert({ org_id: orgId, reference_year: 2026, area: 'Cível', service: 'Novo serviço', min_amount: null, notes: null });
    if (error) { fail(error.message); return; } load();
  }
  const shown = rows.filter(r => !q || (r.area + ' ' + r.service).toLowerCase().includes(q.toLowerCase()));
  const num = (v: string) => v === '' ? null : Number(v);
  return <>
    <div className="integration-notice jornada-warning"><Scale size={15} />Referência <b>interna</b> 2026. Deve ser confrontada, no fechamento de cada contratação, com a tabela mínima vigente da OAB/MG (corrigida mensalmente pelo INPC) e com a complexidade do caso. A IA não usa nem informa estes valores.</div>
    <div className="crm-toolbar"><div className="input-search"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar área ou serviço" aria-label="Buscar serviço" /></div>
      <div className="jornada-actions"><button className="secondary" onClick={add}><Plus size={14} />Adicionar serviço</button><button className="integration-action" onClick={saveAll} disabled={!Object.keys(dirty).length}><Save size={14} />Salvar alterações{Object.keys(dirty).length ? ` (${Object.keys(dirty).length})` : ''}</button></div></div>
    {loading ? <div className="empty">Carregando...</div> : <div className="table-wrap jornada-table"><table><thead><tr><th>Área</th><th>Serviço</th><th>A partir de (R$)</th><th>Até (R$)</th><th>Mensal</th><th>Observação</th><th>Ativo</th></tr></thead><tbody>
      {shown.map(r0 => { const r = dirty[r0.id] || r0; return <tr key={r.id} className={dirty[r.id] ? 'dirty' : ''}>
        <td><input value={r.area} onChange={e => edit(r0, { area: e.target.value })} aria-label="Área" /></td>
        <td><input value={r.service} onChange={e => edit(r0, { service: e.target.value })} aria-label="Serviço" /></td>
        <td><input type="number" min="0" step="100" value={r.min_amount ?? ''} onChange={e => edit(r0, { min_amount: num(e.target.value) })} aria-label="Valor mínimo" /></td>
        <td><input type="number" min="0" step="100" value={r.max_amount ?? ''} onChange={e => edit(r0, { max_amount: num(e.target.value) })} aria-label="Valor máximo" /></td>
        <td className="c"><input type="checkbox" checked={r.is_monthly} onChange={e => edit(r0, { is_monthly: e.target.checked })} aria-label="Valor mensal" /></td>
        <td><input value={r.notes || ''} onChange={e => edit(r0, { notes: e.target.value || null })} aria-label="Observação" /></td>
        <td className="c"><input type="checkbox" checked={r.active} onChange={e => edit(r0, { active: e.target.checked })} aria-label="Ativo" /></td>
      </tr>; })}
    </tbody></table></div>}
  </>;
}

function Extraordinary({ orgId, flash, fail }: { orgId: string; flash: (m: string) => void; fail: (m: string) => void }) {
  const [rows, setRows] = useState<Extra[]>([]);
  const [dirty, setDirty] = useState<Record<string, Extra>>({});
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); const { data, error } = await supabase.from('extraordinary_service_fees').select('*').eq('org_id', orgId).order('sort_order'); if (error) fail(error.message); setRows((data || []) as Extra[]); setDirty({}); setLoading(false); }
  useEffect(() => { load(); }, [orgId]);
  const edit = (r: Extra, patch: Partial<Extra>) => setDirty(d => ({ ...d, [r.id]: { ...(d[r.id] || r), ...patch } }));
  async function saveAll() {
    for (const r of Object.values(dirty)) {
      const { error } = await supabase.from('extraordinary_service_fees').update({ period_label: r.period_label, amount: r.amount, unit: r.unit, condition: r.condition, active: r.active, updated_at: new Date().toISOString() }).eq('id', r.id);
      if (error) { fail(error.message); return; }
    }
    flash('Tabela de atendimento extraordinário salva. Se mudar valores, avise para atualizarmos também as instruções da Helena.'); load();
  }
  return <>
    <div className="integration-notice jornada-warning"><ClipboardList size={15} />Somente para <b>clientes contratados</b>. Atendimento ordinário: segunda a sexta, das 8h às 18h. A taxa não incide quando o atendimento decorre de prazo ou providência já incluídos no objeto contratado ou de fato imputável ao escritório. Quem não é cliente não entra nesta tabela: aplica-se a Consulta Jurídica de R$ 300,00.</div>
    <div className="crm-toolbar"><div className="crm-summary"><span className="crm-chip">Valores conforme cláusula contratual vigente</span></div><div className="jornada-actions"><button className="integration-action" onClick={saveAll} disabled={!Object.keys(dirty).length}><Save size={14} />Salvar alterações</button></div></div>
    {loading ? <div className="empty">Carregando...</div> : <div className="table-wrap jornada-table"><table><thead><tr><th>Período</th><th>Honorários (R$)</th><th>Unidade</th><th>Condição</th><th>Ativo</th></tr></thead><tbody>
      {rows.map(r0 => { const r = dirty[r0.id] || r0; return <tr key={r.id} className={dirty[r.id] ? 'dirty' : ''}>
        <td><input value={r.period_label} onChange={e => edit(r0, { period_label: e.target.value })} aria-label="Período" /></td>
        <td><input type="number" min="0" step="50" value={r.amount ?? ''} onChange={e => edit(r0, { amount: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Valor" /></td>
        <td><input value={r.unit || ''} onChange={e => edit(r0, { unit: e.target.value || null })} aria-label="Unidade" /></td>
        <td><input value={r.condition || ''} onChange={e => edit(r0, { condition: e.target.value || null })} aria-label="Condição" /></td>
        <td className="c"><input type="checkbox" checked={r.active} onChange={e => edit(r0, { active: e.target.checked })} aria-label="Ativo" /></td>
      </tr>; })}
    </tbody></table></div>}
  </>;
}

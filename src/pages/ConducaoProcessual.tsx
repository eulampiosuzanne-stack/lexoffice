import { useEffect, useMemo, useState } from 'react';
import { Compass, Search, Loader2, Gavel, ListChecks, CalendarClock, FileSignature, Scale, AlertTriangle, CheckCircle2, X, Copy, Download, Save, Plus, Trash2, RefreshCw, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './integrations.css';
import './document-library.css';
import './petition-assistant.css';
import './conducao-processual.css';

// Condução Processual: depois do ajuizamento, a LEX acompanha o processo fase a fase, de acordo com o perfil
// do juízo (pesquisa pública da vara no DJEN, função judge-analysis), controla prazos e o checklist de provas
// e redige as minutas para a Dra. revisar e protocolar. Nada é protocolado nem enviado ao cliente daqui.

type Proc = { id: string; client_id?: string | null; cnj_number?: string | null; internal_number?: string | null; subject?: string | null; class_name?: string | null; vara?: string | null; comarca?: string | null; court?: string | null; area?: string | null; status?: string | null; is_confidential?: boolean | null; opposing_party?: string | null; pole?: string | null; clients?: { name?: string | null } | null };
type Mov = { id: string; movement_date: string; title?: string | null; description?: string | null; source?: string | null };
type Deadline = { id: string; title: string; due_at: string; status: string; priority?: string | null; description?: string | null };
type Hearing = { id: string; title?: string | null; starts_at: string; hearing_type?: string | null; status?: string | null; location?: string | null };
type Check = { item: string; done: boolean; origem?: string };
type Draft = { id: string; kind: string; title: string; content: string; created_at: string };

export const PHASES = [
  { key: 'citacao', label: 'Citação e resposta do réu', re: /cita[cç][aã]o|cite-se|mandado de cita|aguardando contesta|distribu[ií]d/ },
  { key: 'replica', label: 'Contestação / Réplica', re: /contesta[cç][aã]o|r[eé]plica|impugna[cç][aã]o [àa] contesta/ },
  { key: 'provas', label: 'Especificação de provas', re: /especifi\w* (as )?provas|especifica[cç][aã]o de provas|provas que pretendem produzir|indiquem as provas/ },
  { key: 'saneamento', label: 'Saneamento', re: /saneamento|saneador|pontos? controvertidos?/ },
  { key: 'instrucao', label: 'Instrução (perícia / audiência)', re: /per[ií]cia|perito|laudo|audi[eê]ncia de instru|instru[cç][aã]o e julgamento|rol de testemunhas/ },
  { key: 'alegacoes', label: 'Alegações finais / Memoriais', re: /alega[cç][oõ]es finais|memoriais|encerrada a instru/ },
  { key: 'sentenca', label: 'Sentença', re: /senten[cç]a|julgo (parcialmente )?(im)?procedente/ },
  { key: 'recurso', label: 'Recurso', re: /apela[cç][aã]o|recurso|contrarraz|ac[oó]rd[aã]o|embargos de declara/ },
  { key: 'cumprimento', label: 'Cumprimento de sentença', re: /cumprimento de senten|execu[cç][aã]o|penhora|bacenjud|sisbajud|alvar[aá]/ },
] as const;
type PhaseKey = typeof PHASES[number]['key'];
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// A fase atual é a mais avançada que aparece nos andamentos (o processo só anda para frente).
export function detectPhase(movs: { title?: string | null; description?: string | null }[]): PhaseKey {
  let idx = 0;
  for (const m of movs) {
    const t = norm(`${m.title || ''} ${String(m.description || '').slice(0, 1500)}`);
    PHASES.forEach((p, i) => { if (i > idx && p.re.test(t)) idx = i; });
  }
  return PHASES[idx].key;
}

const GUIDE: Record<PhaseKey, { foco: string; passos: string[]; minutas: string[] }> = {
  citacao: { foco: 'Garantir a citação válida e preparar a réplica antes de a contestação chegar.', passos: ['Conferir se o mandado/AR de citação voltou positivo; se negativo, pedir nova diligência ou citação por outro meio.', 'Acompanhar o prazo de contestação do réu.', 'Separar desde já os documentos que rebatem as defesas mais prováveis.', 'Verificar pedido de tutela pendente de apreciação.'], minutas: ['manifestacao', 'tutela'] },
  replica: { foco: 'Impugnar a contestação ponto a ponto e já indicar as provas que o juízo costuma deferir.', passos: ['Ler a contestação e listar preliminares, documentos novos e fatos impeditivos.', 'Protocolar a réplica no prazo (15 dias úteis).', 'Rebater documentos juntados pelo réu.', 'Antecipar, na réplica, as provas que serão requeridas.'], minutas: ['replica', 'especificacao_provas'] },
  provas: { foco: 'Requerer as provas que este juízo efetivamente defere, com fundamento de pertinência.', passos: ['Especificar provas de forma justificada (pertinência e utilidade).', 'Se o juízo tende ao julgamento antecipado, reforçar a prova documental.', 'Indicar quesitos e assistente técnico se houver perícia.', 'Requerer inversão do ônus da prova quando cabível.'], minutas: ['especificacao_provas', 'quesitos'] },
  saneamento: { foco: 'Conferir a decisão saneadora e corrigir o que for desfavorável.', passos: ['Conferir os pontos controvertidos fixados.', 'Pedir esclarecimentos/ajustes em 5 dias, se necessário (art. 357, §1º, CPC).', 'Cumprir prazos para rol de testemunhas e quesitos.'], minutas: ['manifestacao', 'rol_testemunhas', 'quesitos'] },
  instrucao: { foco: 'Produzir a prova com o máximo aproveitamento perante este juízo.', passos: ['Apresentar rol de testemunhas e intimar quando necessário.', 'Acompanhar a perícia e o depósito de honorários periciais.', 'Manifestar sobre o laudo no prazo.', 'Preparar o cliente e as testemunhas para a audiência.'], minutas: ['rol_testemunhas', 'manifestacao_laudo', 'quesitos'] },
  alegacoes: { foco: 'Fechar a tese com base na prova produzida.', passos: ['Apresentar alegações finais/memoriais no prazo.', 'Destacar a prova favorável e os pontos controvertidos resolvidos.', 'Reforçar os pedidos e os valores.'], minutas: ['memoriais'] },
  sentenca: { foco: 'Avaliar a sentença e decidir os próximos passos com o cliente.', passos: ['A Dra. comunica a sentença pessoalmente ao cliente.', 'Avaliar embargos de declaração (5 dias úteis).', 'Avaliar apelação (15 dias úteis) e custas de preparo.'], minutas: ['embargos', 'manifestacao'] },
  recurso: { foco: 'Recurso ou contrarrazões dentro do prazo.', passos: ['Conferir prazo de apelação/contrarrazões.', 'Conferir preparo e gratuidade.', 'Acompanhar a distribuição na câmara e eventual sustentação oral.'], minutas: ['contrarrazoes', 'manifestacao'] },
  cumprimento: { foco: 'Receber o crédito.', passos: ['Apresentar cálculo atualizado (aba Calculadoras).', 'Requerer intimação para pagamento (art. 523 do CPC) e penhora on-line.', 'Pedir expedição de alvará quando houver depósito.'], minutas: ['cumprimento', 'manifestacao'] },
};
const DRAFTS: Record<string, string> = {
  replica: 'Réplica (impugnação à contestação)',
  especificacao_provas: 'Especificação de provas',
  quesitos: 'Quesitos para perícia',
  rol_testemunhas: 'Rol de testemunhas',
  manifestacao_laudo: 'Manifestação sobre o laudo pericial',
  memoriais: 'Alegações finais / Memoriais',
  embargos: 'Embargos de declaração',
  contrarrazoes: 'Contrarrazões de apelação',
  cumprimento: 'Pedido de cumprimento de sentença',
  tutela: 'Reiteração do pedido de tutela de urgência',
  manifestacao: 'Manifestação simples',
};
const PHASE_CHECK: Record<PhaseKey, string[]> = {
  citacao: ['Comprovante de citação juntado'], replica: ['Réplica protocolada', 'Documentos do réu impugnados'],
  provas: ['Especificação de provas protocolada'], saneamento: ['Pontos controvertidos conferidos'],
  instrucao: ['Rol de testemunhas apresentado', 'Quesitos apresentados', 'Cliente preparado para a audiência'],
  alegacoes: ['Memoriais protocolados'], sentenca: ['Cliente informado pela Dra.', 'Prazo de recurso avaliado'],
  recurso: ['Recurso/contrarrazões protocolados', 'Preparo conferido'], cumprimento: ['Cálculo atualizado', 'Pedido de penhora on-line'],
};

const brDT = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const brD = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '');
const daysLeft = (v: string) => Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
const safeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
const procLabel = (p?: Proc | null) => (p ? `${p.cnj_number || p.internal_number || 'Sem número'} · ${p.clients?.name || 'Cliente'}` : '');

async function fnError(error: any) {
  let msg = error?.message || 'Falha na comunicação.';
  try { const ctx = error?.context; if (ctx?.json) { const j = await ctx.json(); msg = j?.error || msg; } } catch { /* mantém */ }
  return msg;
}

export default function ConducaoProcessual() {
  const [procs, setProcs] = useState<Proc[]>([]);
  const [filter, setFilter] = useState('');
  const [procId, setProcId] = useState(() => new URLSearchParams(window.location.search).get('processo') || '');
  const [movs, setMovs] = useState<Mov[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisAt, setAnalysisAt] = useState('');
  const [state, setState] = useState<{ phase_override: string | null; checklist: Check[]; notes: string }>({ phase_override: null, checklist: [], notes: '' });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftKind, setDraftKind] = useState('');
  const [draftText, setDraftText] = useState('');
  const [draftExtra, setDraftExtra] = useState('');
  const [newItem, setNewItem] = useState('');
  const [newDl, setNewDl] = useState({ title: '', due: '' });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data: org } = await supabase.rpc('current_org_id');
      setOrgId(String(org || ''));
      const { data, error } = await supabase.from('processes').select('id,client_id,cnj_number,internal_number,subject,class_name,vara,comarca,court,area,status,is_confidential,opposing_party,pole,clients(name)').eq('status', 'active').order('updated_at', { ascending: false }).limit(1000);
      if (error) setNotice({ kind: 'error', text: 'Não foi possível carregar os processos: ' + error.message });
      setProcs((data as any) || []);
    })();
  }, []);

  const proc = useMemo(() => procs.find(p => p.id === procId) || null, [procs, procId]);
  const list = useMemo(() => {
    const f = norm(filter).trim();
    const base = procs.filter(p => (p.cnj_number || '').replace(/\D/g, '').length === 20);
    if (!f) return base.slice(0, 80);
    return base.filter(p => norm(`${p.cnj_number} ${p.internal_number} ${p.clients?.name} ${p.subject} ${p.opposing_party}`).includes(f)).slice(0, 80);
  }, [procs, filter]);

  async function loadProcess(id: string) {
    if (!supabase || !id) return;
    setBusy('load'); setNotice(null); setDraftText(''); setDraftKind('');
    const [m, d, h, a, c, dr] = await Promise.all([
      supabase.from('process_movements').select('id,movement_date,title,description,source').eq('process_id', id).order('movement_date', { ascending: false }).limit(200),
      supabase.from('process_deadlines').select('id,title,due_at,status,priority,description').eq('process_id', id).order('due_at', { ascending: true }).limit(100),
      supabase.from('process_hearings').select('id,title,starts_at,hearing_type,status,location').eq('process_id', id).order('starts_at', { ascending: true }).limit(50),
      supabase.from('process_judge_analyses').select('result,created_at').eq('process_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('process_conduction').select('phase_override,checklist,notes').eq('process_id', id).maybeSingle(),
      supabase.from('process_conduction_drafts').select('id,kind,title,content,created_at').eq('process_id', id).order('created_at', { ascending: false }).limit(30),
    ]);
    setMovs((m.data as any) || []); setDeadlines((d.data as any) || []); setHearings((h.data as any) || []);
    setAnalysis(a.data?.result || null); setAnalysisAt(a.data?.created_at || '');
    setState({ phase_override: c.data?.phase_override || null, checklist: Array.isArray(c.data?.checklist) ? c.data!.checklist as Check[] : [], notes: c.data?.notes || '' });
    setDrafts((dr.data as any) || []);
    setBusy('');
  }
  useEffect(() => { if (procId) { loadProcess(procId); const u = new URL(window.location.href); u.searchParams.set('processo', procId); window.history.replaceState(null, '', u.toString()); } }, [procId]);

  const autoPhase = useMemo(() => detectPhase(movs), [movs]);
  const phase = (state.phase_override as PhaseKey) || autoPhase;
  const phaseIdx = PHASES.findIndex(p => p.key === phase);
  const guide = GUIDE[phase];

  const suggestedChecks = useMemo(() => {
    const fromJudge = (analysis?.analise?.provas_que_pede || analysis?.provas || []).map((p: any) => `Prova: ${p?.prova || p?.item || p}`).filter((s: string) => !/undefined|\[object/.test(s)).slice(0, 6);
    return [...PHASE_CHECK[phase], ...fromJudge];
  }, [phase, analysis]);

  async function saveState(next: typeof state) {
    setState(next);
    if (!supabase || !proc) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('process_conduction').upsert({ process_id: proc.id, org_id: orgId, phase_override: next.phase_override, checklist: next.checklist, notes: next.notes, updated_by: u?.user?.id || null, updated_at: new Date().toISOString() });
    if (error) setNotice({ kind: 'error', text: 'Não foi possível salvar: ' + error.message });
  }
  function toggleCheck(item: string, origem?: string) {
    const exists = state.checklist.find(c => c.item === item);
    const checklist = exists ? state.checklist.map(c => (c.item === item ? { ...c, done: !c.done } : c)) : [...state.checklist, { item, done: true, origem }];
    saveState({ ...state, checklist });
  }
  function addCheck() {
    const t = newItem.trim(); if (!t || state.checklist.some(c => c.item === t)) return;
    saveState({ ...state, checklist: [...state.checklist, { item: t, done: false, origem: 'manual' }] }); setNewItem('');
  }
  function removeCheck(item: string) { saveState({ ...state, checklist: state.checklist.filter(c => c.item !== item) }); }

  async function runAnalysis() {
    if (!supabase || !proc) return;
    setBusy('analysis'); setNotice({ kind: 'info', text: 'Pesquisando as publicações públicas da vara no DJEN… pode levar até 1 minuto.' });
    const { data, error } = await supabase.functions.invoke('judge-analysis', { body: { process_id: proc.id }, headers: { 'x-region': 'sa-east-1' } });
    setBusy('');
    if (error || data?.ok === false) { setNotice({ kind: 'error', text: error ? await fnError(error) : data?.error || 'A análise não foi concluída.' }); return; }
    setAnalysis(data.result); setAnalysisAt(data.created_at || new Date().toISOString());
    setNotice({ kind: 'ok', text: 'Perfil do juízo atualizado.' });
  }

  async function makeDraft(kind: string) {
    if (!supabase || !proc) return;
    setDraftKind(kind); setBusy('draft'); setNotice({ kind: 'info', text: `Redigindo: ${DRAFTS[kind]}…` });
    const juizo = analysis ? { vara: analysis.vara?.nome, resumo: analysis.analise?.resumo, provas_que_pede: analysis.analise?.provas_que_pede || analysis.provas, estrategia: analysis.analise?.estrategia, alertas: analysis.analise?.alertas } : null;
    const input = JSON.stringify({
      peca: DRAFTS[kind], fase_atual: PHASES[phaseIdx].label,
      processo: { numero: proc.cnj_number, classe: proc.class_name, assunto: proc.subject, area: proc.area, vara: proc.vara || analysis?.vara?.nome, comarca: proc.comarca, cliente: proc.clients?.name, polo_do_cliente: proc.pole, parte_contraria: proc.opposing_party },
      andamentos_recentes: movs.slice(0, 15).map(m => ({ data: String(m.movement_date).slice(0, 10), titulo: m.title, descricao: String(m.description || '').slice(0, 700) })),
      perfil_do_juizo: juizo, orientacoes_da_advogada: draftExtra || null,
    });
    const instructions = 'Você é advogada sênior do escritório Suzanne Figueiredo — Advocacia e Soluções Jurídicas (OAB/MG). Redija a peça processual pedida, completa, em português jurídico formal, pronta para revisão: endereçamento ao juízo, qualificação resumida por referência ("já qualificada nos autos"), fatos processuais relevantes, fundamentação (CPC e legislação material pertinente), pedidos e fecho com local, data e "Suzanne Figueiredo — OAB/MG [●]". Ajuste a estratégia ao perfil do juízo quando informado (provas que costuma deferir, tendência a julgamento antecipado etc.). Regras: não invente fatos, datas, valores, nomes, números de documentos nem jurisprudência; onde faltar dado, use [●] e diga o que preencher. Não cite precedentes que não foram fornecidos. Texto corrido, sem markdown, sem asteriscos, títulos em CAIXA ALTA.';
    const { data, error } = await supabase.functions.invoke('ai-provider-gateway', { body: { org_id: orgId, provider: 'auto', purpose: 'process_conduction_draft', agent_key: 'process_conduction', instructions, input } });
    setBusy('');
    if (error || !data?.ok || !String(data?.text || '').trim()) { setNotice({ kind: 'error', text: error ? await fnError(error) : 'A IA não conseguiu redigir agora. Tente de novo em instantes.' }); return; }
    const text = String(data.text).replace(/^```\w*|```$/g, '').replace(/\*\*/g, '').trim();
    setDraftText(text);
    const { data: u } = await supabase.auth.getUser();
    const ins = await supabase.from('process_conduction_drafts').insert({ org_id: orgId, process_id: proc.id, kind, title: DRAFTS[kind], content: text, created_by: u?.user?.id || null }).select('id,kind,title,content,created_at').single();
    if (!ins.error && ins.data) setDrafts(v => [ins.data as any, ...v]);
    setNotice({ kind: 'ok', text: 'Minuta pronta. Revise antes de protocolar.' });
  }

  async function downloadDraft() {
    if (!supabase || !draftText) return;
    const title = `${DRAFTS[draftKind] || 'Minuta'} - ${proc?.cnj_number || ''}`;
    let blob: Blob = new Blob([]), ext = 'docx';
    try {
      const { data, error } = await supabase.functions.invoke('document-generate', { body: { action: 'timbrado_docx', text: draftText } });
      if (error || !(data instanceof Blob) || data.size < 2000) throw new Error('fallback');
      blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    } catch {
      const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
      blob = new Blob(['﻿', `<html><head><meta charset="utf-8"><style>body{font-family:"Times New Roman";font-size:12pt;line-height:1.5}p{text-align:justify}</style></head><body>${draftText.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</body></html>`], { type: 'application/msword' }); ext = 'doc';
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safeName(title)}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function addDeadline() {
    if (!supabase || !proc || !newDl.title.trim() || !newDl.due) { setNotice({ kind: 'error', text: 'Informe o título e a data do prazo.' }); return; }
    const { data: u } = await supabase.auth.getUser();
    const due = new Date(`${newDl.due}T23:59:00-03:00`).toISOString();
    const { error } = await supabase.from('process_deadlines').insert({ org_id: orgId, process_id: proc.id, client_id: proc.client_id || null, title: newDl.title.trim(), due_at: due, deadline_type: 'processual', priority: daysLeft(due) <= 5 ? 'urgent' : 'high', status: 'pending', remind_3_days: true, remind_1_day: true, remind_same_day: true, owner_user_id: u?.user?.id, source_kind: 'conducao_processual' });
    if (error) { setNotice({ kind: 'error', text: 'Não foi possível criar o prazo: ' + error.message }); return; }
    setNewDl({ title: '', due: '' }); setNotice({ kind: 'ok', text: 'Prazo criado. Ele aparece também na Agenda e nos lembretes.' }); loadProcess(proc.id);
  }
  async function finishDeadline(d: Deadline) {
    if (!supabase) return;
    const { error } = await supabase.from('process_deadlines').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', d.id);
    if (error) { setNotice({ kind: 'error', text: 'Não foi possível concluir: ' + error.message }); return; }
    setDeadlines(v => v.map(x => (x.id === d.id ? { ...x, status: 'completed' } : x)));
  }

  const openDeadlines = deadlines.filter(d => !/complet|conclu|done|cancel/i.test(d.status));
  const nextHearings = hearings.filter(h => new Date(h.starts_at).getTime() > Date.now() - 86400000 && !/cancel/i.test(h.status || ''));
  const ai = analysis?.analise;
  const allChecks = [...new Set([...suggestedChecks, ...state.checklist.map(c => c.item)])];

  return (
    <div className="documents-v2-page petition-page conducao-page">
      <header className="documents-v2-header">
        <div>
          <h1>Condução Processual</h1>
          <p>Depois do ajuizamento, a LEX acompanha o processo fase a fase de acordo com o perfil do juízo: orienta o próximo passo, controla prazos e provas e redige as minutas para a sua revisão.</p>
        </div>
      </header>

      {notice && (
        <div className={`documents-v2-notice pa-notice pa-${notice.kind}`}>
          {notice.kind === 'error' ? <AlertTriangle size={17} /> : notice.kind === 'ok' ? <CheckCircle2 size={17} /> : <Loader2 size={17} className="spin" />}
          <span>{notice.text}</span>
          <button className="pa-x" onClick={() => setNotice(null)} aria-label="Fechar"><X size={15} /></button>
        </div>
      )}

      <section className="doc-upload-card">
        <div className="doc-section-title"><span className="doc-section-icon"><Search size={20} /></span><div><h2>Processo ajuizado</h2><p>Somente processos ativos com número CNJ aparecem aqui.</p></div></div>
        <div className="doc-upload-grid">
          <label><span>Buscar por número, cliente, assunto ou parte contrária</span><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Ex.: 5001234 ou nome do cliente" /></label>
          <label><span>Processo</span><select value={procId} onChange={e => setProcId(e.target.value)}><option value="">Selecione…</option>{proc && !list.some(p => p.id === proc.id) && <option value={proc.id}>{procLabel(proc)}</option>}{list.map(p => <option key={p.id} value={p.id}>{procLabel(p)}</option>)}</select></label>
        </div>
        {proc && <p className="pa-muted cp-procline"><Gavel size={14} /> {proc.class_name || 'Classe não informada'} · {proc.subject || 'Assunto não informado'} · {proc.vara || analysis?.vara?.nome || 'Vara não informada'}{proc.comarca ? ` · ${proc.comarca}` : ''}{proc.is_confidential ? ' · Segredo de justiça' : ''}</p>}
      </section>

      {proc && busy === 'load' && <div className="doc-empty"><Loader2 className="spin" size={18} /> Carregando o processo…</div>}

      {proc && busy !== 'load' && (<>
        <section className="doc-library-card">
          <div className="doc-section-title"><span className="doc-section-icon"><Compass size={20} /></span><div><h2>Fase atual e próximo passo</h2><p>Fase identificada pelos andamentos ({movs.length} lidos). Você pode corrigir se estiver diferente.</p></div></div>
          <ol className="cp-phases">{PHASES.map((p, i) => <li key={p.key} className={i < phaseIdx ? 'done' : i === phaseIdx ? 'now' : ''}>{p.label}</li>)}</ol>
          <div className="pa-row">
            <label className="cp-inline"><span>Fase</span><select value={state.phase_override || ''} onChange={e => saveState({ ...state, phase_override: e.target.value || null })}><option value="">Automática ({PHASES.find(p => p.key === autoPhase)?.label})</option>{PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
          </div>
          <div className="cp-focus"><b>Foco agora:</b> {guide.foco}</div>
          <ul className="cp-steps">{guide.passos.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {ai?.proximo_passo_provavel && <div className="cp-focus"><b>Próximo passo provável neste juízo:</b> {ai.proximo_passo_provavel}</div>}
        </section>

        <section className="doc-library-card">
          <div className="doc-section-title"><span className="doc-section-icon"><Scale size={20} /></span><div><h2>Perfil do juízo</h2><p>Pesquisa pública da vara (DJEN/CNJ). Processos em segredo de justiça não entram na base. {analysisAt ? `Última análise: ${brDT(analysisAt)}.` : 'Ainda não analisado.'}</p></div></div>
          <div className="pa-row end"><button className="doc-primary" onClick={runAnalysis} disabled={busy !== ''}>{busy === 'analysis' ? <Loader2 size={17} className="spin" /> : <RefreshCw size={17} />} {analysis ? 'Atualizar análise' : 'Analisar o juízo'}</button></div>
          {analysis && (<>
            <p className="pa-muted"><b>{analysis.vara?.nome || 'Vara'}</b> · {analysis.base?.publicacoes ?? 0} publicações lidas ({analysis.base?.sentencas ?? 0} sentenças) · período {brD(analysis.base?.periodo?.de)} a {brD(analysis.base?.periodo?.ate)}{analysis.juizes?.length ? ` · Magistrado(a): ${analysis.juizes.map((j: any) => j.nome).join(', ')}` : ''}{ai?.confianca ? ` · Confiança: ${ai.confianca}` : ''}</p>
            {ai?.resumo && <p>{ai.resumo}</p>}
            <div className="pa-cols">
              <div><h3>Provas que costuma determinar</h3>{(ai?.provas_que_pede || []).length ? <ul>{ai.provas_que_pede.map((p: any, i: number) => <li key={i}><b>{p.prova}</b>{p.frequencia ? ` (${p.frequencia})` : ''}{p.comentario ? ` — ${p.comentario}` : ''}</li>)}</ul> : (analysis.provas || []).length ? <ul>{analysis.provas.map((p: any, i: number) => <li key={i}><b>{p.item}</b> ({p.vezes}x)</li>)}</ul> : <p className="pa-muted">Sem padrão identificado.</p>}</div>
              <div><h3>Estratégia sugerida</h3>{(ai?.estrategia || []).length ? <ul>{ai.estrategia.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p className="pa-muted">Sem leitura por IA nesta análise.</p>}</div>
            </div>
            {ai?.ritmo && <p className="pa-muted"><b>Ritmo deste processo:</b> {ai.ritmo}</p>}
            {(ai?.alertas || []).length > 0 && <div className="pa-warn"><AlertTriangle size={16} /> {ai.alertas.join(' · ')}</div>}
            {analysis.aviso && <p className="pa-muted">{analysis.aviso}</p>}
          </>)}
        </section>

        <section className="doc-library-card">
          <div className="doc-section-title"><span className="doc-section-icon"><CalendarClock size={20} /></span><div><h2>Prazos e audiências</h2><p>Os prazos criados aqui entram na Agenda e nos lembretes automáticos.</p></div></div>
          {openDeadlines.length === 0 && nextHearings.length === 0 && <p className="pa-muted">Nenhum prazo em aberto nem audiência futura.</p>}
          <ul className="cp-list">
            {openDeadlines.map(d => { const n = daysLeft(d.due_at); return <li key={d.id} className={n < 0 ? 'late' : n <= 3 ? 'soon' : ''}><span><b>{d.title}</b> · vence {brD(d.due_at)} {n < 0 ? `(vencido há ${-n} dia(s))` : n === 0 ? '(hoje)' : `(em ${n} dia(s))`}</span><button className="doc-refresh" onClick={() => finishDeadline(d)}><CheckCircle2 size={15} /> Concluir</button></li>; })}
            {nextHearings.map(h => <li key={h.id}><span><b>{h.title || h.hearing_type || 'Audiência'}</b> · {brDT(h.starts_at)}{h.location ? ` · ${h.location}` : ''}</span></li>)}
          </ul>
          <div className="pa-row">
            <input className="cp-input" value={newDl.title} onChange={e => setNewDl({ ...newDl, title: e.target.value })} placeholder="Novo prazo (ex.: Réplica)" />
            <input className="cp-input" type="date" value={newDl.due} onChange={e => setNewDl({ ...newDl, due: e.target.value })} />
            <button className="doc-primary" onClick={addDeadline}><Plus size={16} /> Adicionar prazo</button>
          </div>
        </section>

        <section className="doc-library-card">
          <div className="doc-section-title"><span className="doc-section-icon"><ListChecks size={20} /></span><div><h2>Checklist de provas e providências</h2><p>Sugestões da fase atual e do perfil do juízo. Marque o que já foi feito.</p></div></div>
          <div className="pa-docs">{allChecks.map(item => { const c = state.checklist.find(x => x.item === item); return (
            <label key={item} className={c?.done ? 'on' : ''}><input type="checkbox" checked={!!c?.done} onChange={() => toggleCheck(item, suggestedChecks.includes(item) ? 'sugestao' : 'manual')} /><b title={item}>{item}</b>{c?.origem === 'manual' && <button className="pa-x" onClick={e => { e.preventDefault(); removeCheck(item); }} aria-label="Remover"><Trash2 size={13} /></button>}</label>); })}</div>
          <div className="pa-row"><input className="cp-input wide" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCheck(); }} placeholder="Adicionar item (ex.: Ofício ao INSS)" /><button className="doc-refresh" onClick={addCheck}><Plus size={16} /> Adicionar</button></div>
          <label className="pa-block"><span>Anotações da condução</span><textarea rows={3} value={state.notes} onChange={e => setState({ ...state, notes: e.target.value })} onBlur={() => saveState(state)} placeholder="Ex.: juiz costuma indeferir perícia; reforçar prova documental." /></label>
        </section>

        <section className="doc-library-card">
          <div className="doc-section-title"><span className="doc-section-icon"><FileSignature size={20} /></span><div><h2>Minutas</h2><p>A LEX redige com base na fase, nos andamentos e no perfil do juízo. Nada é protocolado automaticamente: revise e protocole.</p></div></div>
          <div className="cp-draft-buttons">
            {guide.minutas.map(k => <button key={k} className="doc-primary" disabled={busy !== ''} onClick={() => makeDraft(k)}>{busy === 'draft' && draftKind === k ? <Loader2 size={16} className="spin" /> : <FileSignature size={16} />} {DRAFTS[k]}</button>)}
            <select className="cp-input" value="" disabled={busy !== ''} onChange={e => e.target.value && makeDraft(e.target.value)}><option value="">Outra peça…</option>{Object.entries(DRAFTS).filter(([k]) => !guide.minutas.includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <label className="pa-block"><span>Orientações para a minuta (opcional)</span><textarea rows={2} value={draftExtra} onChange={e => setDraftExtra(e.target.value)} placeholder="Ex.: impugnar o laudo no ponto da incapacidade; pedir nova perícia." /></label>
          {draftText && (<>
            <h3>{DRAFTS[draftKind]}</h3>
            <textarea className="pa-petition" style={{ minHeight: 420 }} value={draftText} onChange={e => setDraftText(e.target.value)} spellCheck />
            <div className="pa-row">
              <button className="doc-refresh" onClick={() => navigator.clipboard.writeText(draftText).then(() => setNotice({ kind: 'ok', text: 'Minuta copiada.' }))}><Copy size={16} /> Copiar</button>
              <button className="doc-refresh" onClick={downloadDraft}><Download size={16} /> Baixar Word (timbrado)</button>
              <button className="doc-refresh" onClick={async () => { if (!supabase || !proc) return; const { data: u } = await supabase.auth.getUser(); const r = await supabase.from('process_conduction_drafts').insert({ org_id: orgId, process_id: proc.id, kind: draftKind, title: DRAFTS[draftKind] + ' (revisada)', content: draftText, created_by: u?.user?.id || null }).select('id,kind,title,content,created_at').single(); if (r.error) setNotice({ kind: 'error', text: r.error.message }); else { setDrafts(v => [r.data as any, ...v]); setNotice({ kind: 'ok', text: 'Versão revisada salva.' }); } }}><Save size={16} /> Salvar versão</button>
            </div>
          </>)}
          {drafts.length > 0 && (<div className="cp-history"><h3><History size={15} /> Minutas anteriores</h3><ul className="cp-list">{drafts.map(d => <li key={d.id}><span><b>{d.title}</b> · {brDT(d.created_at)}</span><button className="doc-refresh" onClick={() => { setDraftKind(d.kind); setDraftText(d.content); }}>Abrir</button></li>)}</ul></div>)}
        </section>
      </>)}

      {!proc && <div className="doc-empty">Selecione um processo ajuizado para começar.</div>}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { WandSparkles, Upload, FileText, Loader2, Calculator, ScrollText, Save, Copy, Download, History, AlertTriangle, CheckCircle2, ExternalLink, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fields as calcFields, localOnly } from './Calculators';
import './integrations.css';
import './document-library.css';
import './petition-assistant.css';

type Client = { id: string; name: string; cpf_cnpj?: string | null };
type Proc = { id: string; client_id?: string | null; cnj_number?: string | null; internal_number?: string | null; subject?: string | null };
type Doc = { id: string; client_id?: string | null; name: string; file_path: string; mime_type?: string | null; category?: string | null; created_at: string };
type Run = { id: string; area: string; status: string; client_id?: string | null; process_id?: string | null; notes?: string | null; instructions?: string | null; document_ids?: string[]; dossier?: any; calculation?: string | null; petition?: string | null; created_at: string };

const AREAS = [
  ['familia', 'Família'],
  ['consumidor', 'Consumidor'],
  ['saude', 'Direito Médico / Saúde'],
  ['civel', 'Cível geral'],
  ['administrativo', 'Administrativo'],
] as const;
const DOC_CATEGORIES = ['Documento do cliente', 'Prova', 'Laudo', 'Comprovante', 'Contrato', 'Decisão', 'Outros'];
const READABLE = /(\.pdf|\.png|\.jpe?g|\.webp|\.heic)$/i;
const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
const lines = (v: any) => (Array.isArray(v) ? v : []).map((x: any) => String(typeof x === 'string' ? x : x?.fato || x?.nome || '')).filter(Boolean);
const areaLabel = (k: string) => AREAS.find(a => a[0] === k)?.[1] || k;
const dt = (v: string) => new Date(v).toLocaleString('pt-BR');

async function invoke(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Backend indisponível.');
  const { data, error } = await supabase.functions.invoke('petition-assistant', { body });
  if (error) {
    let msg = error.message;
    try { const ctx = (error as any).context; if (ctx?.json) { const j = await ctx.json(); msg = j?.error || msg; } } catch { /* mantém mensagem */ }
    throw new Error(msg || 'Falha ao falar com o assistente.');
  }
  if (data?.ok === false) throw new Error(data.error || 'Falha no assistente.');
  return data;
}

function wordHtml(title: string, text: string) {
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const body = text.split(/\n{2,}/).map(p => {
    const t = p.trim();
    if (!t) return '';
    const heading = t.length < 90 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÇ]/.test(t);
    return heading ? `<p class=h>${esc(t)}</p>` : `<p>${esc(t).replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:3cm 2cm 2cm 3cm}body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.5}p{text-align:justify;text-indent:2cm;margin:0 0 10pt}p.h{text-indent:0;font-weight:bold;text-align:left}</style></head><body>${body}</body></html>`;
}

export default function PetitionAssistant() {
  const [clients, setClients] = useState<Client[]>([]);
  const [processes, setProcesses] = useState<Proc[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [clientId, setClientId] = useState('');
  const [processId, setProcessId] = useState('');
  const [area, setArea] = useState('familia');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [uploadCategory, setUploadCategory] = useState('Documento do cliente');
  const [runId, setRunId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<any>(null);
  const [readInfo, setReadInfo] = useState<{ read: string[]; skipped: string[] } | null>(null);
  const [calcName, setCalcName] = useState('');
  const [calcValues, setCalcValues] = useState<Record<string, any>>({});
  const [memorial, setMemorial] = useState('');
  const [instructions, setInstructions] = useState('');
  const [petition, setPetition] = useState('');
  const [busy, setBusy] = useState<'' | 'upload' | 'analyze' | 'calc' | 'draft' | 'save'>('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadBase() {
    if (!supabase) return;
    const [{ data: c }, { data: p }, { data: r }] = await Promise.all([
      supabase.from('clients').select('id,name,cpf_cnpj').order('name').limit(2000),
      supabase.from('processes').select('id,client_id,cnj_number,internal_number,subject').order('updated_at', { ascending: false }).limit(2000),
      supabase.from('petition_assistant_runs').select('id,area,status,client_id,process_id,notes,instructions,document_ids,dossier,calculation,petition,created_at').order('created_at', { ascending: false }).limit(20),
    ]);
    setClients((c || []) as Client[]);
    setProcesses((p || []) as Proc[]);
    setRuns((r || []) as Run[]);
  }
  async function loadDocs(cid: string) {
    if (!supabase || !cid) { setDocs([]); return; }
    const { data } = await supabase.from('documents').select('id,client_id,name,file_path,mime_type,category,created_at').eq('client_id', cid).order('created_at', { ascending: false }).limit(300);
    setDocs(((data || []) as Doc[]).filter(d => READABLE.test(d.file_path) || /pdf|image/.test(d.mime_type || '')));
  }
  useEffect(() => { loadBase(); }, []);
  useEffect(() => { loadDocs(clientId); setSelected([]); setProcessId(''); }, [clientId]);

  const client = clients.find(c => c.id === clientId);
  const available = useMemo(() => (clientId ? processes.filter(p => p.client_id === clientId) : []), [clientId, processes]);
  const proc = available.find(p => p.id === processId);
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  async function upload(files: FileList | null) {
    if (!files?.length || !supabase) return;
    if (!clientId) { setNotice({ kind: 'error', text: 'Escolha o cliente antes de juntar os documentos.' }); return; }
    setBusy('upload'); setNotice(null);
    try {
      const { data: org } = await supabase.rpc('current_org_id');
      const { data: u } = await supabase.auth.getUser();
      if (!org || !u?.user) throw new Error('Sessão expirada. Entre novamente.');
      const added: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} passa de 15 MB.`);
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
        const path = `${org}/documents/${crypto.randomUUID()}-${safe(file.name.replace(ext, ''))}${ext}`;
        const { error: ue } = await supabase.storage.from('lexoffice-documents').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (ue) throw ue;
        const { data: row, error: ie } = await supabase.from('documents').insert({ org_id: org, client_id: clientId, process_id: processId || null, name: file.name, file_path: path, mime_type: file.type || null, size_bytes: file.size, category: uploadCategory, notes: 'Juntado pelo Assistente de Petição', uploaded_by: u.user.id }).select('id').single();
        if (ie) { await supabase.storage.from('lexoffice-documents').remove([path]); throw ie; }
        added.push(String(row?.id));
      }
      await loadDocs(clientId);
      setSelected(s => [...s, ...added]);
      setNotice({ kind: 'ok', text: `${added.length} documento(s) juntado(s) à pasta do cliente.` });
    } catch (e: any) { setNotice({ kind: 'error', text: e.message || 'Falha no envio.' }); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function analyze() {
    setBusy('analyze'); setNotice({ kind: 'info', text: 'Lendo os documentos e montando o dossiê. Pode levar até 1 minuto.' });
    setDossier(null); setPetition(''); setMemorial('');
    try {
      const caseInfo = { cliente: client?.name || null, cpf_cnpj: client?.cpf_cnpj || null, processo: proc?.cnj_number || proc?.internal_number || null, assunto: proc?.subject || null };
      const r = await invoke({ action: 'analyze', area, notes, document_ids: selected, client_id: clientId || null, process_id: processId || null, case_info: caseInfo });
      setRunId(r.run_id); setDossier(r.dossier); setReadInfo({ read: r.read || [], skipped: r.skipped || [] });
      const c = r.dossier?.calculo;
      setCalcName(c?.necessario && c?.calculadora ? c.calculadora : '');
      setCalcValues(c?.valores || {});
      setNotice({ kind: 'ok', text: 'Dossiê pronto. Revise, ajuste o que precisar e siga para a redação.' });
      loadBase();
    } catch (e: any) { setNotice({ kind: 'error', text: e.message }); }
    finally { setBusy(''); }
  }

  async function calculate() {
    if (!supabase || !calcName) return;
    if (localOnly.has(calcName)) { openCalculator(); return; }
    setBusy('calc'); setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada.');
      const res = await fetch('/api/legal-calculators', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ calculator: calcName, data: { ...calcValues, _clientName: client?.name || 'Não informado', _processNumber: proc?.cnj_number || proc?.internal_number || 'Não informado', _pdfName: 'Assistente de Petição' } }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out?.ok === false) throw new Error(out?.error || `Falha no cálculo (HTTP ${res.status}).`);
      setMemorial(String(out.result || JSON.stringify(out, null, 2)));
      setNotice({ kind: 'ok', text: 'Cálculo feito pela calculadora da LexOffice. Confira antes de redigir.' });
    } catch (e: any) { setNotice({ kind: 'error', text: e.message }); }
    finally { setBusy(''); }
  }
  function openCalculator() {
    try { localStorage.setItem('lex-calc-prefill', JSON.stringify({ calc: calcName, values: calcValues })); } catch { /* segue sem pré-preenchimento */ }
    window.open(`/calculadoras?calc=${encodeURIComponent(calcName)}`, '_blank');
    setNotice({ kind: 'info', text: 'A calculadora abriu em outra aba já preenchida. Depois de calcular, cole a memória no campo abaixo.' });
  }

  async function draft() {
    setBusy('draft'); setNotice({ kind: 'info', text: 'Redigindo a petição inicial. Pode levar até 2 minutos.' });
    try {
      const r = await invoke({ action: 'draft', run_id: runId, area, dossier, calculation: memorial, instructions, office: { name: 'Suzanne Figueiredo — Advocacia e Soluções Jurídicas', lawyer: 'Suzanne Figueiredo' } });
      setPetition(r.petition);
      setNotice({ kind: 'ok', text: 'Rascunho pronto. Os pontos marcados com [PREENCHER] precisam da sua revisão.' });
      loadBase();
    } catch (e: any) { setNotice({ kind: 'error', text: e.message }); }
    finally { setBusy(''); }
  }

  const title = `Petição inicial - ${dossier?.tipo_acao || areaLabel(area)} - ${client?.name || 'cliente'}`;
  function downloadWord() {
    const blob = new Blob(['﻿', wordHtml(title, petition)], { type: 'application/msword' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safe(title)}.doc`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function saveToClient() {
    if (!supabase || !clientId || !petition) return;
    setBusy('save'); setNotice(null);
    try {
      const { data: org } = await supabase.rpc('current_org_id');
      const { data: u } = await supabase.auth.getUser();
      if (!org || !u?.user) throw new Error('Sessão expirada.');
      const blob = new Blob(['﻿', wordHtml(title, petition)], { type: 'application/msword' });
      const path = `${org}/documents/${crypto.randomUUID()}-${safe(title)}.doc`;
      const { error: ue } = await supabase.storage.from('lexoffice-documents').upload(path, blob, { contentType: 'application/msword' });
      if (ue) throw ue;
      const { data: row, error: ie } = await supabase.from('documents').insert({ org_id: org, client_id: clientId, process_id: processId || null, name: `${title}.doc`, file_path: path, mime_type: 'application/msword', size_bytes: blob.size, category: 'Petição', notes: 'Rascunho gerado pelo Assistente de Petição (IA) — revisar antes de protocolar', uploaded_by: u.user.id }).select('id').single();
      if (ie) { await supabase.storage.from('lexoffice-documents').remove([path]); throw ie; }
      if (runId) await invoke({ action: 'save', run_id: runId, petition, status: 'salvo', document_id: row?.id || null });
      setNotice({ kind: 'ok', text: 'Petição salva na pasta do cliente, em Documentos, na categoria Petição.' });
      loadBase();
    } catch (e: any) { setNotice({ kind: 'error', text: e.message || 'Falha ao salvar.' }); }
    finally { setBusy(''); }
  }

  function reopen(r: Run) {
    setRunId(r.id); setArea(r.area); setClientId(r.client_id || ''); setNotes(r.notes || ''); setInstructions(r.instructions || '');
    setDossier(r.dossier || null); setMemorial(r.calculation || ''); setPetition(r.petition || ''); setReadInfo(null);
    const c = r.dossier?.calculo; setCalcName(c?.necessario && c?.calculadora ? c.calculadora : ''); setCalcValues(c?.valores || {});
    setTimeout(() => { setProcessId(r.process_id || ''); setSelected(r.document_ids || []); }, 50);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const setField = (k: string, v: any) => setDossier((d: any) => ({ ...d, [k]: v }));
  const calcFieldList = (calcFields[calcName] || []).filter(f => !['textarea'].includes(f.type || ''));

  return (
    <div className="documents-v2-page petition-page">
      <header className="documents-v2-header">
        <div>
          <h1>Petição com IA</h1>
          <p>Junte a documentação do cliente. A IA lê tudo, monta o dossiê, indica o cálculo e redige a petição inicial para a sua revisão.</p>
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
        <div className="doc-section-title"><span className="doc-section-icon"><Upload size={20} /></span><div><h2>1. O caso e a documentação</h2><p>PDF ou foto (RG, contrato, laudos, prints, comprovantes, decisões). Tudo o que você juntar aqui também fica salvo na pasta do cliente.</p></div></div>
        <div className="doc-upload-grid">
          <label><span>Cliente</span><select value={clientId} onChange={e => setClientId(e.target.value)}><option value="">Selecione</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label><span>Processo (opcional)</span><select value={processId} onChange={e => setProcessId(e.target.value)} disabled={!clientId}><option value="">Caso novo</option>{available.map(p => <option key={p.id} value={p.id}>{p.cnj_number || p.internal_number || p.subject || 'Processo'}</option>)}</select></label>
          <label><span>Área</span><select value={area} onChange={e => setArea(e.target.value)}>{AREAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label><span>Categoria dos novos arquivos</span><select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}>{DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
        </div>
        <label className="pa-block"><span>Relato do caso e suas anotações</span><textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="O que o cliente contou, o que você quer pedir, a estratégia..." /></label>
        <div className="pa-row">
          <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" hidden onChange={e => upload(e.target.files)} />
          <button className="doc-refresh" onClick={() => fileRef.current?.click()} disabled={busy !== '' || !clientId}>{busy === 'upload' ? <Loader2 size={17} className="spin" /> : <Upload size={17} />} Juntar documentos</button>
          <span className="pa-muted">{selected.length} de {docs.length} documento(s) do cliente marcado(s) para a análise</span>
        </div>
        {docs.length > 0 && (
          <div className="pa-docs">{docs.map(d => (
            <label key={d.id} className={selected.includes(d.id) ? 'on' : ''}><input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} /><FileText size={15} /><b>{d.name}</b><small>{d.category || '—'}</small></label>
          ))}</div>
        )}
        <div className="pa-row end"><button className="doc-primary" onClick={analyze} disabled={busy !== '' || (!selected.length && notes.trim().length < 40)}>{busy === 'analyze' ? <Loader2 size={17} className="spin" /> : <WandSparkles size={17} />} Analisar com IA</button></div>
      </section>

      {dossier && (
        <section className="doc-library-card">
          <div className="doc-section-title"><span className="doc-section-icon"><ScrollText size={20} /></span><div><h2>2. Dossiê do caso</h2><p>Confira o que a IA extraiu. O que você corrigir aqui é o que vai para a petição.</p></div></div>
          {readInfo && (readInfo.read.length > 0 || readInfo.skipped.length > 0) && <p className="pa-muted">Lidos: {readInfo.read.join(', ') || 'nenhum'}{readInfo.skipped.length ? ` · Não lidos: ${readInfo.skipped.join(', ')}` : ''}</p>}
          <div className="doc-upload-grid pa-grid-3">
            <label><span>Ação sugerida</span><input value={dossier.tipo_acao || ''} onChange={e => setField('tipo_acao', e.target.value)} /></label>
            <label><span>Competência</span><input value={dossier.competencia || ''} onChange={e => setField('competencia', e.target.value)} /></label>
            <label><span>Valor da causa sugerido</span><input value={dossier.valor_causa_sugerido ?? ''} onChange={e => setField('valor_causa_sugerido', e.target.value)} /></label>
          </div>
          <label className="pa-block"><span>Resumo</span><textarea rows={4} value={dossier.resumo || ''} onChange={e => setField('resumo', e.target.value)} /></label>
          <div className="pa-cols">
            <div><h3>Partes</h3><ul>{[...(dossier.partes?.autores || []).map((p: any) => `Autor(a): ${p.nome}${p.qualificacao ? ' — ' + p.qualificacao : ''}`), ...(dossier.partes?.reus || []).map((p: any) => `Réu/Ré: ${p.nome}${p.qualificacao ? ' — ' + p.qualificacao : ''}`)].map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div><h3>Cronologia</h3><ul>{(dossier.cronologia || []).map((c: any, i: number) => <li key={i}><b>{c.data}</b> {c.fato}{c.documento ? <small> ({c.documento})</small> : null}</li>)}</ul></div>
          </div>
          <label className="pa-block"><span>Pedidos (um por linha)</span><textarea rows={5} value={lines(dossier.pedidos_sugeridos).join('\n')} onChange={e => setField('pedidos_sugeridos', e.target.value.split('\n'))} /></label>
          <div className="pa-cols">
            <div><h3>Provas que já temos</h3><ul>{lines(dossier.provas_existentes).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div className="pa-warn"><h3>Faltando / pendências</h3><ul>{[...lines(dossier.documentos_faltantes), ...lines(dossier.pendencias)].map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </div>
          {(dossier.tutela_urgencia?.cabivel || lines(dossier.riscos).length > 0) && (
            <div className="pa-cols">
              {dossier.tutela_urgencia?.cabivel && <div><h3>Tutela de urgência</h3><p>{dossier.tutela_urgencia.fundamento}</p></div>}
              {lines(dossier.riscos).length > 0 && <div><h3>Riscos</h3><ul>{lines(dossier.riscos).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            </div>
          )}
        </section>
      )}

      {dossier && (
        <section className="doc-library-card">
          <div className="doc-section-title"><span className="doc-section-icon"><Calculator size={20} /></span><div><h2>3. Cálculos</h2><p>{dossier.calculo?.necessario ? `A IA indicou cálculo: ${dossier.calculo.motivo || ''}` : 'A IA não viu necessidade de cálculo. Se precisar, escolha a calculadora.'}</p></div></div>
          <div className="doc-upload-grid pa-grid-3">
            <label><span>Calculadora</span><select value={calcName} onChange={e => setCalcName(e.target.value)}><option value="">Sem cálculo</option>{Object.keys(calcFields).map(n => <option key={n}>{n}</option>)}</select></label>
            {calcFieldList.map(f => (
              <label key={f.key}><span>{f.label}</span>{f.type === 'select'
                ? <select value={calcValues[f.key] ?? ''} onChange={e => setCalcValues(v => ({ ...v, [f.key]: e.target.value }))}><option value="">—</option>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                : <input type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} step="any" value={calcValues[f.key] ?? ''} onChange={e => setCalcValues(v => ({ ...v, [f.key]: e.target.value }))} />}
              </label>
            ))}
          </div>
          {calcName && <div className="pa-row"><button className="doc-refresh" onClick={calculate} disabled={busy !== ''}>{busy === 'calc' ? <Loader2 size={17} className="spin" /> : localOnly.has(calcName) ? <ExternalLink size={17} /> : <Calculator size={17} />} {localOnly.has(calcName) ? 'Abrir na calculadora' : 'Calcular agora'}</button></div>}
          <label className="pa-block"><span>Memória de cálculo que vai para a petição</span><textarea rows={6} value={memorial} onChange={e => setMemorial(e.target.value)} placeholder="Aparece aqui depois do cálculo. Você também pode colar a sua." /></label>
        </section>
      )}

      {dossier && (
        <section className="doc-library-card">
          <div className="doc-section-title"><span className="doc-section-icon"><WandSparkles size={20} /></span><div><h2>4. Petição inicial</h2><p>Rascunho para revisão. Nada é protocolado automaticamente.</p></div></div>
          <label className="pa-block"><span>Instruções para a redação (opcional)</span><textarea rows={3} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Ex.: pedir tutela de urgência, justiça gratuita, dano moral de R$ 20.000, foro de Belo Horizonte..." /></label>
          <div className="pa-row end"><button className="doc-primary" onClick={draft} disabled={busy !== ''}>{busy === 'draft' ? <Loader2 size={17} className="spin" /> : <ScrollText size={17} />} {petition ? 'Redigir de novo' : 'Redigir petição inicial'}</button></div>
          {petition && (<>
            <textarea className="pa-petition" value={petition} onChange={e => setPetition(e.target.value)} spellCheck />
            <div className="pa-row">
              <button className="doc-refresh" onClick={() => navigator.clipboard.writeText(petition).then(() => setNotice({ kind: 'ok', text: 'Texto copiado.' }))}><Copy size={17} /> Copiar</button>
              <button className="doc-refresh" onClick={downloadWord}><Download size={17} /> Baixar Word</button>
              <button className="doc-primary" onClick={saveToClient} disabled={busy !== '' || !clientId}>{busy === 'save' ? <Loader2 size={17} className="spin" /> : <Save size={17} />} Salvar na pasta do cliente</button>
            </div>
          </>)}
        </section>
      )}

      <section className="doc-library-card">
        <div className="doc-section-title"><span className="doc-section-icon"><History size={20} /></span><div><h2>Últimos casos preparados</h2><p>Clique para reabrir um dossiê ou rascunho.</p></div></div>
        {runs.length === 0 ? <div className="doc-empty"><b>Nenhum caso ainda</b><span>Os casos analisados aparecem aqui.</span></div> : (
          <div className="pa-runs">{runs.map(r => (
            <button key={r.id} onClick={() => reopen(r)}><b>{r.dossier?.tipo_acao || areaLabel(r.area)}</b><span>{clients.find(c => c.id === r.client_id)?.name || 'Sem cliente'} · {areaLabel(r.area)} · {r.status}</span><small>{dt(r.created_at)}</small></button>
          ))}</div>
        )}
      </section>
    </div>
  );
}

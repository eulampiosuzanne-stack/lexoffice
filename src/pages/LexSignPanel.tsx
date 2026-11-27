import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { localPhone, onlyDigits, samePhone, signerError } from '../lib/signer';
import './lexsign.css';

// Painel de envio da assinatura biométrica própria do LEXOFFICE (gratuita).
type Client = { id: string; name: string; whatsapp?: string | null; phone?: string | null; cpf_cnpj?: string | null; relationship_tier?: string | null };
type Doc = { id: string; name: string; file_path: string; mime_type?: string | null; created_at?: string | null };
type Req = { id: string; batch_id?: string | null; title: string; signer_name?: string | null; status: string; created_at: string; viewed_at?: string | null; signed_at?: string | null; signed_path?: string | null; verification_code?: string | null; face_distance?: number | null };

const FN = 'signature-biometric-public';
const STATUS: Record<string, string> = { sent: 'Enviado', viewed: 'Aberto pelo cliente', pending_review: 'Aguardando sua conferência', signed: 'Assinado', rejected: 'Recusada', cancelled: 'Cancelado', expired: 'Expirado' };
const FILTERS = [
  { key: 'open', label: 'Pendentes', match: ['sent', 'viewed', 'expired', 'rejected'] },
  { key: 'review', label: 'Para conferir', match: ['pending_review'] },
  { key: 'signed', label: 'Assinados', match: ['signed'] },
  { key: 'all', label: 'Todos', match: null },
] as const;
// Status do lote: o que ainda estiver pendente manda; se tudo acabou, vale o do principal.
const groupStatus = (g: { status: string }[]) => {
  const live = g.filter((x) => x.status !== 'cancelled');
  if (!live.length) return 'cancelled';
  for (const s of ['pending_review', 'viewed', 'sent', 'rejected', 'expired']) if (live.some((x) => x.status === s)) return s;
  return live[0].status;
};
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

async function invoke(body: Record<string, unknown>): Promise<any> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.functions.invoke(FN, { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* ignora */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function LexSignPanel() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [searchingClients, setSearchingClients] = useState(false);
  const [clientId, setClientId] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState('');
  // Lista de documentos de cada envio: começa recolhida; clique para abrir/fechar.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) => setOpenGroups((o) => ({ ...o, [k]: !o[k] }));
  const [tab, setTab] = useState<'new' | 'track'>('new');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('open');
  const [who, setWho] = useState<'client' | 'other'>('client');
  const [other, setOther] = useState({ name: '', cpf: '', phone: '' });
  const [otherError, setOtherError] = useState('');
  const [saving, setSaving] = useState(false);
  function chooseWho(next: 'client' | 'other') {
    setWho(next); setClientId(''); setSearch(''); setOtherError(''); setNotice(''); setLink(''); setShareMsg('');
  }

  async function loadReqs() {
    if (!supabase) return;
    const { data } = await supabase.from('lex_signature_requests').select('id,batch_id,title,signer_name,status,created_at,viewed_at,signed_at,signed_path,verification_code,face_distance').order('created_at', { ascending: false }).limit(80);
    setReqs((data as Req[]) || []);
  }
  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.from('clients').select('id,name,whatsapp,phone,relationship_tier').not('name', 'ilike', '%DUPLICADO%').order('name').limit(2000);
      setClients((data as Client[]) || []);
      await loadReqs();
    })();
  }, []);
  async function loadDocs(id: string) {
    if (!supabase || !id) return [] as Doc[];
    const { data } = await supabase.from('documents').select('id,name,file_path,mime_type,created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(100);
    const list = ((data as Doc[]) || []).filter((d) => /pdf/i.test(d.mime_type || '') || /\.pdf$/i.test(d.file_path || '')).filter((d) => !/\(assinado\)/i.test(d.name));
    setDocs(list);
    return list;
  }
  useEffect(() => { setDocs([]); setDocIds([]); if (clientId) loadDocs(clientId); }, [clientId]);
  const toggleDoc = (id: string) => setDocIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const allSelected = docs.length > 0 && docIds.length === docs.length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients).slice(0, 200);
  }, [clients, search]);
  // A lista inicial é limitada. Quando o nome digitado não estiver nela, busca diretamente no banco.
  useEffect(() => {
    const q = search.trim();
    if (!supabase || q.length < 2 || filtered.length > 0) return;
    const timer = window.setTimeout(async () => {
      setSearchingClients(true);
      try {
        const safe = q.replace(/[%_]/g, '');
        const { data } = await supabase.from('clients').select('id,name,whatsapp,phone,relationship_tier').ilike('name', `%${safe}%`).not('name', 'ilike', '%DUPLICADO%').order('name').limit(50);
        if (data?.length) setClients((cur) => {
          const map = new Map(cur.map((x) => [x.id, x]));
          for (const x of data as Client[]) map.set(x.id, x);
          return Array.from(map.values());
        });
      } finally { setSearchingClients(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, filtered.length]);
  // Se a busca deixar só um cliente, ele já fica selecionado.
  useEffect(() => {
    if (search.trim() && filtered.length === 1 && filtered[0].id !== clientId) setClientId(filtered[0].id);
  }, [filtered, search, clientId]);
  const client = clients.find((c) => c.id === clientId);
  const phone = client?.whatsapp || client?.phone || '';

  // Quem não é cliente entra no cadastro como contato (LEAD) para poder assinar. Não duplica quem já existe.
  async function saveOther() {
    if (!supabase || saving) return;
    const invalid = signerError(other.name, other.cpf, other.phone);
    setOtherError(invalid); setNotice('');
    if (invalid) return;
    setSaving(true);
    try {
      const all: Client[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('clients').select('id,name,whatsapp,phone,cpf_cnpj,relationship_tier').not('name', 'ilike', '%DUPLICADO%').order('id').range(from, from + 999);
        if (error) throw error;
        all.push(...((data as Client[]) || []));
        if (!data || data.length < 1000) break;
      }
      const use = (c: Client, message: string) => {
        setClients((cur) => [c, ...cur.filter((x) => x.id !== c.id)]);
        setClientId(c.id); setNotice(message);
      };
      const cpf = onlyDigits(other.cpf);
      const found = all.find((c) => onlyDigits(c.cpf_cnpj) === cpf);
      if (found) { use(found, `Este CPF já está cadastrado como ${found.name}. Usei o cadastro existente, sem alterar os dados.`); return; }
      const phoneOwner = all.find((c) => samePhone(c.whatsapp, other.phone) || samePhone(c.phone, other.phone));
      if (phoneOwner && !window.confirm(`Este WhatsApp já está no cadastro de ${phoneOwner.name}. Criar mesmo assim um cadastro separado para ${other.name.trim()}?`)) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão inválida. Entre novamente.');
      const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
      if (!p?.org_id) throw new Error('Organização não encontrada.');
      const { data, error } = await supabase.from('clients').insert({
        org_id: p.org_id, name: other.name.trim().replace(/\s+/g, ' '), cpf_cnpj: cpf, whatsapp: localPhone(other.phone),
        relationship_tier: 'LEAD', relationship_tier_source: 'manual', receive_automatic_emails: false,
        notes: 'Cadastro rápido para assinatura (não é cliente).',
      }).select('id,name,whatsapp,phone,cpf_cnpj,relationship_tier').single();
      if (error) throw error;
      use(data as Client, 'Pessoa salva. Agora adicione o PDF no passo 2.');
    } catch (e: any) { setOtherError(e?.message || 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }
  // Copia um texto; se o navegador bloquear, avisa para copiar à mão.
  async function copyText(text: string, ok: string) {
    try { await navigator.clipboard.writeText(text); setNotice(ok); }
    catch { setNotice('O navegador não deixou copiar automaticamente. Selecione o texto abaixo e copie.'); }
  }
  // mode 'whatsapp': o sistema envia ao WhatsApp cadastrado. mode 'copy': não envia; devolve a mensagem pronta (link, código e explicação da biometria facial) para copiar.
  async function send(mode: 'whatsapp' | 'copy' = 'whatsapp') {
    setBusy(mode === 'copy' ? 'send-copy' : 'send'); setNotice(''); setLink(''); setShareMsg('');
    try {
      // Todos os documentos marcados vão num único link: o cliente valida a identidade uma vez só e assina todos.
      const ordered = docs.filter((d) => docIds.includes(d.id)).map((d) => d.id);
      if (ordered.length > 30) throw new Error('Envie no máximo 30 documentos por vez.');
      const d = await invoke({ action: 'create', document_ids: ordered, client_id: clientId, send_whatsapp: mode === 'whatsapp' });
      setLink(d.link);
      const full = String(d.message || d.link || '');
      setShareMsg(full);
      const what = ordered.length > 1 ? `${ordered.length} documentos enviados num único link` : 'Link de assinatura com biometria facial enviado';
      if (mode === 'copy') await copyText(full, 'Mensagem copiada (link, código e explicação da biometria facial). Cole no WhatsApp ou onde preferir.');
      else setNotice(d.whatsapp_sent ? `${what} ao cliente pelo WhatsApp cadastrado.` : 'Solicitação criada, mas o WhatsApp não confirmou o envio. Use "Copiar mensagem" abaixo e envie manualmente.');
      setDocIds([]);
      await loadReqs();
    } catch (e: any) { setNotice(e?.message || 'Falha ao enviar.'); } finally { setBusy(''); }
  }
  async function sendWhatsAppOnly() {
    if (!supabase || !client || !phone || !docIds.length) return;
    const selected = docs.filter((d) => docIds.includes(d.id));
    if (selected.length > 10) { setNotice('Envie no máximo 10 PDFs por vez pelo WhatsApp.'); return; }
    const question = selected.length > 1
      ? `Enviar estes ${selected.length} PDFs diretamente para ${client.name} pelo WhatsApp, sem assinatura pela Lex?`
      : `Enviar "${selected[0]?.name}" diretamente para ${client.name} pelo WhatsApp, sem assinatura pela Lex?`;
    if (!window.confirm(question)) return;
    setBusy('whatsapp-only'); setNotice(''); setLink('');
    try {
      const localNumber = String(phone).replace(/\D/g, '').replace(/^0+/, '');
      if (localNumber.length < 10) throw new Error('O WhatsApp cadastrado para este cliente é inválido.');
      const number = localNumber.startsWith('55') ? localNumber : `55${localNumber}`;
      const message = `Olá, ${client.name.split(/\s+/)[0]}. Segue${selected.length > 1 ? 'm os documentos' : ' o documento'} para sua assinatura. Após assinar, por favor devolva${selected.length > 1 ? '-os' : ''} por este WhatsApp.`;
      const { data, error } = await supabase.functions.invoke('whatsapp-operator-send', { body: { message, document_ids: selected.map((d) => d.id), targets: [{ phone: number, name: client.name }], keep_ai_active: true, mirror_to_app: false } });
      if (error || !data?.ok || Number(data?.failed || 0) > 0) throw new Error(data?.results?.[0]?.error || data?.error || error?.message || 'O WhatsApp não confirmou o envio.');
      setNotice(`${selected.length} documento${selected.length > 1 ? 's enviados' : ' enviado'} diretamente para ${client.name} pelo WhatsApp. Nenhuma assinatura foi criada na Lex.`);
      setDocIds([]);
    } catch (e: any) { setNotice(e?.message || 'Não foi possível enviar os documentos pelo WhatsApp.'); }
    finally { setBusy(''); }
  }
  // Sobe um ou mais PDFs do computador para a ficha do cliente e já deixa marcados para assinatura.
  async function addUploads(files: FileList | null) {
    if (!supabase || !files?.length || !clientId) return;
    setUploading(true); setNotice(''); setLink('');
    try {
      const list = Array.from(files);
      const bad = list.find((f) => !/\.pdf$/i.test(f.name) && f.type !== 'application/pdf');
      if (bad) throw new Error(`"${bad.name}" não é PDF. Escolha apenas arquivos PDF.`);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão inválida.');
      const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
      if (!p?.org_id) throw new Error('Organização não encontrada.');
      const added: string[] = [];
      for (const file of list) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
        const path = `${p.org_id}/signatures/lex/${Date.now()}-${crypto.randomUUID()}-${safe}`;
        const { error: ue } = await supabase.storage.from('lexoffice-documents').upload(path, file, { contentType: 'application/pdf' });
        if (ue) throw ue;
        const { data: d, error: de } = await supabase.from('documents').insert({ org_id: p.org_id, client_id: clientId, name: file.name.replace(/\.pdf$/i, ''), file_path: path, mime_type: 'application/pdf', size_bytes: file.size, category: 'Documento para assinatura', notes: 'Enviado ao cliente para assinatura com biometria facial LEX', uploaded_by: user.id }).select('id').single();
        if (de) throw de;
        added.push(d.id);
      }
      await loadDocs(clientId);
      setDocIds((cur) => Array.from(new Set([...cur, ...added])));
      setNotice(added.length > 1 ? `${added.length} PDFs adicionados à ficha do cliente e marcados para assinatura.` : 'PDF adicionado à ficha do cliente e marcado para assinatura.');
    } catch (e: any) { setNotice(e?.message || 'Falha ao enviar o arquivo.'); } finally { setUploading(false); }
  }
  async function resend(r: Req) {
    setBusy(r.id); setNotice(''); setLink(''); setShareMsg('');
    try { const d = await invoke({ action: 'resend', id: r.id }); setLink(d.link); setShareMsg(String(d.message || d.link || '')); setNotice(d.whatsapp_sent ? 'Novo link enviado pelo WhatsApp (o link anterior deixou de valer).' : 'Novo link gerado. O WhatsApp não enviou; copie e envie manualmente.'); await loadReqs(); }
    catch (e: any) { setNotice(e?.message || 'Falha ao reenviar.'); } finally { setBusy(''); }
  }
  async function cancel(r: Req) {
    const n = r.batch_id ? reqs.filter((x) => x.batch_id === r.batch_id && ['sent', 'viewed', 'pending_review'].includes(x.status)).length : 1;
    if (!confirm(n > 1 ? `Cancelar a assinatura destes ${n} documentos? O link enviado deixará de funcionar.` : `Cancelar a assinatura de "${r.title}"? O link enviado deixará de funcionar.`)) return;
    setBusy(r.id);
    try { await invoke({ action: 'cancel', id: r.id }); await loadReqs(); } catch (e: any) { setNotice(e?.message || 'Falha ao cancelar.'); } finally { setBusy(''); }
  }
  async function openReview(r: Req) {
    setBusy(r.id); setNotice(''); setReviewNote('');
    try { const d = await invoke({ action: 'evidence', id: r.id }); setReview(d); }
    catch (e: any) { setNotice(e?.message || 'Falha ao abrir a conferência.'); } finally { setBusy(''); }
  }
  async function decide(approve: boolean) {
    if (!review) return;
    if (!approve && !confirm('Recusar esta assinatura? O cliente será avisado pelo WhatsApp de que o escritório vai entrar em contato.')) return;
    setBusy('review');
    try {
      await invoke({ action: approve ? 'approve' : 'reject', id: review.id, note: reviewNote });
      setNotice(approve ? ((review.documents?.length || 1) > 1 ? 'Assinatura aprovada. Os PDFs assinados foram arquivados na ficha do cliente.' : 'Assinatura aprovada. O PDF assinado foi arquivado na ficha do cliente.') : 'Assinatura recusada. O cliente foi avisado pelo WhatsApp.');
      setReview(null); await loadReqs();
    } catch (e: any) { setNotice(e?.message || 'Falha ao registrar a decisão.'); } finally { setBusy(''); }
  }
  async function downloadSigned(r: Req) {
    if (!supabase || !r.signed_path) return;
    const { data, error } = await supabase.storage.from('lexoffice-documents').download(r.signed_path);
    if (error || !data) { setNotice(error?.message || 'Não foi possível baixar o documento assinado.'); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.title?.toLowerCase().endsWith('.pdf') ? r.title : `${r.title || 'documento-assinado'}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadBatch(g: Req[]) {
    const signed = g.filter((x) => x.status === 'signed' && x.signed_path);
    if (!signed.length) { setNotice('Este lote ainda não possui documentos assinados para download.'); return; }
    setNotice(`Iniciando download de ${signed.length} documento${signed.length > 1 ? 's' : ''} assinado${signed.length > 1 ? 's' : ''}...`);
    for (const r of signed) { await downloadSigned(r); await new Promise((resolve) => setTimeout(resolve, 250)); }
  }

  // Agrupa os documentos enviados no mesmo link (lote) num único cartão.
  const groups = useMemo(() => {
    const map = new Map<string, Req[]>();
    for (const r of reqs) { const k = r.batch_id || r.id; map.set(k, [...(map.get(k) || []), r]); }
    return Array.from(map.values()).map((g) => g.sort((a, b) => (a.id === a.batch_id ? -1 : b.id === b.batch_id ? 1 : a.created_at.localeCompare(b.created_at))));
  }, [reqs]);

  const groupsBy = (match: readonly string[] | null) => groups.filter((g) => !match || match.includes(groupStatus(g)));
  const shown = groupsBy(FILTERS.find((f) => f.key === filter)!.match);
  const reviewCount = groupsBy(['pending_review']).length;
  const sendOff = !docIds.length || !phone || !!busy || uploading;
  const clientLabel = (c: Client) => (c.relationship_tier === 'LEAD' ? `${c.name} (não é cliente)` : c.name);

  return (
    <section className="lxs">
      <nav className="lxs-tabs" aria-label="Assinaturas">
        <button type="button" className="lxs-btn lxs-tab" aria-pressed={tab === 'new'} onClick={() => setTab('new')}>Nova assinatura</button>
        <button type="button" className="lxs-btn lxs-tab" aria-pressed={tab === 'track'} onClick={() => setTab('track')}>Acompanhamento{reviewCount ? ` (${reviewCount} para conferir)` : ''}</button>
      </nav>
      {notice && <p className="lxs-notice" role="status">{notice}</p>}

      {tab === 'new' && <>
        <div className="lxs-card">
          <h2><span>1</span>Quem vai assinar?</h2>
          <div className="lxs-row">
            <button type="button" className="lxs-btn lxs-choice" aria-pressed={who === 'client'} disabled={!!busy} onClick={() => chooseWho('client')}>Já é cliente</button>
            <button type="button" className="lxs-btn lxs-choice" aria-pressed={who === 'other'} disabled={!!busy} onClick={() => chooseWho('other')}>Não é cliente</button>
          </div>
          {who === 'client' && (
            <div className="lxs-fields">
              <label>Buscar pelo nome<input placeholder="Digite o nome" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <label>Cliente
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">{searchingClients ? 'Buscando cliente...' : 'Selecione o cliente'}</option>
                  {filtered.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
                </select>
              </label>
            </div>
          )}
          {who === 'other' && !clientId && (
            <form onSubmit={(e) => { e.preventDefault(); void saveOther(); }}>
              <div className="lxs-fields">
                <label>Nome completo<input value={other.name} maxLength={120} onChange={(e) => setOther({ ...other, name: e.target.value })} /></label>
                <label>CPF<input inputMode="numeric" value={other.cpf} maxLength={14} placeholder="000.000.000-00" onChange={(e) => setOther({ ...other, cpf: e.target.value })} /></label>
                <label>WhatsApp com DDD<input inputMode="tel" value={other.phone} maxLength={20} placeholder="(31) 99999-9999" onChange={(e) => setOther({ ...other, phone: e.target.value })} /></label>
              </div>
              {otherError && <p className="lxs-error" role="alert">{otherError}</p>}
              <button type="button" className="lxs-btn wine" disabled={saving} onClick={() => void saveOther()}>{saving ? 'Salvando...' : 'Salvar e continuar'}</button>
              <p className="lxs-hint">A pessoa fica no cadastro marcada como "não é cliente". Se depois fechar contrato, passa a cliente.</p>
            </form>
          )}
          {client && (
            <p className="lxs-chosen">Vai assinar: <b>{client.name}</b>{client.relationship_tier === 'LEAD' ? ' (não é cliente)' : ''} • {phone ? `WhatsApp ${phone}` : 'sem WhatsApp cadastrado'}
              {who === 'other' && <button type="button" className="lxs-btn small" disabled={!!busy} onClick={() => { setClientId(''); setOther({ name: '', cpf: '', phone: '' }); setNotice(''); }}>Outra pessoa</button>}
            </p>
          )}
        </div>

        <div className="lxs-card">
          <h2><span>2</span>Quais documentos?</h2>
          {!clientId && <p className="lxs-hint">Primeiro conclua o passo 1.</p>}
          {clientId && <>
            <div className="lxs-row">
              <label className="lxs-btn gold" aria-disabled={uploading}>
                {uploading ? 'Enviando arquivos...' : 'Adicionar PDF do computador'}
                <input type="file" accept="application/pdf,.pdf" multiple hidden disabled={uploading} onChange={(e) => { addUploads(e.target.files); e.target.value = ''; }} />
              </label>
              {docs.length > 1 && <button type="button" className="lxs-btn" onClick={() => setDocIds(allSelected ? [] : docs.map((d) => d.id))}>{allSelected ? 'Desmarcar todos' : 'Selecionar todos'}</button>}
            </div>
            {!docs.length && <p className="lxs-hint">Nenhum PDF na ficha ainda. Adicione acima.</p>}
            {!!docs.length && <div className="lxs-docs">
              {docs.map((d) => (
                <label key={d.id} className={docIds.includes(d.id) ? 'on' : ''}>
                  <input type="checkbox" checked={docIds.includes(d.id)} onChange={() => toggleDoc(d.id)} />
                  <span><b>{d.name}</b><small>{dt(d.created_at)}</small></span>
                </label>
              ))}
            </div>}
            <p className="lxs-hint">{docIds.length ? `${docIds.length} selecionado${docIds.length > 1 ? 's' : ''}. ` : ''}Todos os marcados vão num único link.</p>
          </>}
        </div>

        <div className="lxs-card">
          <h2><span>3</span>Enviar para assinar</h2>
          <div className="lxs-row">
            <button type="button" className="lxs-btn wine" disabled={sendOff} onClick={() => send('whatsapp')}>{busy === 'send' ? 'Enviando...' : 'Enviar pelo WhatsApp'}</button>
            <button type="button" className="lxs-btn gold" disabled={sendOff} onClick={() => send('copy')}>{busy === 'send-copy' ? 'Gerando...' : 'Copiar mensagem com link'}</button>
          </div>
          <p className="lxs-hint">A pessoa confirma um código, fotografa o RG ou a CNH e faz uma selfie. O PDF assinado volta para a ficha dela.</p>
          <details>
            <summary>Outra opção: mandar só o PDF, sem assinatura pela LEX</summary>
            <button type="button" className="lxs-btn" disabled={sendOff} onClick={sendWhatsAppOnly}>{busy === 'whatsapp-only' ? 'Enviando PDFs...' : 'Enviar PDFs pelo WhatsApp (sem assinatura LEX)'}</button>
          </details>
          {link && (
            <div className="lxs-link">
              {shareMsg && <textarea readOnly value={shareMsg} rows={8} onFocus={(e) => e.currentTarget.select()} />}
              <div className="lxs-row">
                {shareMsg && <button type="button" className="lxs-btn gold" onClick={() => copyText(shareMsg, 'Mensagem copiada (link, código e explicação da biometria facial).')}>Copiar mensagem completa</button>}
                <button type="button" className="lxs-btn" onClick={() => copyText(link, 'Link copiado. Atenção: sem a mensagem, o cliente não recebe o código nem a explicação da biometria facial.')}>Copiar só o link</button>
              </div>
            </div>
          )}
        </div>
      </>}

      {review && (
        <div className="lxs-overlay" onClick={() => busy !== 'review' && setReview(null)}>
          <div className="lxs-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ ...S.h3, marginTop: 0 }}>Conferência de identidade</h3>
            <p style={S.p}><b>{(review.documents?.length || 1) > 1 ? `${review.documents.length} documentos (um único link)` : review.title}</b><br />{review.signer_name} • CPF {review.signer_cpf} • WhatsApp {review.signer_phone}</p>
            {(review.documents?.length || 0) > 1 && <ul style={{ ...S.p, margin: '8px 0 0', paddingLeft: 18 }}>{review.documents.map((d: any) => <li key={d.id}>{d.title}</li>)}</ul>}
            <p style={{ ...S.p, marginTop: 8 }}>O reconhecimento automático não confirmou o rosto após {review.face_attempts || 0} tentativas{typeof review.face_distance === 'number' ? ` (distância ${review.face_distance.toFixed(3)}; limite ${review.face_limit})` : ''}. {review.evidence?.liveness && review.evidence.liveness.passed !== true ? <>A <b>prova de vida não foi concluída automaticamente</b> (cumpridas: {(review.evidence.liveness.steps || []).join(', ') || 'nenhuma'}; não cumpridas: {(review.evidence.liveness.failed || []).join(', ') || 'não informado'}){review.evidence.liveness.fallback_selfie ? '; a selfie é o último quadro com rosto detectado' : ''}. O código do WhatsApp foi aprovado.</> : 'A prova de vida e o código do WhatsApp foram aprovados.'} Compare as duas fotos com atenção:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '12px 0' }}>
              <figure style={{ margin: 0 }}>{review.selfie_url ? <img src={review.selfie_url} alt="Selfie" style={S.img} /> : <p style={S.p}>Selfie indisponível</p>}<figcaption style={S.cap}>Selfie (prova de vida)</figcaption></figure>
              <figure style={{ margin: 0 }}>{review.id_photo_url ? <img src={review.id_photo_url} alt="Documento" style={S.img} /> : <p style={S.p}>Foto indisponível</p>}<figcaption style={S.cap}>RG / CNH apresentado</figcaption></figure>
            </div>
            <label style={S.label}>Observação (opcional, vai para o certificado)
              <input style={S.input} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Ex.: RG de 1998, cliente conhecida do escritório" />
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="lxs-btn wine" disabled={busy === 'review'} onClick={() => decide(true)}>{busy === 'review' ? 'Processando...' : 'É a mesma pessoa — aprovar'}</button>
              <button className="lxs-btn gold" disabled={busy === 'review'} onClick={() => decide(false)}>Recusar</button>
              <button className="lxs-btn" disabled={busy === 'review'} onClick={() => setReview(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'track' && <>
        <div className="lxs-row" role="group" aria-label="Filtrar assinaturas">
          {FILTERS.map((f) => <button key={f.key} type="button" className="lxs-btn lxs-choice" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label} ({groupsBy(f.match).length})</button>)}
        </div>
        {link && (
          <div className="lxs-link">
            {shareMsg && <textarea readOnly value={shareMsg} rows={8} onFocus={(e) => e.currentTarget.select()} />}
            <div className="lxs-row">
              {shareMsg && <button type="button" className="lxs-btn gold" onClick={() => copyText(shareMsg, 'Mensagem copiada.')}>Copiar mensagem completa</button>}
              <button type="button" className="lxs-btn" onClick={() => copyText(link, 'Link copiado.')}>Copiar só o link</button>
            </div>
          </div>
        )}
        {!shown.length && <p className="lxs-hint">Nada nesta lista.</p>}
        {shown.map((g) => {
          const r = g[0];
          const many = g.length > 1;
          const st = groupStatus(g);
          const gk = r.batch_id || r.id;
          const isOpen = !!openGroups[gk];
          const signedCount = g.filter((x) => x.status === 'signed' && x.signed_path).length;
          return (
            <div key={gk} className="lxs-card lxs-item">
              <div className="lxs-item-head">
                <b>{r.signer_name}</b>
                <span className={`lxs-status ${st}`}>{STATUS[st] || st}</span>
              </div>
              <p>{many ? `${g.length} documentos num único link` : r.title}</p>
              <small>Enviado {dt(r.created_at)}{r.viewed_at ? ` • aberto ${dt(r.viewed_at)}` : ''}{!many && r.verification_code ? ` • código ${r.verification_code}` : ''}{r.signed_at && st === 'signed' ? ` • assinado ${dt(r.signed_at)}` : ''}</small>
              <div className="lxs-row">
                {st === 'pending_review' && <button type="button" className="lxs-btn wine" disabled={!!busy} onClick={() => openReview(r)}>{busy === r.id ? '...' : 'Conferir'}</button>}
                {!many && r.status === 'signed' && <button type="button" className="lxs-btn wine" onClick={() => downloadSigned(r)}>Baixar assinado</button>}
                {many && signedCount > 0 && <button type="button" className="lxs-btn wine" onClick={() => downloadBatch(g)}>Baixar assinados ({signedCount})</button>}
                {['sent', 'viewed', 'expired', 'rejected'].includes(st) && <button type="button" className="lxs-btn gold" disabled={!!busy} onClick={() => resend(r)}>{busy === r.id ? '...' : 'Reenviar'}</button>}
                {many && <button type="button" className="lxs-btn" aria-expanded={isOpen} onClick={() => toggleGroup(gk)}>{isOpen ? 'Recolher ▲' : `Ver documentos (${g.length}) ▼`}</button>}
                {['sent', 'viewed', 'pending_review'].includes(st) && <button type="button" className="lxs-btn" disabled={!!busy} onClick={() => cancel(r)}>Cancelar</button>}
              </div>
              {many && isOpen && (
                <ul>
                  {g.map((m) => (
                    <li key={m.id}>
                      <span>{m.title}{m.verification_code && m.status === 'signed' ? ` • código ${m.verification_code}` : ''}</span>
                      <small>{STATUS[m.status] || m.status}</small>
                      {m.status === 'signed' && <button type="button" className="lxs-btn small" onClick={() => downloadSigned(m)}>Baixar assinado</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </>}
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  h3: { margin: '0 0 10px', fontSize: "var(--lx-font-lg)" },
  p: { margin: 0, color: "var(--lx-text)", fontSize: "max(var(--lx-font-md),1rem)", lineHeight: 1.65 },
  label: { display: 'flex', flexDirection: 'column', gap: 7, fontWeight: 700 },
  input: { background: "var(--lx-surface-raised)", border: "1px solid var(--lx-border)", borderRadius: "var(--lx-radius-md)", padding: '10px 12px', color: 'inherit', fontSize: "var(--lx-font-md)" },
  img: { width: '100%', height: 240, objectFit: 'contain', background: "var(--lx-surface-raised)", borderRadius: "var(--lx-radius-md)", border: "1px solid var(--lx-border)" },
  cap: { fontSize: "var(--lx-font-xs)", color: "var(--lx-text)", marginTop: 4, textAlign: 'center' },
};

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// Painel de envio da assinatura biométrica própria do LEXOFFICE (gratuita).
type Client = { id: string; name: string; whatsapp?: string | null; phone?: string | null };
type Doc = { id: string; name: string; file_path: string; mime_type?: string | null; created_at?: string | null };
type Req = { id: string; batch_id?: string | null; title: string; signer_name?: string | null; status: string; created_at: string; viewed_at?: string | null; signed_at?: string | null; signed_path?: string | null; verification_code?: string | null; face_distance?: number | null };

const FN = 'signature-biometric-public';
const STATUS: Record<string, string> = { sent: 'Enviado', viewed: 'Aberto pelo cliente', pending_review: 'Aguardando sua conferência', signed: 'Assinado', rejected: 'Recusada', cancelled: 'Cancelado', expired: 'Expirado' };
const COLOR: Record<string, string> = { pending_review: '#e0a13a', rejected: '#C99443', sent: '#c9a55c', viewed: '#D6AA55', signed: '#C99443', cancelled: '#8c8c8c', expired: '#C99443' };
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
  const [uploading, setUploading] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState('');
  // Lista de documentos de cada envio: começa recolhida; clique para abrir/fechar.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) => setOpenGroups((o) => ({ ...o, [k]: !o[k] }));

  async function loadReqs() {
    if (!supabase) return;
    const { data } = await supabase.from('lex_signature_requests').select('id,batch_id,title,signer_name,status,created_at,viewed_at,signed_at,signed_path,verification_code,face_distance').order('created_at', { ascending: false }).limit(80);
    setReqs((data as Req[]) || []);
  }
  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.from('clients').select('id,name,whatsapp,phone').not('name', 'ilike', '%DUPLICADO%').order('name').limit(2000);
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
        const { data } = await supabase.from('clients').select('id,name,whatsapp,phone').ilike('name', `%${safe}%`).not('name', 'ilike', '%DUPLICADO%').order('name').limit(50);
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

  async function send() {
    setBusy('send'); setNotice(''); setLink('');
    try {
      // Todos os documentos marcados vão num único link: o cliente valida a identidade uma vez só e assina todos.
      const ordered = docs.filter((d) => docIds.includes(d.id)).map((d) => d.id);
      if (ordered.length > 30) throw new Error('Envie no máximo 30 documentos por vez.');
      const d = await invoke({ action: 'create', document_ids: ordered, client_id: clientId });
      setLink(d.link);
      const what = ordered.length > 1 ? `${ordered.length} documentos enviados num único link` : 'Link enviado';
      setNotice(d.whatsapp_sent ? `${what} ao cliente pelo WhatsApp.` : 'Solicitação criada, mas o WhatsApp não enviou a mensagem. Copie o link abaixo e envie manualmente.');
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
    setBusy(r.id); setNotice(''); setLink('');
    try { const d = await invoke({ action: 'resend', id: r.id }); setLink(d.link); setNotice(d.whatsapp_sent ? 'Novo link enviado pelo WhatsApp (o link anterior deixou de valer).' : 'Novo link gerado. O WhatsApp não enviou; copie e envie manualmente.'); await loadReqs(); }
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

  return (
    <section style={S.panel}>
      <div style={S.head}>
        <div>
          <span style={S.pill}>GRATUITA • BIOMETRIA FACIAL</span>
          <h2 style={S.h2}>Assinatura LEX com reconhecimento facial</h2>
          <p style={S.p}>O cliente recebe um link pelo WhatsApp, confirma um código, fotografa o RG ou a CNH e faz uma selfie com prova de vida. O PDF assinado, com o certificado, volta sozinho para a ficha do cliente.</p>
        </div>
      </div>
      <div style={S.grid}>
        <label style={S.label}>Cliente
          <input style={S.input} placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select style={S.input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">{searchingClients ? 'Buscando cliente...' : 'Selecione o cliente'}</option>
            {filtered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {client && <small style={{ color: phone ? "var(--lx-text)" : "var(--lx-accent)" }}>{phone ? `WhatsApp: ${phone}` : 'Este cliente não tem WhatsApp cadastrado.'}</small>}
        </label>
        <div style={S.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>Documentos para assinar {docIds.length > 0 && <b style={{ color: "var(--lx-accent)" }}>• {docIds.length} selecionado{docIds.length > 1 ? 's' : ''}</b>}</span>
            {docs.length > 1 && <button type="button" style={S.small} onClick={() => setDocIds(allSelected ? [] : docs.map((d) => d.id))}>{allSelected ? 'Desmarcar todos' : 'Selecionar todos'}</button>}
          </div>
          <div style={S.docList}>
            {!clientId && <p style={S.empty}>Escolha o cliente primeiro.</p>}
            {clientId && !docs.length && <p style={S.empty}>Nenhum PDF na ficha deste cliente. Adicione abaixo.</p>}
            {docs.map((d) => {
              const on = docIds.includes(d.id);
              return (
                <label key={d.id} style={{ ...S.docItem, ...(on ? S.docOn : {}) }}>
                  <input type="checkbox" checked={on} onChange={() => toggleDoc(d.id)} style={{ width: 18, height: 18, accentColor: "var(--lx-accent)", flex: 'none' }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: "var(--lx-text)" }}>{d.name}</span>
                    <small style={{ color: "var(--lx-text)" }}>{dt(d.created_at)}</small>
                  </span>
                </label>
              );
            })}
          </div>
          <small style={{ color: "var(--lx-text)" }}>Marque um ou mais. Todos vão no mesmo link: o cliente valida a identidade uma vez só e assina todos juntos.</small>
        </div>
      </div>
      <div style={S.upload}>
        <span style={{ fontSize: "var(--lx-font-sm)", color: "var(--lx-text)" }}>Adicionar PDFs do computador à ficha do cliente:</span>
        <label style={{ ...S.small, opacity: !clientId || uploading ? 0.5 : 1, cursor: !clientId || uploading ? 'not-allowed' : 'pointer' }}>
          {uploading ? 'Enviando arquivos...' : 'Escolher PDFs'}
          <input type="file" accept="application/pdf,.pdf" multiple hidden disabled={!clientId || uploading} onChange={(e) => { addUploads(e.target.files); e.target.value = ''; }} />
        </label>
        <small style={{ color: "var(--lx-text)" }}>Pode escolher vários de uma vez; eles entram marcados na lista acima.</small>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button style={{ ...S.btn, opacity: !docIds.length || !phone || busy || uploading ? 0.5 : 1 }} disabled={!docIds.length || !phone || !!busy || uploading} onClick={send}>
          {busy === 'send' ? 'Criando assinatura...' : 'Assinar pelo sistema LEX'}
        </button>
        <button style={{ ...S.btnAlt, opacity: !docIds.length || !phone || busy || uploading ? 0.5 : 1 }} disabled={!docIds.length || !phone || !!busy || uploading} onClick={sendWhatsAppOnly}>
          {busy === 'whatsapp-only' ? 'Enviando PDFs...' : 'Enviar PDFs pelo WhatsApp (sem assinatura LEX)'}
        </button>
      </div>
      <small style={{ ...S.p, display: 'block', marginTop: 8 }}>A segunda opção apenas entrega os arquivos no WhatsApp. Ela não cria solicitação, biometria ou assinatura dentro da Lex.</small>
      {notice && <p style={S.notice}>{notice}</p>}
      {link && <div style={S.linkBox}><code style={{ wordBreak: 'break-all' }}>{link}</code><button style={S.small} onClick={() => { navigator.clipboard?.writeText(link); setNotice('Link copiado.'); }}>Copiar link</button></div>}

      {review && (
        <div style={S.overlay} onClick={() => busy !== 'review' && setReview(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ ...S.h3, marginTop: 0 }}>Conferência de identidade</h3>
            <p style={S.p}><b>{(review.documents?.length || 1) > 1 ? `${review.documents.length} documentos (um único link)` : review.title}</b><br />{review.signer_name} • CPF {review.signer_cpf} • WhatsApp {review.signer_phone}</p>
            {(review.documents?.length || 0) > 1 && <ul style={{ ...S.p, margin: '8px 0 0', paddingLeft: 18 }}>{review.documents.map((d: any) => <li key={d.id}>{d.title}</li>)}</ul>}
            <p style={{ ...S.p, marginTop: 8 }}>O reconhecimento automático não confirmou o rosto após {review.face_attempts || 0} tentativas{typeof review.face_distance === 'number' ? ` (distância ${review.face_distance.toFixed(3)}; limite ${review.face_limit})` : ''}. A prova de vida e o código do WhatsApp foram aprovados. Compare as duas fotos:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '12px 0' }}>
              <figure style={{ margin: 0 }}>{review.selfie_url ? <img src={review.selfie_url} alt="Selfie" style={S.img} /> : <p style={S.p}>Selfie indisponível</p>}<figcaption style={S.cap}>Selfie (prova de vida)</figcaption></figure>
              <figure style={{ margin: 0 }}>{review.id_photo_url ? <img src={review.id_photo_url} alt="Documento" style={S.img} /> : <p style={S.p}>Foto indisponível</p>}<figcaption style={S.cap}>RG / CNH apresentado</figcaption></figure>
            </div>
            <label style={S.label}>Observação (opcional, vai para o certificado)
              <input style={S.input} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Ex.: RG de 1998, cliente conhecida do escritório" />
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button style={S.btn} disabled={busy === 'review'} onClick={() => decide(true)}>{busy === 'review' ? 'Processando...' : 'É a mesma pessoa — aprovar'}</button>
              <button style={{ ...S.small, padding: '12px 16px', fontSize: "var(--lx-font-md)" }} disabled={busy === 'review'} onClick={() => decide(false)}>Recusar</button>
              <button style={{ ...S.small, padding: '12px 16px', fontSize: "var(--lx-font-md)", background: 'transparent' }} disabled={busy === 'review'} onClick={() => setReview(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      <h3 style={S.h3}>Acompanhamento</h3>
      {!reqs.length && <p style={S.p}>Nenhuma assinatura enviada ainda.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {groups.map((g) => {
          const r = g[0];
          const many = g.length > 1;
          const st = groupStatus(g);
          const gk = r.batch_id || r.id;
          const isOpen = !!openGroups[gk];
          return (
            <div key={r.batch_id || r.id} style={{ ...S.row, flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{many ? `${g.length} documentos • um único link` : r.title}</b>
                  <small style={{ color: "var(--lx-text)" }}>{r.signer_name} • enviado {dt(r.created_at)}{r.viewed_at ? ` • aberto ${dt(r.viewed_at)}` : ''}{!many && r.verification_code ? ` • código ${r.verification_code}` : ''}{r.signed_at && st === 'signed' ? ` • ASSINADO EM ${dt(r.signed_at)}` : ''}</small>
                </div>
                <span style={{ ...S.status, color: COLOR[st] || "var(--lx-text)", borderColor: COLOR[st] || "var(--lx-border)" }}>{STATUS[st] || st}</span>
                {st === 'pending_review' && <button style={{ ...S.small, background: "var(--lx-accent-soft)", borderColor: "var(--lx-accent)", color: "var(--lx-text)" }} disabled={!!busy} onClick={() => openReview(r)}>{busy === r.id ? '...' : 'Conferir'}</button>}
                {!many && r.status === 'signed' && <button style={S.small} onClick={() => downloadSigned(r)}>Baixar assinado</button>}
                {['sent', 'viewed', 'expired', 'rejected'].includes(st) && <button style={S.small} disabled={!!busy} onClick={() => resend(r)}>{busy === r.id ? '...' : 'Reenviar'}</button>}
                {['sent', 'viewed', 'pending_review'].includes(st) && <button style={{ ...S.small, background: 'transparent' }} disabled={!!busy} onClick={() => cancel(r)}>Cancelar</button>}
                {many && g.some((x) => x.status === 'signed' && x.signed_path) && <button type="button" style={{ ...S.small, background: "var(--lx-accent-soft)", borderColor: "var(--lx-accent)", color: "var(--lx-text)" }} onClick={() => downloadBatch(g)}>Baixar lote assinado ({g.filter((x) => x.status === 'signed' && x.signed_path).length})</button>}
                {many && <button type="button" style={S.small} aria-expanded={isOpen} onClick={() => toggleGroup(gk)}>{isOpen ? 'Recolher ▲' : `Ver documentos (${g.length}) ▼`}</button>}
              </div>
              {many && isOpen && (
                <div style={{ display: 'grid', gap: 4, marginTop: 8, paddingLeft: 10, borderLeft: "2px solid var(--lx-accent)" }}>
                  {g.map((m) => (
                    <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: "var(--lx-font-sm)" }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: "var(--lx-text)" }}>{m.title}{m.verification_code && m.status === 'signed' ? <small style={{ color: "var(--lx-text)" }}> • código {m.verification_code}</small> : null}</span>
                      <small style={{ color: COLOR[m.status] || "var(--lx-text)" }}>{STATUS[m.status] || m.status}</small>
                      {m.status === 'signed' && <button style={S.small} onClick={() => downloadSigned(m)}>Baixar assinado</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: { border: "1px solid var(--lx-border)", borderRadius: "var(--lx-radius-md)", padding: 20, marginBottom: 18, background: "linear-gradient(145deg,var(--lx-surface-raised),var(--lx-surface-raised))" },
  head: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  pill: { fontSize: "var(--lx-font-xs)", letterSpacing: '.08em', color: "var(--lx-accent)", fontWeight: 700 },
  h2: { margin: '6px 0 6px', fontSize: "var(--lx-section-size)" },
  h3: { margin: '22px 0 10px', fontSize: "var(--lx-font-lg)", color: "var(--lx-accent)", textTransform: 'uppercase', letterSpacing: '.06em' },
  p: { margin: 0, color: "var(--lx-text)", fontSize: "var(--lx-font-md)", lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, margin: '10px 0 14px' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: "var(--lx-font-sm)", color: "var(--lx-text)" },
  input: { background: "var(--lx-surface-raised)", border: "1px solid var(--lx-border)", borderRadius: "var(--lx-radius-md)", padding: '10px 12px', color: 'inherit', fontSize: "var(--lx-font-md)" },
  btn: { background: "var(--lx-accent-soft)", color: "var(--lx-text)", border: 0, borderRadius: "var(--lx-radius-md)", padding: '12px 18px', fontWeight: 600, fontSize: "var(--lx-font-lg)", cursor: 'pointer' },
  btnAlt: { background: 'transparent', color: "var(--lx-accent)", border: "1px solid var(--lx-accent)", borderRadius: "var(--lx-radius-md)", padding: '12px 18px', fontWeight: 600, fontSize: "var(--lx-font-lg)", cursor: 'pointer' },
  small: { background: "var(--lx-surface-raised)", color: 'inherit', border: "1px solid var(--lx-border)", borderRadius: "var(--lx-radius-md)", padding: '6px 10px', fontSize: "var(--lx-font-xs)", cursor: 'pointer', whiteSpace: 'nowrap' },
  notice: { margin: '10px 0 0', color: "var(--lx-text)", fontSize: "var(--lx-font-md)" },
  linkBox: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, padding: 10, borderRadius: "var(--lx-radius-md)", background: "var(--lx-surface-raised)", fontSize: "var(--lx-font-xs)" },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: "var(--lx-radius-md)", background: "var(--lx-surface-raised)", border: "1px solid var(--lx-border)" },
  upload: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, padding: 12, borderRadius: "var(--lx-radius-md)", border: "1px dashed var(--lx-border)" },
  overlay: { position: 'fixed', inset: 0, background: "var(--lx-surface-raised)", zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'auto', background: "var(--lx-surface-raised)", border: "1px solid var(--lx-border)", borderRadius: "var(--lx-radius-md)", padding: 20 },
  img: { width: '100%', height: 240, objectFit: 'contain', background: "var(--lx-surface-raised)", borderRadius: "var(--lx-radius-md)", border: "1px solid var(--lx-border)" },
  cap: { fontSize: "var(--lx-font-xs)", color: "var(--lx-text)", marginTop: 4, textAlign: 'center' },
  docList: { display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto', padding: 6, borderRadius: "var(--lx-radius-md)", background: "var(--lx-surface-raised)", border: "1px solid var(--lx-border)" },
  docItem: { display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: "var(--lx-radius-md)", border: "1px solid var(--lx-border)", background: "var(--lx-surface-raised)", cursor: 'pointer' },
  docOn: { borderColor: "var(--lx-border)", background: "var(--lx-surface-raised)" },
  empty: { margin: 0, padding: 8, color: "var(--lx-text)", fontSize: "var(--lx-font-sm)" },
  status: { fontSize: "var(--lx-font-xs)", fontWeight: 600, border: '1px solid', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' },
};

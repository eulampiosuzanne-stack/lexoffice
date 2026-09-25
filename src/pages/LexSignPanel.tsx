import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// Painel de envio da assinatura biométrica própria do LEXOFFICE (gratuita).
type Client = { id: string; name: string; whatsapp?: string | null; phone?: string | null };
type Doc = { id: string; name: string; file_path: string; mime_type?: string | null; created_at?: string | null };
type Req = { id: string; title: string; signer_name?: string | null; status: string; created_at: string; viewed_at?: string | null; signed_at?: string | null; signed_path?: string | null; verification_code?: string | null; face_distance?: number | null };

const FN = 'signature-biometric-public';
const STATUS: Record<string, string> = { sent: 'Enviado', viewed: 'Aberto pelo cliente', pending_review: 'Aguardando sua conferência', signed: 'Assinado', rejected: 'Recusada', cancelled: 'Cancelado', expired: 'Expirado' };
const COLOR: Record<string, string> = { pending_review: '#e0a13a', rejected: '#b0645a', sent: '#c9a55c', viewed: '#5aa0d8', signed: '#3fae6a', cancelled: '#8c8c8c', expired: '#b0645a' };
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
  const [clientId, setClientId] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docId, setDocId] = useState('');
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState('');

  async function loadReqs() {
    if (!supabase) return;
    const { data } = await supabase.from('lex_signature_requests').select('id,title,signer_name,status,created_at,viewed_at,signed_at,signed_path,verification_code,face_distance').order('created_at', { ascending: false }).limit(40);
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
  useEffect(() => {
    (async () => {
      setDocs([]); setDocId('');
      if (!supabase || !clientId) return;
      const { data } = await supabase.from('documents').select('id,name,file_path,mime_type,created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100);
      setDocs(((data as Doc[]) || []).filter((d) => /pdf/i.test(d.mime_type || '') || /\.pdf$/i.test(d.file_path || '')).filter((d) => !/\(assinado\)/i.test(d.name)));
    })();
  }, [clientId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients).slice(0, 200);
  }, [clients, search]);
  // Se a busca deixar só um cliente, ele já fica selecionado.
  useEffect(() => {
    if (search.trim() && filtered.length === 1 && filtered[0].id !== clientId) setClientId(filtered[0].id);
  }, [filtered, search, clientId]);
  const client = clients.find((c) => c.id === clientId);
  const phone = client?.whatsapp || client?.phone || '';

  async function send() {
    setBusy('send'); setNotice(''); setLink('');
    try {
      const d = await invoke({ action: 'create', document_id: docId, client_id: clientId });
      setLink(d.link);
      setNotice(d.whatsapp_sent ? 'Link enviado ao cliente pelo WhatsApp.' : 'Solicitação criada, mas o WhatsApp não enviou a mensagem. Copie o link abaixo e envie manualmente.');
      await loadReqs();
    } catch (e: any) { setNotice(e?.message || 'Falha ao enviar.'); } finally { setBusy(''); }
  }
  async function sendUpload() {
    if (!supabase || !file || !clientId) return;
    setBusy('send'); setNotice(''); setLink('');
    try {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Escolha um arquivo PDF.');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão inválida.');
      const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
      if (!p?.org_id) throw new Error('Organização não encontrada.');
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
      const path = `${p.org_id}/signatures/lex/${Date.now()}-${crypto.randomUUID()}-${safe}`;
      const { error: ue } = await supabase.storage.from('lexoffice-documents').upload(path, file, { contentType: 'application/pdf' });
      if (ue) throw ue;
      const { data: d, error: de } = await supabase.from('documents').insert({ org_id: p.org_id, client_id: clientId, name: file.name, file_path: path, mime_type: 'application/pdf', size_bytes: file.size, category: 'Documento para assinatura', notes: 'Enviado ao cliente para assinatura com biometria facial LEX', uploaded_by: user.id }).select('id').single();
      if (de) throw de;
      const r = await invoke({ action: 'create', document_id: d.id, client_id: clientId });
      setLink(r.link); setFile(null);
      setNotice(r.whatsapp_sent ? 'Link enviado ao cliente pelo WhatsApp.' : 'Solicitação criada, mas o WhatsApp não enviou a mensagem. Copie o link abaixo e envie manualmente.');
      await loadReqs();
    } catch (e: any) { setNotice(e?.message || 'Falha ao enviar.'); } finally { setBusy(''); }
  }
  async function resend(r: Req) {
    setBusy(r.id); setNotice(''); setLink('');
    try { const d = await invoke({ action: 'resend', id: r.id }); setLink(d.link); setNotice(d.whatsapp_sent ? 'Novo link enviado pelo WhatsApp (o link anterior deixou de valer).' : 'Novo link gerado. O WhatsApp não enviou; copie e envie manualmente.'); await loadReqs(); }
    catch (e: any) { setNotice(e?.message || 'Falha ao reenviar.'); } finally { setBusy(''); }
  }
  async function cancel(r: Req) {
    if (!confirm(`Cancelar a assinatura de "${r.title}"? O link enviado deixará de funcionar.`)) return;
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
      setNotice(approve ? 'Assinatura aprovada. O PDF assinado foi arquivado na ficha do cliente.' : 'Assinatura recusada. O cliente foi avisado pelo WhatsApp.');
      setReview(null); await loadReqs();
    } catch (e: any) { setNotice(e?.message || 'Falha ao registrar a decisão.'); } finally { setBusy(''); }
  }
  async function openSigned(r: Req) {
    if (!supabase || !r.signed_path) return;
    const { data, error } = await supabase.storage.from('lexoffice-documents').createSignedUrl(r.signed_path, 300);
    if (error || !data?.signedUrl) { setNotice(error?.message || 'Não foi possível abrir.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

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
            <option value="">Selecione o cliente</option>
            {filtered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {client && <small style={{ color: phone ? '#9fb3a6' : '#e0857a' }}>{phone ? `WhatsApp: ${phone}` : 'Este cliente não tem WhatsApp cadastrado.'}</small>}
        </label>
        <label style={S.label}>Documento (PDF da ficha do cliente)
          <select style={S.input} value={docId} onChange={(e) => setDocId(e.target.value)} disabled={!clientId}>
            <option value="">{clientId ? (docs.length ? 'Selecione o documento' : 'Nenhum PDF na ficha deste cliente') : 'Escolha o cliente primeiro'}</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.name} — {dt(d.created_at)}</option>)}
          </select>
          <small style={{ color: '#9aa3ab' }}>Gere o documento na aba Documentos ou na ficha do cliente; ele aparece aqui.</small>
        </label>
      </div>
      <button style={{ ...S.btn, opacity: !docId || !phone || busy ? 0.5 : 1 }} disabled={!docId || !phone || !!busy} onClick={send}>{busy === 'send' ? 'Enviando...' : 'Enviar para assinatura pelo WhatsApp'}</button>
      <div style={S.upload}>
        <span style={{ fontSize: 13, color: '#c7ced4' }}>Ou envie um PDF do seu computador para o cliente selecionado:</span>
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={!clientId} />
        <button style={{ ...S.small, opacity: !file || !clientId || !phone || busy ? 0.5 : 1 }} disabled={!file || !clientId || !phone || !!busy} onClick={sendUpload}>Enviar este PDF para assinatura</button>
      </div>
      {notice && <p style={S.notice}>{notice}</p>}
      {link && <div style={S.linkBox}><code style={{ wordBreak: 'break-all' }}>{link}</code><button style={S.small} onClick={() => { navigator.clipboard?.writeText(link); setNotice('Link copiado.'); }}>Copiar link</button></div>}

      {review && (
        <div style={S.overlay} onClick={() => busy !== 'review' && setReview(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ ...S.h3, marginTop: 0 }}>Conferência de identidade</h3>
            <p style={S.p}><b>{review.title}</b><br />{review.signer_name} • CPF {review.signer_cpf} • WhatsApp {review.signer_phone}</p>
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
              <button style={{ ...S.small, padding: '12px 16px', fontSize: 14 }} disabled={busy === 'review'} onClick={() => decide(false)}>Recusar</button>
              <button style={{ ...S.small, padding: '12px 16px', fontSize: 14, background: 'transparent' }} disabled={busy === 'review'} onClick={() => setReview(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      <h3 style={S.h3}>Acompanhamento</h3>
      {!reqs.length && <p style={S.p}>Nenhuma assinatura enviada ainda.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {reqs.map((r) => (
          <div key={r.id} style={S.row}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</b>
              <small style={{ color: '#9aa3ab' }}>{r.signer_name} • enviado {dt(r.created_at)}{r.viewed_at ? ` • aberto ${dt(r.viewed_at)}` : ''}{r.signed_at ? ` • assinado ${dt(r.signed_at)}` : ''}{r.verification_code ? ` • código ${r.verification_code}` : ''}</small>
            </div>
            <span style={{ ...S.status, color: COLOR[r.status] || '#ccc', borderColor: COLOR[r.status] || '#555' }}>{STATUS[r.status] || r.status}</span>
            {r.status === 'pending_review' && <button style={{ ...S.small, background: '#8f1f3e', borderColor: '#8f1f3e', color: '#fff' }} disabled={!!busy} onClick={() => openReview(r)}>{busy === r.id ? '...' : 'Conferir'}</button>}
            {r.status === 'signed' && <button style={S.small} onClick={() => openSigned(r)}>Abrir assinado</button>}
            {['sent', 'viewed', 'expired', 'rejected'].includes(r.status) && <button style={S.small} disabled={!!busy} onClick={() => resend(r)}>{busy === r.id ? '...' : 'Reenviar'}</button>}
            {['sent', 'viewed', 'pending_review'].includes(r.status) && <button style={{ ...S.small, background: 'transparent' }} disabled={!!busy} onClick={() => cancel(r)}>Cancelar</button>}
          </div>
        ))}
      </div>
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: { border: '1px solid rgba(201,165,92,.35)', borderRadius: 16, padding: 20, marginBottom: 18, background: 'linear-gradient(145deg,rgba(143,31,62,.14),rgba(255,255,255,.02))' },
  head: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  pill: { fontSize: 11, letterSpacing: '.08em', color: '#c9a55c', fontWeight: 700 },
  h2: { margin: '6px 0 6px', fontSize: 20 },
  h3: { margin: '22px 0 10px', fontSize: 15, color: '#c9a55c', textTransform: 'uppercase', letterSpacing: '.06em' },
  p: { margin: 0, color: '#aab3bb', fontSize: 14, lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, margin: '10px 0 14px' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#c7ced4' },
  input: { background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, padding: '10px 12px', color: 'inherit', fontSize: 14 },
  btn: { background: '#8f1f3e', color: '#fff', border: 0, borderRadius: 10, padding: '12px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer' },
  small: { background: 'rgba(255,255,255,.06)', color: 'inherit', border: '1px solid rgba(255,255,255,.16)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  notice: { margin: '10px 0 0', color: '#d9c38f', fontSize: 14 },
  linkBox: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,.25)', fontSize: 12 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' },
  upload: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, padding: 12, borderRadius: 10, border: '1px dashed rgba(255,255,255,.18)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'auto', background: '#1a1316', border: '1px solid rgba(201,165,92,.35)', borderRadius: 16, padding: 20 },
  img: { width: '100%', height: 240, objectFit: 'contain', background: 'rgba(0,0,0,.35)', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)' },
  cap: { fontSize: 12, color: '#9aa3ab', marginTop: 4, textAlign: 'center' },
  status: { fontSize: 12, fontWeight: 600, border: '1px solid', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' },
};

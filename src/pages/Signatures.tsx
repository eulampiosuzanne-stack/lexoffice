import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  FileCheck2,
  FileText,
  KeyRound,
  PenTool,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Usb,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import './integrations.css';

type RequestRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  external_id?: string | null;
  sent_at?: string | null;
  signed_at?: string | null;
  expires_at?: string | null;
  document_id?: string | null;
  client_id?: string | null;
  signer_name?: string | null;
  signer_phone?: string | null;
  created_at?: string | null;
  signed_document_id?: string | null;
  signed_file_captured_at?: string | null;
  icp_validated_document_id?: string | null;
  icp_validated_at?: string | null;
};

type DocumentRow = {
  id: string;
  name: string;
  file_path?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  mime_type?: string | null;
  created_at?: string | null;
};

type ClientRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  cpf_cnpj?: string | null;
};

type LocalCert = {
  subject: string;
  issuer: string;
  fingerprint: string;
  notBefore?: string;
  notAfter?: string;
};

const BRIDGE = 'http://127.0.0.1:17681';
const isSigned = (status?: string | null) => (status || '').toLowerCase() === 'signed';
const isWaiting = (status?: string | null) => ['sent', 'viewed'].includes((status || '').toLowerCase());

const pillStyle = (kind: 'draft' | 'waiting' | 'signed' | 'ready' | 'validated' | 'error') => {
  const map = {
    draft: ['#d99a42', 'rgba(217,154,66,.12)', 'rgba(217,154,66,.36)'],
    waiting: ['#e98686', 'rgba(185,28,28,.12)', 'rgba(185,28,28,.34)'],
    signed: ['#8ec5ff', 'rgba(64,130,210,.12)', 'rgba(64,130,210,.34)'],
    ready: ['#f1c970', 'rgba(217,164,65,.12)', 'rgba(217,164,65,.38)'],
    validated: ['#7fe1b7', 'rgba(48,133,92,.14)', 'rgba(48,133,92,.42)'],
    error: ['#e98686', 'rgba(185,28,28,.12)', 'rgba(185,28,28,.34)'],
  } as const;
  const [color, background, border] = map[kind];
  return { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 9px', borderRadius: 999, color, background, border: `1px solid ${border}`, fontSize: 10, fontWeight: 800, letterSpacing: '.035em', whiteSpace: 'nowrap' as const };
};

export default function Signatures() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const [accountEmail, setAccountEmail] = useState('');
  const [token, setToken] = useState('');
  const [configured, setConfigured] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState('não configurada');

  const [requestDocumentId, setRequestDocumentId] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [bridgeChecked, setBridgeChecked] = useState(false);
  const [certs, setCerts] = useState<LocalCert[]>([]);
  const [certFingerprint, setCertFingerprint] = useState('');
  const [visibleSeal, setVisibleSeal] = useState(true);

  const selectedRequestDoc = useMemo(
    () => documents.find((d) => d.id === requestDocumentId) || null,
    [documents, requestDocumentId],
  );

  const dashboard = useMemo(() => rows.map((row) => {
    const client = clients.find((item) => item.id === row.client_id);
    return {
      ...row,
      clientName: client?.name || row.signer_name || 'Cliente',
      clientSigned: isSigned(row.status),
      readyForIcp: isSigned(row.status) && Boolean(row.signed_document_id) && !row.icp_validated_document_id,
      validated: Boolean(row.icp_validated_document_id),
    };
  }), [rows, clients]);

  const stats = useMemo(() => ({
    total: dashboard.length,
    draft: dashboard.filter((r) => (r.status || '').toLowerCase() === 'draft').length,
    waiting: dashboard.filter((r) => isWaiting(r.status)).length,
    ready: dashboard.filter((r) => r.readyForIcp).length,
    validated: dashboard.filter((r) => r.validated).length,
  }), [dashboard]);

  async function load(showFeedback = false) {
    if (!supabase) return;
    setLoading(true);
    const [{ data, error }, { data: docs, error: docsError }, { data: cls }, { data: cfg, error: cfgError }] = await Promise.all([
      supabase.from('signature_requests').select('id,title,status,external_id,sent_at,signed_at,expires_at,document_id,client_id,signer_name,signer_phone,created_at,signed_document_id,signed_file_captured_at,icp_validated_document_id,icp_validated_at').order('created_at', { ascending: false }),
      supabase.from('documents').select('id,name,file_path,client_id,process_id,mime_type,created_at').eq('mime_type', 'application/pdf').order('created_at', { ascending: false }).limit(1500),
      supabase.from('clients').select('id,name,email,phone,cpf_cnpj').order('name').limit(1500),
      supabase.functions.invoke('zapsign-configure', { body: { action: 'status' } }),
    ]);

    if (error) setNotice(error.message);
    else if (docsError) setNotice(docsError.message);
    else if (showFeedback) setNotice('Painel de assinaturas atualizado.');
    setRows((data || []) as RequestRow[]);
    setDocuments((docs || []) as DocumentRow[]);
    setClients((cls || []) as ClientRow[]);

    if (!cfgError && cfg) {
      setConfigured(Boolean((cfg as any).configured));
      setIntegrationStatus((cfg as any).status || 'não configurada');
      setAccountEmail((cfg as any).account_email || '');
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    checkBridge(false);
  }, []);

  useEffect(() => {
    if (!selectedRequestDoc?.client_id) return;
    const client = clients.find((item) => item.id === selectedRequestDoc.client_id);
    if (!client) return;
    setSignerName(client.name || '');
    setSignerEmail(client.email || '');
    setSignerPhone(client.phone || '');
  }, [selectedRequestDoc, clients]);

  async function checkBridge(showFeedback = true) {
    setBusy('bridge');
    setBridgeChecked(false);
    try {
      const response = await fetch(`${BRIDGE}/health`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('Ponte indisponível');
      const health = await response.json().catch(() => null);
      if (!health?.ok) throw new Error('Ponte respondeu sem confirmação de saúde');
      setBridgeOnline(true);
      if (showFeedback) setNotice(`Ponte ICP-Brasil conectada e pronta${health?.version ? ` • versão ${health.version}` : ''}.`);
    } catch {
      setBridgeOnline(false);
      setCerts([]);
      setCertFingerprint('');
      if (showFeedback) setNotice('Ponte ICP-Brasil não encontrada. Mantenha o programa da ponte aberto e tente novamente.');
    } finally {
      setBridgeChecked(true);
      setBusy(null);
    }
  }

  async function loadCertificates() {
    if (!bridgeOnline) {
      setNotice('A ponte está offline. Clique em Verificar ponte primeiro.');
      return;
    }
    setBusy('certificates');
    setNotice('Aguardando o PIN do token A3 no seu computador...');
    try {
      const certResponse = await fetch(`${BRIDGE}/certificates`, { signal: AbortSignal.timeout(60000) });
      const raw = await certResponse.text();
      let json: any = {};
      try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
      if (!certResponse.ok) throw new Error(json?.error || raw || 'Não foi possível acessar o certificado A3.');
      const list = (Array.isArray(json) ? json : (json.certificates || [])) as LocalCert[];
      setCerts(list);
      setCertFingerprint((current) => current && list.some((item) => item.fingerprint === current) ? current : (list[0]?.fingerprint || ''));
      setNotice(list.length ? 'Certificado A3 reconhecido e pronto para validar documentos assinados.' : 'Nenhum certificado foi encontrado no token.');
    } catch (error: any) {
      setNotice(error?.name === 'TimeoutError' ? 'Tempo esgotado aguardando o PIN. Tente novamente.' : (error?.message || 'Não foi possível carregar o certificado A3.'));
    } finally {
      setBusy(null);
    }
  }

  async function signIcpForRequest(row: RequestRow) {
    if (!supabase || !row.signed_document_id) return;
    const signedDoc = documents.find((doc) => doc.id === row.signed_document_id);
    if (!signedDoc?.file_path) {
      setNotice('O PDF final assinado pelo cliente ainda não está disponível na biblioteca. Atualize o painel em alguns segundos.');
      return;
    }
    if (!bridgeOnline) {
      setNotice('A ponte ICP-Brasil está offline. Clique em Verificar ponte.');
      return;
    }
    if (!certFingerprint) {
      setNotice('Carregue o certificado A3 antes de validar o documento.');
      return;
    }

    setBusy(`icp:${row.id}`);
    setNotice('Validando o PDF assinado pelo cliente com seu certificado ICP-Brasil...');
    try {
      const { data: pdf, error } = await supabase.storage.from('lexoffice-documents').download(signedDoc.file_path);
      if (error || !pdf) throw error || new Error('PDF assinado pelo cliente não encontrado.');

      const form = new FormData();
      form.append('file', pdf, signedDoc.name.replace(/\.[^.]+$/, '') + '.pdf');
      form.append('certificateFingerprint', certFingerprint);
      form.append('visibleSeal', String(visibleSeal));
      form.append('sealText', 'Validado com certificado ICP-Brasil');

      const response = await fetch(`${BRIDGE}/sign/pades`, { method: 'POST', body: form });
      if (!response.ok) throw new Error((await response.text()) || 'A validação ICP-Brasil não foi concluída.');
      const blob = await response.blob();
      if (!blob.size) throw new Error('O arquivo validado retornou vazio.');

      const path = signedDoc.file_path.replace(/\.pdf$/i, '') + `-validado-icpbr-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from('lexoffice-documents').upload(path, blob, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user ? await supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle() : ({ data: null } as any);
      if (!profile?.org_id) throw new Error('Organização não identificada.');

      const cert = certs.find((item) => item.fingerprint === certFingerprint);
      const { data: validatedDoc, error: insertError } = await supabase.from('documents').insert({
        org_id: profile.org_id,
        client_id: signedDoc.client_id || row.client_id || null,
        process_id: signedDoc.process_id || null,
        name: `${(row.title || signedDoc.name).replace(/\.pdf$/i, '')} — Validado ICP-Brasil.pdf`,
        file_path: path,
        mime_type: 'application/pdf',
        size_bytes: blob.size,
        category: 'Documento validado ICP-Brasil',
        notes: `PAdES ICP-Brasil • ${cert?.subject || 'certificado A3'} • ${cert?.issuer || ''} • ${new Date().toLocaleString('pt-BR')}`,
        uploaded_by: user?.id || null,
      }).select('id').single();
      if (insertError || !validatedDoc) throw insertError || new Error('Não foi possível registrar o documento validado.');

      const now = new Date().toISOString();
      const { error: requestError } = await supabase.from('signature_requests').update({
        icp_validated_document_id: validatedDoc.id,
        icp_validated_at: now,
        updated_at: now,
      }).eq('id', row.id);
      if (requestError) throw requestError;

      setNotice('Documento validado com ICP-Brasil, selo aplicado e versão final salva na biblioteca.');
      await load();
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível validar o documento com ICP-Brasil.');
    } finally {
      setBusy(null);
    }
  }

  async function saveConfig() {
    if (!supabase || !token.trim()) return;
    setBusy('config');
    const { data, error } = await supabase.functions.invoke('zapsign-configure', { body: { account_email: accountEmail.trim(), token: token.trim() } });
    if (error) setNotice(error.message);
    else if ((data as any)?.error) setNotice((data as any).error);
    else {
      setConfigured(true);
      setToken('');
      setNotice('ZapSign configurada.');
    }
    setBusy(null);
  }

  async function addRequest() {
    if (!supabase || !selectedRequestDoc || !signerName.trim()) return;
    setBusy('add');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(null); setNotice('Sessão expirada.'); return; }
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle();
    if (!profile?.org_id) { setBusy(null); setNotice('Organização não identificada.'); return; }

    const { data: request, error } = await supabase.from('signature_requests').insert({
      org_id: profile.org_id,
      client_id: selectedRequestDoc.client_id || null,
      process_id: selectedRequestDoc.process_id || null,
      document_id: selectedRequestDoc.id,
      title: selectedRequestDoc.name,
      signer_name: signerName.trim(),
      signer_email: signerEmail.trim() || null,
      signer_phone: signerPhone.trim() || null,
      provider: 'zapsign',
      status: 'draft',
      expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      created_by: user.id,
    }).select('id').single();
    if (error || !request) { setBusy(null); setNotice(error?.message || 'Não foi possível criar a solicitação.'); return; }

    const { error: signerError } = await supabase.from('signature_signers').insert({
      org_id: profile.org_id,
      signature_request_id: request.id,
      name: signerName.trim(),
      email: signerEmail.trim() || null,
      phone: signerPhone.trim() || null,
      signing_order: 1,
      status: 'pending',
    });
    if (signerError) {
      await supabase.from('signature_requests').delete().eq('id', request.id);
      setBusy(null);
      setNotice(signerError.message);
      return;
    }
    setNotice('Documento adicionado para assinatura.');
    setBusy(null);
    await load();
  }

  async function send(id: string) {
    if (!supabase) return;
    setBusy(id);
    const { data, error } = await supabase.functions.invoke('zapsign-send-signature', { body: { signature_request_id: id } });
    if (error) setNotice(error.message);
    else if ((data as any)?.error) setNotice((data as any).error);
    else { setNotice('Documento enviado para assinatura do cliente.'); await load(); }
    setBusy(null);
  }

  async function remind(row: RequestRow) {
    if (!supabase) return;
    setBusy(`remind:${row.id}`);
    const { data, error } = await supabase.functions.invoke('zapsign-send-signature', { body: { signature_request_id: row.id, resend: true, reminder: true } });
    if (error) setNotice(error.message);
    else if ((data as any)?.error) setNotice((data as any).error);
    else setNotice(`Cobrança de assinatura enviada para ${row.signer_name || 'o cliente'}.`);
    setBusy(null);
  }

  const statusCell = (row: RequestRow) => {
    const status = (row.status || 'draft').toLowerCase();
    if (row.icp_validated_document_id) return <span style={pillStyle('validated')}><CheckCircle2 size={13}/> VALIDADO ICP-BRASIL</span>;
    if (status === 'signed' && row.signed_document_id) return <span style={pillStyle('ready')}><FileCheck2 size={13}/> ASSINADO PELO CLIENTE</span>;
    if (status === 'signed') return <span style={pillStyle('signed')}><RefreshCw size={13}/> PREPARANDO PDF FINAL</span>;
    if (status === 'sent' || status === 'viewed') return <span style={pillStyle('waiting')}><Bell size={13}/> AGUARDANDO CLIENTE</span>;
    if (status === 'declined' || status === 'cancelled' || status === 'expired') return <span style={pillStyle('error')}><AlertTriangle size={13}/> {status.toUpperCase()}</span>;
    return <span style={pillStyle('draft')}><Activity size={13}/> AGUARDANDO ENVIO</span>;
  };

  return <>
    <div className="page-title">
      <h1>Assinaturas</h1>
      <p>Fluxo completo: envio ao cliente, acompanhamento da assinatura e validação final com ICP-Brasil A3.</p>
    </div>

    {notice && <div className="integration-notice">{notice}</div>}

    <div className="signature-kpis" style={{gridTemplateColumns:'repeat(5,minmax(0,1fr))'}}>
      <div><FileText size={18}/><span>Total</span><strong>{stats.total}</strong></div>
      <div className="pending"><Activity size={18}/><span>Aguardando envio</span><strong>{stats.draft}</strong></div>
      <div className="waiting"><Bell size={18}/><span>Aguardando cliente</span><strong>{stats.waiting}</strong></div>
      <div><FileCheck2 size={18}/><span>Prontos para ICP</span><strong>{stats.ready}</strong></div>
      <div className="done"><ShieldCheck size={18}/><span>Validados ICP</span><strong>{stats.validated}</strong></div>
    </div>

    <div className={`icp-bridge-panel ${bridgeOnline ? 'online' : 'offline'}`}>
      <div className="icp-bridge-main">
        <div className="icp-bridge-icon">{bridgeOnline ? <Wifi size={25}/> : <WifiOff size={25}/>}</div>
        <div>
          <span className="eyebrow">PONTE LOCAL ICP-BRASIL</span>
          <h2>{bridgeOnline ? 'Ponte conectada e pronta' : 'Ponte não detectada neste computador'}</h2>
          <p>{bridgeOnline ? 'A ponte está ativa. O certificado A3 será usado somente nos documentos que já tiverem sido assinados pelo cliente.' : 'Abra a ponte local e clique em Verificar ponte.'}</p>
        </div>
      </div>
      <div className="icp-bridge-actions">
        <span className={`bridge-badge ${bridgeOnline ? 'ok' : 'off'}`}>{bridgeOnline ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>} {bridgeOnline ? 'Online' : bridgeChecked ? 'Offline' : 'Verificando'}</span>
        <button className="integration-action" type="button" onClick={() => checkBridge(true)} disabled={busy === 'bridge'}><RefreshCw size={15}/>{busy === 'bridge' ? 'Verificando...' : 'Verificar ponte'}</button>
      </div>
    </div>

    <div className="integration-panel">
      <h3><Usb size={18}/> Certificado ICP-Brasil A3</h3>
      <p className="panel-description">Carregue seu certificado uma vez nesta sessão. O PIN é solicitado somente no seu computador. Depois, a validação fica disponível na tabela quando o cliente terminar de assinar.</p>
      <div className="integration-form">
        <label><KeyRound size={14}/> Certificado A3
          <select value={certFingerprint} onChange={(e) => setCertFingerprint(e.target.value)} disabled={!bridgeOnline || !certs.length}>
            <option value="">{certs.length ? 'Selecione o certificado' : 'Carregue o certificado'}</option>
            {certs.map((cert) => <option key={cert.fingerprint} value={cert.fingerprint}>{cert.subject} • {cert.issuer}</option>)}
          </select>
        </label>
        <button className="integration-action" type="button" onClick={loadCertificates} disabled={!bridgeOnline || busy === 'certificates'}><KeyRound size={16}/>{busy === 'certificates' ? 'Aguardando PIN...' : 'Carregar certificado A3'}</button>
        <label><input type="checkbox" checked={visibleSeal} onChange={(e) => setVisibleSeal(e.target.checked)}/> Aplicar selo visual ICP-Brasil no PDF final</label>
      </div>
    </div>

    <div className="integration-panel">
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:14}}>
        <div>
          <h3 style={{marginBottom:4}}><FileCheck2 size={18}/> Controle de documentos e validação</h3>
          <p className="panel-description" style={{margin:0}}>O botão ICP-Brasil só aparece depois que o cliente assina e o PDF final é recebido.</p>
        </div>
        <button className="integration-action" type="button" onClick={() => load(true)} disabled={loading}><RefreshCw size={15}/>{loading ? 'Atualizando...' : 'Atualizar painel'}</button>
      </div>

      <div style={{overflowX:'auto',border:'1px solid rgba(217,164,65,.15)',borderRadius:14}}>
        <table style={{width:'100%',minWidth:980,borderCollapse:'collapse',background:'rgba(7,9,11,.45)'}}>
          <thead>
            <tr style={{textAlign:'left',color:'#a9a092',fontSize:10,textTransform:'uppercase',letterSpacing:'.07em',borderBottom:'1px solid rgba(217,164,65,.18)'}}>
              <th style={{padding:'13px 14px'}}>Cliente</th><th style={{padding:'13px 14px'}}>Documento</th><th style={{padding:'13px 14px'}}>Assinatura do cliente</th><th style={{padding:'13px 14px'}}>ICP-Brasil</th><th style={{padding:'13px 14px'}}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{padding:22,color:'#9d9486'}}>Carregando documentos...</td></tr> : dashboard.length === 0 ? <tr><td colSpan={5} style={{padding:22,color:'#9d9486'}}>Nenhum documento em acompanhamento.</td></tr> : dashboard.map((row) => (
              <tr key={row.id} style={{borderBottom:'1px solid rgba(255,255,255,.055)'}}>
                <td style={{padding:'14px',color:'#f0e7d7',fontWeight:700}}>{row.clientName}</td>
                <td style={{padding:'14px',color:'#d7cebf'}}>{row.title || 'Documento'}</td>
                <td style={{padding:'14px'}}>{statusCell(row)}</td>
                <td style={{padding:'14px'}}>{row.icp_validated_document_id ? <span style={pillStyle('validated')}><ShieldCheck size={13}/> SELO APLICADO</span> : row.signed_document_id ? <span style={pillStyle('ready')}>PENDENTE</span> : <span style={{color:'#777',fontSize:11}}>Aguardando assinatura</span>}</td>
                <td style={{padding:'14px'}}>
                  {(row.status || '').toLowerCase() === 'draft' && <button className="integration-action" disabled={!configured || busy === row.id} onClick={() => send(row.id)}><Send size={14}/>{busy === row.id ? 'Enviando...' : 'Enviar ao cliente'}</button>}
                  {isWaiting(row.status) && <button className="integration-action" disabled={busy === `remind:${row.id}`} onClick={() => remind(row)}><Bell size={14}/>{busy === `remind:${row.id}` ? 'Enviando...' : 'Cobrar assinatura'}</button>}
                  {isSigned(row.status) && !row.signed_document_id && <button className="integration-action" disabled><RefreshCw size={14}/>Preparando arquivo</button>}
                  {isSigned(row.status) && row.signed_document_id && !row.icp_validated_document_id && <button className="integration-action" onClick={() => signIcpForRequest(row)} disabled={busy === `icp:${row.id}`}><ShieldCheck size={14}/>{busy === `icp:${row.id}` ? 'Validando...' : 'Validar com ICP-Brasil'}</button>}
                  {row.icp_validated_document_id && <span style={pillStyle('validated')}><CheckCircle2 size={13}/> CONCLUÍDO</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="integration-panel">
      <h3><Plus size={17}/> Nova assinatura do cliente</h3>
      <div className="integration-form">
        <label>Documento
          <select value={requestDocumentId} onChange={(e) => setRequestDocumentId(e.target.value)}><option value="">Selecione</option>{documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}</select>
        </label>
        <label><UserRound size={14}/> Signatário<input value={signerName} onChange={(e) => setSignerName(e.target.value)}/></label>
        <label>E-mail<input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)}/></label>
        <label>WhatsApp<input value={signerPhone} onChange={(e) => setSignerPhone(e.target.value)}/></label>
        <label>Prazo<input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}/></label>
        <button className="integration-action" onClick={addRequest} disabled={busy === 'add' || !requestDocumentId || !signerName.trim()}><PenTool size={16}/>{busy === 'add' ? 'Adicionando...' : 'Adicionar para assinatura'}</button>
      </div>
    </div>

    <div className="integration-panel">
      <h3><KeyRound size={17}/> Integração ZapSign</h3>
      <div className="integration-form">
        <label>E-mail da conta<input type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)}/></label>
        <label>Token / API key<input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={configured ? '•••••••• configurado' : 'Token ZapSign'}/></label>
        <label>Status<input value={configured ? `Configurada • ${integrationStatus}` : 'Não configurada'} readOnly/></label>
        <button className="integration-action" onClick={saveConfig} disabled={busy === 'config' || !token.trim()}><ShieldCheck size={16}/>Salvar integração</button>
      </div>
    </div>
  </>;
}

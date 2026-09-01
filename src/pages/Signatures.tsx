import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  KeyRound,
  RefreshCw,
  Send,
  ShieldCheck,
  UploadCloud,
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
  verification_method?: string | null;
  verification_status?: string | null;
  delivery_email?: boolean | null;
  delivery_whatsapp?: boolean | null;
};

type DocumentRow = {
  id: string;
  name: string;
  file_path?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  mime_type?: string | null;
  category?: string | null;
  created_at?: string | null;
};

type ClientRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cpf_cnpj?: string | null;
};

type LocalCert = {
  subject: string;
  issuer: string;
  fingerprint: string;
  notBefore?: string;
  notAfter?: string;
};

type ProviderStatus = {
  provider?: string;
  documenso: { configured: boolean; reachable: boolean; mode?: string; base_url?: string };
  biometrics: { configured: boolean; reachable: boolean };
};

const BRIDGE = 'http://127.0.0.1:17681';
const isSigned = (status?: string | null) => (status || '').toLowerCase() === 'signed';
const isWaiting = (status?: string | null) => ['sent', 'viewed'].includes((status || '').toLowerCase());
const safeName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'documento.pdf';

const verificationOptions = [
  { value: 'simple', label: 'Assinatura eletrônica', detail: 'Link seguro por e-mail e WhatsApp', biometric: false },
  { value: 'email', label: 'E-mail verificado', detail: 'Código adicional antes da assinatura', biometric: false },
  { value: 'facial', label: 'Biometria facial', detail: 'Selfie + prova de vida', biometric: true },
  { value: 'facial_document', label: 'Rosto + documento', detail: 'Selfie, prova de vida e identidade', biometric: true },
  { value: 'reinforced', label: 'Verificação reforçada', detail: 'Documento + face + prova de vida ativa', biometric: true },
];

const verificationLabel = (method?: string | null) => verificationOptions.find((item) => item.value === method)?.label || 'Assinatura eletrônica';

export default function Signatures() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const [selectedClientId, setSelectedClientId] = useState('');
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [existingDocumentIds, setExistingDocumentIds] = useState<string[]>([]);
  const [verificationMethod, setVerificationMethod] = useState('simple');
  const [expiresAt, setExpiresAt] = useState('');
  const [deliveryEmail, setDeliveryEmail] = useState(true);
  const [deliveryWhatsapp, setDeliveryWhatsapp] = useState(true);
  const [documensoToken, setDocumensoToken] = useState('');

  const [provider, setProvider] = useState<ProviderStatus>({
    documenso: { configured: false, reachable: false },
    biometrics: { configured: false, reachable: false },
  });

  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [bridgeChecked, setBridgeChecked] = useState(false);
  const [certs, setCerts] = useState<LocalCert[]>([]);
  const [certFingerprint, setCertFingerprint] = useState('');
  const [visibleSeal, setVisibleSeal] = useState(true);

  const selectedClient = useMemo(() => clients.find((client) => client.id === selectedClientId) || null, [clients, selectedClientId]);
  const clientDocuments = useMemo(() => documents.filter((doc) => doc.client_id === selectedClientId && !/(assinado|validado)/i.test(doc.category || '')), [documents, selectedClientId]);
  const documentMap = useMemo(() => new Map(documents.map((doc) => [doc.id, doc])), [documents]);

  const dashboard = useMemo(() => rows.map((row) => {
    const client = clients.find((item) => item.id === row.client_id);
    return {
      ...row,
      clientName: client?.name || row.signer_name || 'Cliente',
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
    await supabase.functions.invoke('documenso-refresh-signatures', { body: {} }).catch(() => null);
    const [{ data, error }, { data: docs, error: docsError }, { data: cls, error: clientsError }, providerResult] = await Promise.all([
      supabase.from('signature_requests').select('id,title,status,external_id,sent_at,signed_at,expires_at,document_id,client_id,signer_name,signer_phone,created_at,signed_document_id,signed_file_captured_at,icp_validated_document_id,icp_validated_at,verification_method,verification_status,delivery_email,delivery_whatsapp').order('created_at', { ascending: false }),
      supabase.from('documents').select('id,name,file_path,client_id,process_id,mime_type,category,created_at').eq('mime_type', 'application/pdf').order('created_at', { ascending: false }).limit(2000),
      supabase.from('clients').select('id,name,email,phone,whatsapp,cpf_cnpj').order('name').limit(2000),
      supabase.functions.invoke('signature-provider-status', { body: {} }),
    ]);

    if (error) setNotice(error.message);
    else if (docsError) setNotice(docsError.message);
    else if (clientsError) setNotice(clientsError.message);
    else if (showFeedback) setNotice('Painel atualizado.');

    setRows((data || []) as RequestRow[]);
    setDocuments((docs || []) as DocumentRow[]);
    setClients((cls || []) as ClientRow[]);
    if (!providerResult.error && providerResult.data) setProvider(providerResult.data as ProviderStatus);
    setLoading(false);
  }

  useEffect(() => {
    load();
    checkBridge(false);
    const timer = window.setInterval(() => load(false), 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function configureDocumenso() {
    if (!supabase || !documensoToken.trim()) return;
    setBusy('documenso');
    setNotice('Conectando o Documenso Cloud...');
    try {
      const { data, error } = await supabase.functions.invoke('documenso-configure', { body: { token: documensoToken.trim() } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDocumensoToken('');
      setNotice((data as any)?.message || 'Documenso Cloud conectado.');
      await load(false);
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível conectar o Documenso Cloud.');
    } finally {
      setBusy(null);
    }
  }

  async function checkBridge(showFeedback = true) {
    setBusy('bridge');
    setBridgeChecked(false);
    try {
      const response = await fetch(`${BRIDGE}/health`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('Ponte indisponível');
      const health = await response.json().catch(() => null);
      if (!health?.ok) throw new Error('Ponte respondeu sem confirmação de saúde');
      setBridgeOnline(true);
      if (showFeedback) setNotice(`Ponte ICP-Brasil conectada${health?.version ? ` • versão ${health.version}` : ''}.`);
    } catch {
      setBridgeOnline(false);
      setCerts([]);
      setCertFingerprint('');
      if (showFeedback) setNotice('Ponte ICP-Brasil não encontrada. Abra o programa da ponte e tente novamente.');
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
      setNotice(list.length ? 'Certificado A3 reconhecido e pronto.' : 'Nenhum certificado foi encontrado no token.');
    } catch (error: any) {
      setNotice(error?.name === 'TimeoutError' ? 'Tempo esgotado aguardando o PIN.' : (error?.message || 'Não foi possível carregar o certificado A3.'));
    } finally {
      setBusy(null);
    }
  }

  async function createRequest(document: DocumentRow, orgId: string, userId: string) {
    if (!supabase || !selectedClient) throw new Error('Cliente não selecionado.');
    const { data: request, error } = await supabase.from('signature_requests').insert({
      org_id: orgId,
      client_id: selectedClient.id,
      process_id: document.process_id || null,
      document_id: document.id,
      title: document.name,
      signer_name: selectedClient.name,
      signer_email: selectedClient.email || null,
      signer_phone: selectedClient.whatsapp || selectedClient.phone || null,
      provider: 'documenso',
      status: 'draft',
      verification_method: verificationMethod,
      verification_status: ['facial', 'facial_document', 'reinforced'].includes(verificationMethod) ? 'pending' : 'not_required',
      verification_provider: ['facial', 'facial_document', 'reinforced'].includes(verificationMethod) ? 'openbiometrics' : null,
      delivery_email: deliveryEmail,
      delivery_whatsapp: deliveryWhatsapp,
      expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      created_by: userId,
    }).select('id').single();
    if (error || !request) throw error || new Error('Não foi possível criar a solicitação.');

    const { error: signerError } = await supabase.from('signature_signers').insert({
      org_id: orgId,
      signature_request_id: request.id,
      name: selectedClient.name,
      email: selectedClient.email || null,
      phone: selectedClient.whatsapp || selectedClient.phone || null,
      signing_order: 1,
      status: 'pending',
    });
    if (signerError) {
      await supabase.from('signature_requests').delete().eq('id', request.id);
      throw signerError;
    }
    return request.id as string;
  }

  async function prepareAndSend() {
    if (!supabase || !selectedClient) return;
    const chosenExisting = existingDocumentIds.map((id) => documentMap.get(id)).filter(Boolean) as DocumentRow[];
    if (!localFiles.length && !chosenExisting.length) {
      setNotice('Adicione pelo menos um PDF.');
      return;
    }
    if (!selectedClient.email) {
      setNotice('O cliente precisa ter e-mail cadastrado para receber a assinatura.');
      return;
    }
    const selectedVerification = verificationOptions.find((item) => item.value === verificationMethod);
    if (selectedVerification?.biometric && !provider.biometrics.reachable) {
      setNotice('A biometria ainda não está disponível no modo cloud gratuito. Escolha outro método por enquanto.');
      return;
    }
    if (!provider.documenso.reachable) {
      setNotice('Conecte o Documenso Cloud com um API Token antes de enviar.');
      return;
    }

    setBusy('batch');
    setNotice('Preparando e enviando documentos...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada.');
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle();
      if (!profile?.org_id) throw new Error('Organização não identificada.');

      const preparedDocs: DocumentRow[] = [...chosenExisting];
      for (const file of localFiles) {
        if (file.type && file.type !== 'application/pdf') throw new Error(`${file.name} não é um PDF.`);
        const path = `${profile.org_id}/signatures/${selectedClient.id}/originais/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from('lexoffice-documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
        if (uploadError) throw uploadError;
        const { data: doc, error: docError } = await supabase.from('documents').insert({
          org_id: profile.org_id,
          client_id: selectedClient.id,
          name: file.name,
          file_path: path,
          mime_type: 'application/pdf',
          size_bytes: file.size,
          category: 'Documento para assinatura',
          notes: 'Enviado pela tela de Assinaturas',
          uploaded_by: user.id,
        }).select('id,name,file_path,client_id,process_id,mime_type,category,created_at').single();
        if (docError || !doc) throw docError || new Error('Não foi possível registrar o PDF.');
        preparedDocs.push(doc as DocumentRow);
      }

      const requestIds: string[] = [];
      for (const doc of preparedDocs) requestIds.push(await createRequest(doc, profile.org_id, user.id));

      const { data, error } = await supabase.functions.invoke('documenso-send-signature', { body: { signature_request_ids: requestIds, action: 'send' } });
      if (error) throw error;
      const failed = ((data as any)?.results || []).filter((item: any) => !item.ok);
      if (failed.length) throw new Error(failed.map((item: any) => item.error).join(' • '));

      setLocalFiles([]);
      setExistingDocumentIds([]);
      setNotice(`${requestIds.length} documento${requestIds.length === 1 ? '' : 's'} enviado${requestIds.length === 1 ? '' : 's'} ao cliente por e-mail${deliveryWhatsapp ? ' e WhatsApp' : ''}.`);
      await load(false);
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível enviar os documentos.');
    } finally {
      setBusy(null);
    }
  }

  async function remind(row: RequestRow) {
    if (!supabase) return;
    setBusy(`remind:${row.id}`);
    const { data, error } = await supabase.functions.invoke('documenso-send-signature', { body: { signature_request_ids: [row.id], action: 'remind' } });
    if (error) setNotice(error.message);
    else {
      const failed = ((data as any)?.results || []).find((item: any) => !item.ok);
      setNotice(failed?.error || `Lembrete enviado para ${row.signer_name || 'o cliente'}.`);
    }
    setBusy(null);
  }

  async function signIcpForRequest(row: RequestRow) {
    if (!supabase || !row.signed_document_id) return;
    const signedDoc = documentMap.get(row.signed_document_id);
    if (!signedDoc?.file_path) {
      setNotice('O PDF assinado ainda está sendo recebido. Atualize o painel em alguns segundos.');
      return;
    }
    if (!bridgeOnline) {
      setNotice('A ponte ICP-Brasil está offline.');
      return;
    }
    if (!certFingerprint) {
      await loadCertificates();
      return;
    }

    setBusy(`icp:${row.id}`);
    setNotice('Validando o documento com seu certificado ICP-Brasil...');
    try {
      const { data: pdf, error } = await supabase.storage.from('lexoffice-documents').download(signedDoc.file_path);
      if (error || !pdf) throw error || new Error('PDF assinado não encontrado.');
      const form = new FormData();
      form.append('file', pdf, `${row.title || 'documento'}.pdf`);
      form.append('certificateFingerprint', certFingerprint);
      form.append('visibleSeal', String(visibleSeal));
      form.append('sealText', 'Validado com certificado ICP-Brasil');
      const response = await fetch(`${BRIDGE}/sign/pades`, { method: 'POST', body: form });
      if (!response.ok) throw new Error((await response.text()) || 'A validação ICP-Brasil não foi concluída.');
      const blob = await response.blob();
      if (!blob.size) throw new Error('O arquivo validado retornou vazio.');

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user ? await supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle() : ({ data: null } as any);
      if (!profile?.org_id) throw new Error('Organização não identificada.');
      const path = `${profile.org_id}/signatures/${row.id}/final/${Date.now()}-${safeName(row.title || 'documento')}-validado-icpbr.pdf`;
      const { error: uploadError } = await supabase.storage.from('lexoffice-documents').upload(path, blob, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;
      const cert = certs.find((item) => item.fingerprint === certFingerprint);
      const { data: validatedDoc, error: insertError } = await supabase.from('documents').insert({
        org_id: profile.org_id,
        client_id: row.client_id || null,
        process_id: signedDoc.process_id || null,
        name: `${(row.title || 'Documento').replace(/\.pdf$/i, '')} — Validado ICP-Brasil.pdf`,
        file_path: path,
        mime_type: 'application/pdf',
        size_bytes: blob.size,
        category: 'Documento validado ICP-Brasil',
        notes: `PAdES ICP-Brasil • ${cert?.subject || 'certificado A3'} • ${new Date().toLocaleString('pt-BR')}`,
        uploaded_by: user?.id || null,
      }).select('id').single();
      if (insertError || !validatedDoc) throw insertError || new Error('Não foi possível registrar o documento final.');
      const now = new Date().toISOString();
      const { error: requestError } = await supabase.from('signature_requests').update({ icp_validated_document_id: validatedDoc.id, icp_validated_at: now, updated_at: now }).eq('id', row.id);
      if (requestError) throw requestError;
      setNotice('Documento validado com ICP-Brasil e pronto para download.');
      await load(false);
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível validar o documento.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadFinal(row: RequestRow) {
    if (!supabase || !row.icp_validated_document_id) return;
    const doc = documentMap.get(row.icp_validated_document_id);
    if (!doc?.file_path) return setNotice('Documento final não encontrado na biblioteca.');
    setBusy(`download:${row.id}`);
    try {
      const { data, error } = await supabase.storage.from('lexoffice-documents').download(doc.file_path);
      if (error || !data) throw error || new Error('Não foi possível baixar o PDF.');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name || 'documento-validado-icp-brasil.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível baixar o documento.');
    } finally {
      setBusy(null);
    }
  }

  const statusBadge = (row: RequestRow) => {
    const status = (row.status || 'draft').toLowerCase();
    if (row.icp_validated_document_id) return <span className="sig-badge validated"><CheckCircle2 size={12}/> Validado ICP</span>;
    if (status === 'signed' && row.signed_document_id) return <span className="sig-badge ready"><FileCheck2 size={12}/> Assinado</span>;
    if (status === 'signed') return <span className="sig-badge signed"><RefreshCw size={12}/> Recebendo PDF</span>;
    if (status === 'viewed') return <span className="sig-badge viewed"><Activity size={12}/> Visualizado</span>;
    if (status === 'sent') return <span className="sig-badge waiting"><Bell size={12}/> Aguardando cliente</span>;
    if (['declined', 'cancelled', 'expired'].includes(status)) return <span className="sig-badge error"><AlertTriangle size={12}/> {status}</span>;
    return <span className="sig-badge draft"><Activity size={12}/> Aguardando envio</span>;
  };

  return <>
    <div className="page-title signature-page-title">
      <div>
        <h1>Assinaturas</h1>
        <p>Envie documentos ao cliente, acompanhe a assinatura e valide o PDF final com ICP-Brasil.</p>
      </div>
      <div className="signature-top-actions">
        <span className={`provider-pill ${provider.documenso.reachable ? 'ok' : 'off'}`}><Send size={13}/> Documenso Cloud {provider.documenso.reachable ? 'online' : 'não conectado'}</span>
        <span className={`provider-pill ${bridgeOnline ? 'ok' : 'off'}`}>{bridgeOnline ? <Wifi size={13}/> : <WifiOff size={13}/>} A3 {bridgeOnline ? 'conectado' : 'offline'}</span>
        <button className="sig-btn ghost" onClick={() => checkBridge(true)} disabled={busy === 'bridge'}><RefreshCw size={14}/> Verificar A3</button>
      </div>
    </div>

    {notice && <div className="integration-notice signature-notice">{notice}</div>}

    {!provider.documenso.reachable && <section className="signature-workbench" style={{marginBottom:16}}>
      <div className="signature-section-head">
        <div><span className="eyebrow">CONEXÃO DE ASSINATURA</span><h2>Conectar Documenso Cloud</h2></div>
        <a className="sig-btn ghost" href="https://app.documenso.com" target="_blank" rel="noreferrer">Abrir Documenso</a>
      </div>
      <div className="signature-sendbar">
        <div style={{flex:1,minWidth:280}}>
          <input type="password" value={documensoToken} onChange={(e) => setDocumensoToken(e.target.value)} placeholder="Cole aqui o API Token do Documenso (api_...)" style={{width:'100%'}}/>
          <small style={{display:'block',marginTop:8}}>Crie uma conta gratuita no Documenso e gere o token em Settings → API Tokens. O token é salvo no backend seguro do LEXOFFICE e não fica no navegador.</small>
        </div>
        <button className="sig-btn primary" onClick={configureDocumenso} disabled={busy === 'documenso' || !documensoToken.trim()}><KeyRound size={15}/>{busy === 'documenso' ? 'Conectando...' : 'Conectar Cloud'}</button>
      </div>
    </section>}

    <div className="signature-kpis compact">
      <div><FileText size={17}/><span>Total</span><strong>{stats.total}</strong></div>
      <div className="pending"><Activity size={17}/><span>Aguardando envio</span><strong>{stats.draft}</strong></div>
      <div className="waiting"><Bell size={17}/><span>Aguardando cliente</span><strong>{stats.waiting}</strong></div>
      <div><FileCheck2 size={17}/><span>Prontos para ICP</span><strong>{stats.ready}</strong></div>
      <div className="done"><ShieldCheck size={17}/><span>Finalizados</span><strong>{stats.validated}</strong></div>
    </div>

    <section className="signature-workbench">
      <div className="signature-section-head">
        <div>
          <span className="eyebrow">NOVA SOLICITAÇÃO</span>
          <h2>Enviar documentos para assinatura</h2>
        </div>
        <span className="step-hint">1 Cliente → 2 PDFs → 3 Verificação → 4 Enviar</span>
      </div>

      <div className="signature-compose-grid">
        <label className="sig-field wide"><span><UserRound size={14}/> Cliente</span>
          <select value={selectedClientId} onChange={(e) => { setSelectedClientId(e.target.value); setExistingDocumentIds([]); }}>
            <option value="">Selecione o cliente</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
          {selectedClient && <small>{selectedClient.email || 'Sem e-mail'} • {selectedClient.whatsapp || selectedClient.phone || 'Sem WhatsApp'}</small>}
        </label>

        <label className="sig-field upload-field"><span><UploadCloud size={14}/> PDFs do computador</span>
          <input type="file" accept="application/pdf,.pdf" multiple onChange={(e) => setLocalFiles(Array.from(e.target.files || []))}/>
          <small>{localFiles.length ? `${localFiles.length} PDF${localFiles.length > 1 ? 's' : ''} selecionado${localFiles.length > 1 ? 's' : ''}` : 'Escolha um ou vários arquivos de uma vez'}</small>
        </label>

        <label className="sig-field"><span><Fingerprint size={14}/> Tipo de verificação</span>
          <select value={verificationMethod} onChange={(e) => setVerificationMethod(e.target.value)}>
            {verificationOptions.map((option) => <option key={option.value} value={option.value} disabled={option.biometric && !provider.biometrics.reachable}>{option.label}{option.biometric && !provider.biometrics.reachable ? ' — indisponível no modo gratuito' : ''}</option>)}
          </select>
          <small>{verificationOptions.find((item) => item.value === verificationMethod)?.detail}</small>
        </label>

        <label className="sig-field"><span>Prazo</span><input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}/><small>Opcional</small></label>
      </div>

      {selectedClientId && clientDocuments.length > 0 && <details className="library-picker">
        <summary>Usar também PDFs já salvos na pasta do cliente</summary>
        <div className="library-items">
          {clientDocuments.slice(0, 30).map((doc) => <label key={doc.id}><input type="checkbox" checked={existingDocumentIds.includes(doc.id)} onChange={(e) => setExistingDocumentIds((current) => e.target.checked ? [...current, doc.id] : current.filter((id) => id !== doc.id))}/><span>{doc.name}</span></label>)}
        </div>
      </details>}

      <div className="signature-sendbar">
        <div className="delivery-options">
          <label><input type="checkbox" checked={deliveryEmail} onChange={(e) => setDeliveryEmail(e.target.checked)}/> E-mail</label>
          <label><input type="checkbox" checked={deliveryWhatsapp} onChange={(e) => setDeliveryWhatsapp(e.target.checked)}/> WhatsApp</label>
          <span>{localFiles.length + existingDocumentIds.length} documento{localFiles.length + existingDocumentIds.length === 1 ? '' : 's'}</span>
        </div>
        <button className="sig-btn primary" onClick={prepareAndSend} disabled={busy === 'batch' || !selectedClientId || (!localFiles.length && !existingDocumentIds.length) || !provider.documenso.reachable}><Send size={16}/>{busy === 'batch' ? 'Enviando...' : 'Enviar para assinatura'}</button>
      </div>
      {!provider.documenso.reachable && <div className="provider-warning"><AlertTriangle size={15}/> Conecte o Documenso Cloud acima para liberar o envio. O plano gratuito permite até 5 documentos por mês.</div>}
    </section>

    <section className="signature-table-panel">
      <div className="signature-section-head table-head">
        <div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Documentos enviados</h2></div>
        <div className="table-actions">
          {bridgeOnline && <button className="sig-btn ghost" onClick={loadCertificates} disabled={busy === 'certificates'}><KeyRound size={14}/>{certFingerprint ? 'A3 carregado' : busy === 'certificates' ? 'Aguardando PIN...' : 'Carregar A3'}</button>}
          <label className="seal-toggle"><input type="checkbox" checked={visibleSeal} onChange={(e) => setVisibleSeal(e.target.checked)}/> selo visual</label>
          <button className="sig-btn ghost" onClick={() => load(true)} disabled={loading}><RefreshCw size={14}/> Atualizar</button>
        </div>
      </div>

      <div className="signature-table-wrap">
        <table className="signature-table">
          <thead><tr><th>Cliente</th><th>Documento</th><th>Verificação</th><th>Status</th><th>ICP-Brasil</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="empty-cell">Carregando...</td></tr> : dashboard.length === 0 ? <tr><td colSpan={6} className="empty-cell">Nenhum documento em acompanhamento.</td></tr> : dashboard.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.clientName}</strong></td>
                <td><span className="doc-title">{row.title || 'Documento'}</span><small>{row.sent_at ? `Enviado ${new Date(row.sent_at).toLocaleDateString('pt-BR')}` : 'Ainda não enviado'}</small></td>
                <td><span className="verification-chip">{verificationLabel(row.verification_method)}</span></td>
                <td>{statusBadge(row)}</td>
                <td>{row.icp_validated_document_id ? <span className="sig-badge validated"><ShieldCheck size={12}/> Selo aplicado</span> : row.signed_document_id ? <span className="sig-badge ready">Pronto para validar</span> : <span className="muted-cell">—</span>}</td>
                <td><div className="row-actions">
                  {isWaiting(row.status) && <button className="sig-btn mini" onClick={() => remind(row)} disabled={busy === `remind:${row.id}`}><Bell size={13}/> Lembrar</button>}
                  {isSigned(row.status) && row.signed_document_id && !row.icp_validated_document_id && <button className="sig-btn mini primary" onClick={() => signIcpForRequest(row)} disabled={busy === `icp:${row.id}` || !bridgeOnline}><ShieldCheck size={13}/>{busy === `icp:${row.id}` ? 'Validando...' : 'Validar ICP'}</button>}
                  {row.icp_validated_document_id && <button className="sig-btn mini" onClick={() => downloadFinal(row)} disabled={busy === `download:${row.id}`}><Download size={13}/> Baixar PDF</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}

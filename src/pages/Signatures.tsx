import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
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
  expires_at?: string | null;
  document_id?: string | null;
  client_id?: string | null;
  signer_name?: string | null;
  signer_phone?: string | null;
  created_at?: string | null;
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
const signed = (status?: string | null) => ['signed', 'completed', 'approved'].includes((status || '').toLowerCase());
const sent = (status?: string | null) => ['sent', 'pending', 'waiting', 'awaiting_signature'].includes((status || '').toLowerCase());

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

  const [icpDocumentId, setIcpDocumentId] = useState('');
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [bridgeChecked, setBridgeChecked] = useState(false);
  const [certs, setCerts] = useState<LocalCert[]>([]);
  const [certFingerprint, setCertFingerprint] = useState('');
  const [visibleSeal, setVisibleSeal] = useState(true);

  const selectedRequestDoc = useMemo(
    () => documents.find((d) => d.id === requestDocumentId) || null,
    [documents, requestDocumentId],
  );
  const selectedIcpDoc = useMemo(
    () => documents.find((d) => d.id === icpDocumentId) || null,
    [documents, icpDocumentId],
  );

  const dashboard = useMemo(
    () => rows.map((row) => {
      const client = clients.find((item) => item.id === row.client_id);
      return {
        ...row,
        clientName: client?.name || row.signer_name || 'Cliente',
        phone: client?.phone || row.signer_phone || '',
        stage: signed(row.status) ? 'green' : sent(row.status) ? 'red' : 'orange',
      };
    }),
    [rows, clients],
  );

  const stats = useMemo(() => ({
    total: dashboard.length,
    draft: dashboard.filter((r) => r.stage === 'orange').length,
    waiting: dashboard.filter((r) => r.stage === 'red').length,
    done: dashboard.filter((r) => r.stage === 'green').length,
  }), [dashboard]);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    setNotice('');
    const [{ data, error }, { data: docs }, { data: cls }, { data: cfg, error: cfgError }] = await Promise.all([
      supabase.from('signature_requests').select('id,title,status,external_id,sent_at,expires_at,document_id,client_id,signer_name,signer_phone,created_at').order('created_at', { ascending: false }),
      supabase.from('documents').select('id,name,file_path,client_id,process_id,mime_type,created_at').eq('mime_type', 'application/pdf').order('created_at', { ascending: false }).limit(1000),
      supabase.from('clients').select('id,name,email,phone,cpf_cnpj').order('name').limit(1500),
      supabase.functions.invoke('zapsign-configure', { body: { action: 'status' } }),
    ]);

    if (error) setNotice(error.message);
    else setRows((data || []) as RequestRow[]);
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
    checkBridge();
  }, []);

  useEffect(() => {
    if (!selectedRequestDoc?.client_id) return;
    const client = clients.find((item) => item.id === selectedRequestDoc.client_id);
    if (!client) return;
    setSignerName(client.name || '');
    setSignerEmail(client.email || '');
    setSignerPhone(client.phone || '');
  }, [selectedRequestDoc, clients]);

  async function checkBridge() {
    setBusy('bridge');
    setBridgeChecked(false);
    try {
      const response = await fetch(`${BRIDGE}/health`, { signal: AbortSignal.timeout(2200) });
      if (!response.ok) throw new Error('Ponte indisponível');
      setBridgeOnline(true);

      const certResponse = await fetch(`${BRIDGE}/certificates`, { signal: AbortSignal.timeout(3500) });
      if (certResponse.ok) {
        const json = await certResponse.json();
        const list = (Array.isArray(json) ? json : (json.certificates || [])) as LocalCert[];
        setCerts(list);
        setCertFingerprint((current) => current || list[0]?.fingerprint || '');
      }
    } catch {
      setBridgeOnline(false);
      setCerts([]);
      setCertFingerprint('');
    } finally {
      setBridgeChecked(true);
      setBusy(null);
    }
  }

  async function saveConfig() {
    if (!supabase || !token.trim()) return;
    setBusy('config');
    const { data, error } = await supabase.functions.invoke('zapsign-configure', {
      body: { account_email: accountEmail.trim(), token: token.trim() },
    });
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
    if (!user) {
      setBusy(null);
      setNotice('Sessão expirada.');
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle();
    if (!profile?.org_id) {
      setBusy(null);
      setNotice('Organização não identificada.');
      return;
    }

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

    if (error || !request) {
      setBusy(null);
      setNotice(error?.message || 'Não foi possível criar a solicitação.');
      return;
    }

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
    else {
      setNotice('Documento enviado para assinatura.');
      await load();
    }
    setBusy(null);
  }

  async function remind(row: RequestRow) {
    if (!supabase) return;
    setBusy(`remind:${row.id}`);
    const { data, error } = await supabase.functions.invoke('zapsign-send-signature', {
      body: { signature_request_id: row.id, resend: true, reminder: true },
    });
    if (error) setNotice(error.message);
    else if ((data as any)?.error) setNotice((data as any).error);
    else setNotice(`Cobrança de assinatura enviada para ${row.signer_name || 'o cliente'}.`);
    setBusy(null);
  }

  async function signIcp() {
    if (!supabase || !selectedIcpDoc?.file_path || !certFingerprint) return;
    setBusy('icp');
    setNotice('');
    try {
      if (!bridgeOnline) throw new Error('A ponte ICP-Brasil local não está ativa neste computador.');

      const { data: pdf, error } = await supabase.storage.from('lexoffice-documents').download(selectedIcpDoc.file_path);
      if (error || !pdf) throw error || new Error('PDF não encontrado.');

      const form = new FormData();
      form.append('file', pdf, selectedIcpDoc.name.replace(/\.[^.]+$/, '') + '.pdf');
      form.append('certificateFingerprint', certFingerprint);
      form.append('visibleSeal', String(visibleSeal));
      form.append('sealText', 'Certificado ICP-Brasil');

      const response = await fetch(`${BRIDGE}/sign/pades`, { method: 'POST', body: form });
      if (!response.ok) throw new Error((await response.text()) || 'A assinatura local não foi concluída.');

      const blob = await response.blob();
      if (!blob.size) throw new Error('O arquivo assinado retornou vazio.');

      const path = selectedIcpDoc.file_path.replace(/\.pdf$/i, '') + `-assinado-icpbr-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from('lexoffice-documents').upload(path, blob, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle()
        : ({ data: null } as any);
      if (!profile?.org_id) throw new Error('Organização não identificada para registrar o PDF assinado.');

      const cert = certs.find((item) => item.fingerprint === certFingerprint);
      const { error: insertError } = await supabase.from('documents').insert({
        org_id: profile.org_id,
        client_id: selectedIcpDoc.client_id || null,
        process_id: selectedIcpDoc.process_id || null,
        name: selectedIcpDoc.name.replace(/\.pdf$/i, '') + ' — Assinado ICP-Brasil.pdf',
        file_path: path,
        mime_type: 'application/pdf',
        category: 'Documento assinado',
        notes: `PAdES ICP-Brasil • ${cert?.issuer || 'certificado local'} • ${new Date().toLocaleString('pt-BR')}`,
        uploaded_by: user?.id || null,
      });
      if (insertError) throw insertError;

      setNotice('PDF assinado com ICP-Brasil e salvo na biblioteca do LEXOFFICE.');
      await load();
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível assinar com ICP-Brasil.');
    } finally {
      setBusy(null);
    }
  }

  return <>
    <div className="page-title">
      <h1>Assinaturas</h1>
      <p>Assinatura eletrônica, acompanhamento de clientes e certificado ICP-Brasil A3 em um único painel.</p>
    </div>

    {notice && <div className="integration-notice">{notice}</div>}

    <div className="signature-kpis">
      <div><FileText size={18}/><span>Total</span><strong>{stats.total}</strong></div>
      <div className="pending"><Activity size={18}/><span>Aguardando envio</span><strong>{stats.draft}</strong></div>
      <div className="waiting"><Bell size={18}/><span>Aguardando cliente</span><strong>{stats.waiting}</strong></div>
      <div className="done"><CheckCircle2 size={18}/><span>Concluídas</span><strong>{stats.done}</strong></div>
    </div>

    <div className={`icp-bridge-panel ${bridgeOnline ? 'online' : 'offline'}`}>
      <div className="icp-bridge-main">
        <div className="icp-bridge-icon">{bridgeOnline ? <Wifi size={25}/> : <WifiOff size={25}/>}</div>
        <div>
          <span className="eyebrow">PONTE LOCAL ICP-BRASIL</span>
          <h2>{bridgeOnline ? 'Ponte conectada e pronta' : 'Ponte não detectada neste computador'}</h2>
          <p>{bridgeOnline
            ? `${certs.length} certificado${certs.length === 1 ? '' : 's'} disponível${certs.length === 1 ? '' : 'is'}. O PIN e a chave privada continuam somente no token.`
            : 'Conecte o token A3, execute o arquivo iniciar-lexoffice-icpbr.bat e depois clique em Verificar ponte.'}</p>
        </div>
      </div>
      <div className="icp-bridge-actions">
        <span className={`bridge-badge ${bridgeOnline ? 'ok' : 'off'}`}>
          {bridgeOnline ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>}
          {busy === 'bridge' ? 'Verificando...' : bridgeOnline ? 'Online' : bridgeChecked ? 'Offline' : 'Verificando'}
        </span>
        <button className="integration-action" type="button" onClick={checkBridge} disabled={busy === 'bridge'}>
          <RefreshCw size={15}/> Verificar ponte
        </button>
      </div>
    </div>

    <div className="integration-panel">
      <h3><ShieldCheck size={18}/> Assinar agora com ICP-Brasil A3</h3>
      <p className="panel-description">Selecione o PDF e o certificado encontrado no token. A assinatura PAdES é feita localmente pela ponte e o documento assinado volta para a biblioteca do LEXOFFICE.</p>
      <div className="integration-form">
        <label><FileText size={14}/> Documento PDF
          <select value={icpDocumentId} onChange={(e) => setIcpDocumentId(e.target.value)}>
            <option value="">Selecione um documento</option>
            {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
          </select>
        </label>
        <label><Usb size={14}/> Certificado A3
          <select value={certFingerprint} onChange={(e) => setCertFingerprint(e.target.value)} disabled={!bridgeOnline}>
            <option value="">{bridgeOnline ? 'Selecione' : 'Inicie a ponte primeiro'}</option>
            {certs.map((cert) => <option key={cert.fingerprint} value={cert.fingerprint}>{cert.subject} • {cert.issuer}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={visibleSeal} onChange={(e) => setVisibleSeal(e.target.checked)}/> Mostrar selo visual ICP-Brasil no PDF</label>
        <button className="integration-action icp-sign-button" onClick={signIcp} disabled={busy === 'icp' || !icpDocumentId || !bridgeOnline || !certFingerprint}>
          <ShieldCheck size={16}/>{busy === 'icp' ? 'Assinando...' : 'Assinar PDF com ICP-Brasil'}
        </button>
      </div>
    </div>

    <div className="integration-panel">
      <h3>Painel de acompanhamento</h3>
      <div className="signature-legend">
        <span className="orange">● Aguardando envio</span>
        <span className="red">● Cliente ainda não assinou</span>
        <span className="green">● Assinatura concluída</span>
      </div>
      {loading ? <p>Carregando...</p> : dashboard.length === 0 ? <p>Nenhuma assinatura em acompanhamento.</p> : (
        <div className="signature-list">
          {dashboard.map((row) => <div className={`signature-row signature-stage-${row.stage}`} key={row.id}>
            <div>
              <strong>{row.clientName}</strong>
              <small>{row.title || 'Documento'} • {row.stage === 'green' ? 'Assinatura concluída' : row.stage === 'red' ? 'Aguardando assinatura do cliente' : 'Pendente de envio'}</small>
            </div>
            <div className="signature-actions">
              {row.stage === 'orange' && <button className="integration-action" disabled={!configured || busy === row.id} onClick={() => send(row.id)}><Send size={15}/>Enviar</button>}
              {row.stage === 'red' && <button className="integration-action" disabled={busy === `remind:${row.id}`} onClick={() => remind(row)}><Bell size={15}/>{busy === `remind:${row.id}` ? 'Enviando...' : 'Cobrar assinatura'}</button>}
              {row.stage === 'green' && <span className="signature-done"><CheckCircle2 size={14}/> Concluída</span>}
            </div>
          </div>)}
        </div>
      )}
    </div>

    <div className="integration-panel">
      <h3><Plus size={17}/> Nova assinatura do cliente</h3>
      <div className="integration-form">
        <label>Documento
          <select value={requestDocumentId} onChange={(e) => setRequestDocumentId(e.target.value)}>
            <option value="">Selecione</option>
            {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
          </select>
        </label>
        <label><UserRound size={14}/> Signatário<input value={signerName} onChange={(e) => setSignerName(e.target.value)}/></label>
        <label>E-mail<input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)}/></label>
        <label>WhatsApp<input value={signerPhone} onChange={(e) => setSignerPhone(e.target.value)}/></label>
        <label>Prazo<input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}/></label>
        <button className="integration-action" onClick={addRequest} disabled={busy === 'add' || !requestDocumentId || !signerName.trim()}><PenTool size={16}/>Adicionar para assinatura</button>
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

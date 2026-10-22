import {Link,useSearchParams} from 'react-router-dom';
import ClientAppInbox from '../components/ClientAppInbox';
import ClientAppDialog from '../components/ClientAppDialog';
import {useConfirmNavigation} from '../lib/useConfirmNavigation';
import './client-app-workspace.css';
import InternalNavigation from '../components/InternalNavigation';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  FileText,
  MessageSquarePlus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Send,
  CalendarClock,
  ShieldCheck,
  Eye,
  MoreHorizontal,
  Plus,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import "./integrations.css";
type Client = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cpf_cnpj?: string | null;
};
export default function ClientArea() {
  const [failedNotice, setFailedNotice] = useState<{
      phone: string;
      name: string;
      message: string;
    } | null>(null),
    [retryBusy, setRetryBusy] = useState(false);
  const [params,setParams]=useSearchParams();
  const section=params.get('secao');
  const sec=(['acessos','recados','recebidos','documentos'].includes(section||'')?section:'recebidos') as 'acessos'|'recados'|'recebidos'|'documentos';
  const setSec=(value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('secao',value);return next;});
  const [composeOpen,setComposeOpen]=useState(false),[publishOpen,setPublishOpen]=useState(false),[extraOpen,setExtraOpen]=useState(false);
  const [loadBusy,setLoadBusy]=useState(true),[loadError,setLoadError]=useState(''),[failedSections,setFailedSections]=useState<string[]>([]);
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const loadRequest=useRef(0);
  const [clients, setClients] = useState<Client[]>([]),
    [messages, setMessages] = useState<any[]>([]),
    [inbox, setInbox] = useState<any[]>([]),
    [clientId, setClientId] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [category, setCategory] = useState("informativo"),
    [priority, setPriority] = useState("normal"),
    [ack, setAck] = useState(false),
    [orgId, setOrgId] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [access, setAccess] = useState<any>(null),
    [accessBusy, setAccessBusy] = useState(false),
    [activeInbox, setActiveInbox] = useState<any>(null),
    [reply, setReply] = useState(""),
    [aiBusy, setAiBusy] = useState(false),
    [extra, setExtra] = useState<any[]>([]),
    [docReq, setDocReq] = useState<any[]>([]),
    [docTitle, setDocTitle] = useState(""),
    [docAuth, setDocAuth] = useState(false),
    [docReminder, setDocReminder] = useState(false),
    [docFile, setDocFile] = useState<File | null>(null),
    [appClients, setAppClients] = useState<any[]>([]),
    [previewClient, setPreviewClient] = useState<any | null>(null),
    [previewData, setPreviewData] = useState<any>({
      messages: [],
      docs: [],
      processes: [],
      timeline: [],
      finance: [],
    }),
    [previewBusy, setPreviewBusy] = useState(false);
  useEffect(() => {
    if (!orgId) return;
    try {
      const saved = localStorage.getItem("lexoffice-pending-whatsapp-" + orgId);
      if (saved) {
        const item = JSON.parse(saved);
        if (item?.phone && item?.message && item?.name) setFailedNotice(item);
      }
    } catch {}
  }, [orgId]);
  async function load() {
    const run=++loadRequest.current;
    setLoadBusy(true);setLoadError('');
    try{
    if (!supabase) throw new Error('Serviço de dados indisponível.');
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Acesso não autenticado.');
    const { data: p } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();
    if (!p?.org_id) throw new Error('Escritório não identificado.');
    setOrgId(p.org_id);
    const [{ data: c,error:ce }, { data: m,error:me }, { data: i,error:ie }, { data: x,error:xe }, { data: d,error:de }] =
      await Promise.all([
        supabase
          .from("clients")
          .select("id,name,email,phone,whatsapp,cpf_cnpj")
          .eq("org_id", p.org_id)
          .eq("status", "active")
          .order("name"),
        supabase
          .from("client_office_messages")
          .select(
            "id,client_id,title,category,priority,sent_at,read_at,acknowledged_at,source_channel,clients(name)",
          )
          .eq("org_id", p.org_id)
          .order("sent_at", { ascending: false })
          .limit(100),
        supabase
          .from("client_app_inbox")
          .select(
            "id,client_id,kind,subject,body,created_at,read_at,document_id,clients(name)",
          )
          .eq("org_id", p.org_id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("client_extraordinary_requests")
          .select(
            "id,client_id,fee,fee_rule,message,status,receipt_path,requested_at,clients(name)",
          )
          .eq("org_id", p.org_id)
          .order("requested_at", { ascending: false })
          .limit(50),
        supabase
          .from("client_document_requests")
          .select(
            "id,client_id,title,status,requires_authorization,authorization_status,reminder_enabled,created_at,clients(name)",
          )
          .eq("org_id", p.org_id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
    if(run!==loadRequest.current)return;
    const failed=[ce&&'clients',me&&'messages',ie&&'inbox',xe&&'extra',de&&'documents'].filter(Boolean) as string[];
    setClients(c || []);
    setMessages(m || []);
    setInbox(i || []);
    setExtra(x || []);
    setDocReq(d || []);
    const ids = (c || []).map((v: any) => v.id);
    if (ids.length) {
      const [{ data: aa,error:ae }, { data: pp,error:pe }, { data: tt,error:te }] = await Promise.all([
        supabase
          .from("client_app_access")
          .select("client_id,status,updated_at,installed_at")
          .in("client_id", ids),
        supabase
          .from("processes")
          .select("id,client_id,cnj_number,subject,updated_at")
          .in("client_id", ids)
          .order("updated_at", { ascending: false }),
        supabase
          .from("client_process_timeline")
          .select(
            "client_id,process_id,phase_label,status,last_movement_at,updated_at",
          )
          .in("client_id", ids)
          .order("updated_at", { ascending: false }),
      ]);
      if(run!==loadRequest.current)return;
      if(ae||pe||te)failed.push('access');
      setAppClients(
        (c || []).map((cl: any) => ({
          client: cl,
          access: (aa || []).find((a: any) => a.client_id === cl.id),
          process: (pp || []).find((p: any) => p.client_id === cl.id),
          phase:
            (tt || []).find(
              (t: any) => t.client_id === cl.id && t.status === "current",
            ) || (tt || []).find((t: any) => t.client_id === cl.id),
        })),
      );
    } else setAppClients([]);
    setFailedSections(failed);
    const labels:Record<string,string>={clients:'clientes',messages:'recados enviados',inbox:'mensagens recebidas',extra:'pedidos extraordinários',documents:'documentos e autorizações',access:'controle do aplicativo'};
    setLoadError(failed.length?'Não foi possível consultar: '+failed.map(key=>labels[key]).join(', ')+'. Tente atualizar.':'');
    }catch(error){if(run===loadRequest.current){setFailedSections(['clients','messages','inbox','extra','documents','access']);setLoadError(error instanceof Error?error.message:'Não foi possível consultar o aplicativo.');}}
    finally{if(run===loadRequest.current)setLoadBusy(false);}
  }
  useEffect(() => {
    void load();
    return()=>{loadRequest.current++;};
  }, []);
  const updateReply=(value:string)=>{setReply(value);if(activeInbox)setDrafts(previous=>({...previous,[activeInbox.id]:value}));};
  useConfirmNavigation(!!title.trim()||!!body.trim()||!!docTitle.trim()||!!docFile||Object.values(drafts).some(value=>value.trim()));
  async function openInboxMessage(item:any){
    if(!supabase||busy||aiBusy)return;
    setActiveInbox(item);setReply(drafts[item.id]||'');setNotice('');
    if(!item.read_at){
      try{
        const readAt=new Date().toISOString();
        const result=await supabase.from('client_app_inbox').update({read_at:readAt}).eq('id',item.id).eq('org_id',orgId).select('id');
        if(result.error||!result.data?.length)throw new Error('Não foi possível registrar a leitura. Atualize para tentar novamente.');
        setInbox(previous=>previous.map(row=>row.id===item.id?{...row,read_at:readAt}:row));
        setActiveInbox((current:any)=>current?.id===item.id?{...current,read_at:readAt}:current);
      }catch(error){setNotice(error instanceof Error?error.message:'Não foi possível registrar a leitura.');}
    }
  }
  async function publishDocument() {
    if (!supabase || !clientId || !docTitle.trim() || !docFile) {
      setNotice("Selecione o cliente, informe o título e escolha o documento.");
      return;
    }
    if (docFile.size > 50 * 1024 * 1024) {
      setNotice("O arquivo excede o limite de 50 MB.");
      return;
    }
    setBusy(true);
    setNotice("Enviando documento para o App...");
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user)
        throw new Error("Sessão inválida. Entre novamente na LexOffice.");
      const safe = docFile.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = clientId + "/" + Date.now() + "-" + safe;
      const up = await supabase.storage
        .from("client-documents")
        .upload(path, docFile, {
          upsert: false,
          contentType: docFile.type || undefined,
        });
      if (up.error) throw new Error("Falha no upload: " + up.error.message);
      const ins = await supabase
        .from("documents")
        .insert({
          org_id: orgId,
          client_id: clientId,
          name: docFile.name,
          file_path: path,
          mime_type: docFile.type || null,
          size_bytes: docFile.size,
          category: "client_portal",
          uploaded_by: user.id,
          owner_user_id: user.id,
        })
        .select("id")
        .single();
      if (ins.error) {
        await supabase.storage.from("client-documents").remove([path]);
        throw new Error("Falha ao registrar o documento: " + ins.error.message);
      }
      const req = await supabase
        .from("client_document_requests")
        .insert({
          org_id: orgId,
          client_id: clientId,
          title: docTitle.trim(),
          description: "Documento disponibilizado pelo escritório.",
          status: "available",
          document_id: ins.data.id,
          requested_by: user.id,
          requires_authorization: docAuth,
          authorization_status: docAuth ? "pending" : "not_required",
          reminder_enabled: docAuth && docReminder,
        })
        .select("id")
        .single();
      if (req.error)
        throw new Error("Falha ao disponibilizar no App: " + req.error.message);
      const c = clients.find((x) => x.id === clientId);
      const phone = (c?.whatsapp || c?.phone || "").replace(/\D/g, "");
      let aviso = "";
      if (phone) {
        const number = phone.startsWith("55") ? phone : "55" + phone;
        const sent = await supabase.functions.invoke("whatsapp-operator-send", {
          body: {
            message: `Olá, ${String(c?.name || "cliente").split(/\s+/)[0]}. Você recebeu um novo documento no App do Cliente: “${docTitle.trim()}”. Acesse pelo link oficial: https://lexoffice.univittagroup.com.br/cliente\n\nO documento também segue anexado nesta mensagem.`,
            document_ids: [ins.data.id],
            targets: [{ phone: number, name: c?.name }],
            agent_key: "client_schedule_relationship",
            next_agent_key: "client_schedule_relationship",
            keep_ai_active: true,
            mirror_to_app: false,
          },
        });
        if (
          sent.error ||
          !sent.data?.ok ||
          Number(sent.data?.failed || 0) > 0
        ) {
          const reason =
            sent.data?.results?.[0]?.error ||
            sent.data?.error ||
            sent.error?.message ||
            "o provedor não confirmou o envio";
          aviso = ` O documento foi publicado no App, mas o arquivo não foi enviado pelo WhatsApp: ${reason}.`;
        }
      } else
        aviso =
          " O documento foi publicado no App, mas o cliente não possui WhatsApp cadastrado.";
      setPublishOpen(false);
      setDocTitle("");
      setDocFile(null);
      setDocAuth(false);
      setDocReminder(false);
      setNotice(
        aviso ||
          "Documento disponibilizado no App e enviado como arquivo pelo WhatsApp.",
      );
      await load();
    } catch (e: any) {
      setNotice(e?.message || "Não foi possível disponibilizar o documento.");
    } finally {
      setBusy(false);
    }
  }
  async function sendWhatsappNotice(payload: {
    phone: string;
    name: string;
    message: string;
  }) {
    const { data, error } = await supabase.functions.invoke(
      "whatsapp-operator-send",
      {
        body: {
          message: payload.message,
          targets: [{ phone: payload.phone, name: payload.name }],
          agent_key: "client_schedule_relationship",
          next_agent_key: "client_schedule_relationship",
          keep_ai_active: true,
          mirror_to_app: false,
        },
      },
    ).catch(error => ({ data: null, error }));
    if (error || !data?.ok || Number(data?.failed || 0)>0) {
      setFailedNotice(payload);
      if (orgId)
        localStorage.setItem(
          "lexoffice-pending-whatsapp-" + orgId,
          JSON.stringify(payload),
        );
      setNotice(
        "O conteúdo está salvo no aplicativo, mas o aviso por WhatsApp falhou. Clique em Reenviar aviso.",
      );
      return false;
    }
    setFailedNotice(null);
    if (orgId) localStorage.removeItem("lexoffice-pending-whatsapp-" + orgId);
    return true;
  }
  async function retryWhatsappNotice() {
    if (!failedNotice || retryBusy) return;
    setRetryBusy(true);
    try {
      if (await sendWhatsappNotice(failedNotice))
        setNotice("Aviso reenviado com sucesso.");
    } catch (e: any) {
      setNotice(
        "Não foi possível reenviar: " + (e?.message || "erro de conexão"),
      );
    } finally {
      setRetryBusy(false);
    }
  }
  async function sendReply(){
    if(!supabase||!activeInbox||!reply.trim()||busy||aiBusy)return;
    const item=activeInbox,text=reply.trim();setBusy(true);setNotice('Publicando resposta no aplicativo…');
    try{
      const {data:{user},error:userError}=await supabase.auth.getUser();
      if(userError||!user)throw new Error('Sessão inválida. Entre novamente.');
      const result=await supabase.from('client_office_messages').insert({org_id:orgId,client_id:item.client_id,title:'Resposta do escritório',body:text,category:'atendimento',priority:'normal',requires_ack:false,sent_by:user.id,source_channel:'manual_app',metadata:{reply_to:item.id,author:user.id,manual:true}}).select('id').single();
      if(result.error||!result.data?.id)throw new Error(result.error?.message||'A publicação não foi confirmada pelo aplicativo.');
      setReply('');setDrafts(previous=>{const next={...previous};delete next[item.id];return next;});
      setNotice('Resposta publicada no aplicativo.');
      const client=clients.find(row=>row.id===item.client_id);
      const phone=String(client?.whatsapp||client?.phone||'').replace(/\D/g,'');
      if(phone){
        const sent=await sendWhatsappNotice({phone:phone.startsWith('55')?phone:'55'+phone,name:client?.name||'Cliente',message:'Você recebeu uma resposta do escritório na Área do Cliente da Suzanne Figueiredo Advocacia. Acesse: https://lexoffice.univittagroup.com.br/cliente'});
        if(sent)setNotice('Resposta publicada no aplicativo. Aviso por WhatsApp confirmado pelo serviço de envio.');
      }else setNotice('Resposta publicada no aplicativo. Sem aviso por WhatsApp: cliente sem telefone cadastrado.');
      await load();
    }catch(error){setNotice(error instanceof Error?error.message:'Não foi possível publicar a resposta. Seu rascunho foi preservado.');}
    finally{setBusy(false);}
  }
  async function suggestReply(){
    if(!supabase||!activeInbox||aiBusy||busy)return;
    const id=activeInbox.id;setAiBusy(true);setNotice('');
    try{
      const result=await supabase.functions.invoke('ai-provider-gateway',{body:{org_id:orgId,provider:'auto',instructions:'Você auxilia a Dra. Suzanne Figueiredo. Gere apenas uma sugestão revisável. Nunca envie automaticamente.',input:'Redija somente uma sugestão curta, elegante e profissional de resposta para este cliente. Não invente fatos, prazos, decisões ou providências. Mensagem do cliente: '+(activeInbox.body||activeInbox.subject||'')}});
      if(result.error||!result.data?.ok||!result.data?.text)throw new Error('A IA não conseguiu gerar a sugestão agora.');
      const text=String(result.data.text);setDrafts(previous=>({...previous,[id]:text}));setReply(text);
    }catch(error){setNotice(error instanceof Error?error.message:'Não foi possível gerar a sugestão.');}
    finally{setAiBusy(false);}
  }
  async function confirmExtra(id: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc(
      "staff_confirm_extraordinary_request",
      { p_request_id: id },
    );
    if (error) return setNotice(error.message);
    setNotice("Atendimento extraordinário confirmado.");
    load();
  }
  async function toggleReminder(r: any) {
    if (!supabase) return;
    const { error } = await supabase
      .from("client_document_requests")
      .update({
        reminder_enabled: !r.reminder_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id)
      .eq("org_id", orgId);
    if (error) return setNotice(error.message);
    load();
  }
  async function send() {
    if (!supabase || !clientId || !title.trim() || !body.trim())
      return setNotice("Selecione o cliente e preencha título e mensagem.");
    if (busy) return;
    setBusy(true);
    setNotice("Publicando recado...");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("client_office_messages")
        .insert({
          org_id: orgId,
          client_id: clientId,
          title: title.trim(),
          body: body.trim(),
          category,
          priority,
          requires_ack: ack,
          sent_by: user?.id,
          source_channel: "manual_app",
          metadata: { author: user?.id, manual: true },
        });
      if (error) throw error;
      const c = clients.find((x) => x.id === clientId);
      setTitle("");
      setBody("");
      setAck(false);
      setNotice(
        "Recado publicado. O formulário já está liberado para o próximo envio.",
      );
      const phone = (c?.whatsapp || c?.phone || "").replace(/\D/g, "");
      if (phone) {
        const number = phone.startsWith("55") ? phone : "55" + phone;
        void sendWhatsappNotice({
          phone: number,
          name: c?.name || "Cliente",
          message:
            "Você recebeu um novo recado na Área do Cliente da Suzanne Figueiredo Advocacia. Acesse: https://lexoffice.univittagroup.com.br/cliente",
        });
      }
      void load();
    } catch (e: any) {
      setNotice(
        "Não foi possível publicar: " + (e?.message || "erro desconhecido"),
      );
    } finally {
      setBusy(false);
    }
  }
  const selected = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  );
  useEffect(() => {
    if (!supabase || !clientId) {
      setAccess(null);
      return;
    }
    supabase
      .from("client_app_access")
      .select("login_cpf,access_code,status,activated_at,revoked_at")
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data }) => setAccess(data || null));
  }, [clientId]);





  async function previewFromControl(item: any) {
    if (!supabase) return;
    const cl = item.client;
    setPreviewClient(item);
    setPreviewBusy(true);
    const [{ data: msg }, { data: docs }, { data: proc }, { data: fin }] =
      await Promise.all([
        supabase
          .from("client_office_messages")
          .select("id,title,body,category,created_at")
          .eq("client_id", cl.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("client_documents")
          .select(
            "id,title,created_at,requires_authorization,authorization_status",
          )
          .eq("client_id", cl.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("processes")
          .select("id,cnj_number,subject,status")
          .eq("client_id", cl.id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("fee_contracts")
          .select("id,title,total_amount,status,payment_model")
          .eq("client_id", cl.id)
          .order("created_at", { ascending: false }),
      ]);
    const ids = (proc || []).map((p: any) => p.id);
    let tl: any[] = [];
    if (ids.length) {
      const q = await supabase
        .from("client_process_timeline")
        .select("id,process_id,phase_label,status,summary,last_movement_at")
        .in("process_id", ids)
        .order("phase_order", { ascending: true });
      tl = q.data || [];
    }
    setPreviewData({
      messages: msg || [],
      docs: docs || [],
      processes: proc || [],
      timeline: tl,
      finance: fin || [],
    });
    setPreviewBusy(false);
  }
  const unread=inbox.filter(item=>!item.read_at).length;
  const authorizationCount=docReq.filter(item=>item.requires_authorization&&item.authorization_status==='pending').length;
  const extraordinaryCount=extra.filter(item=>item.status!=='confirmed').length;
  const counter=(section:string,value:number)=>loadBusy||failedSections.includes(section)?'—':String(value);
  const selectedMessage=activeInbox?(inbox.find(item=>item.id===activeInbox.id)||activeInbox):null;
  return <div className="client-app-workspace">
    <header className="app-message-heading"><div><h1>Mensagens do aplicativo</h1><p>Receba, organize e responda aos clientes em um só lugar.</p></div><div className="app-message-actions"><button className="app-message-button" disabled={loadBusy||busy||aiBusy} onClick={()=>void load()}><RefreshCw size={16}/>{loadBusy?'Atualizando…':'Atualizar'}</button><button className="app-message-button app-message-primary" disabled={busy||aiBusy} onClick={()=>setComposeOpen(true)}><Plus size={17}/>Novo recado</button><details className="app-message-more"><summary className="app-message-icon-button" aria-label="Mais ações"><MoreHorizontal size={20}/></summary><div><button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');setPublishOpen(true);}} disabled={busy}>Enviar documento</button><button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');setExtraOpen(true);}} disabled={busy}>Pedidos extraordinários</button><button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');setSec('acessos');}} disabled={busy}>Controle do aplicativo</button></div></details></div></header>
    <div className="app-message-counters"><button disabled={busy||aiBusy} onClick={()=>setSec('recebidos')}><Bell size={16}/>{counter('inbox',unread)} não lidas</button><button disabled={busy||aiBusy} onClick={()=>setSec('documentos')}><FileText size={16}/>{counter('documents',authorizationCount)} autorizações pendentes</button><button disabled={busy||aiBusy} onClick={()=>setExtraOpen(true)}><CalendarClock size={16}/>{counter('extra',extraordinaryCount)} pedidos extraordinários</button></div>
    {loadError&&<div className="app-message-error" role="alert">{loadError}</div>}
    {notice&&<div className="app-message-notice" role="status" aria-live="polite">{notice}</div>}
    {failedNotice&&<div className="app-message-retry"><AlertTriangle size={18}/><p><strong>Um aviso por WhatsApp com falha.</strong> O conteúdo já está salvo no aplicativo. Pendente para {failedNotice.name} neste navegador.</p><button className="app-message-button" disabled={retryBusy||busy} onClick={()=>void retryWhatsappNotice()}><RefreshCw size={16}/>{retryBusy?'Reenviando…':'Reenviar aviso'}</button></div>}
    <div className="app-message-navigation"><InternalNavigation label="Seções das mensagens do aplicativo">{([['recebidos','Recebidos'],['recados','Enviados'],['documentos','Documentos e autorizações']] as const).map(([key,label])=><button key={key} aria-pressed={sec===key} disabled={busy||aiBusy} onClick={()=>setSec(key)}>{label}</button>)}</InternalNavigation><button className="app-message-text-button" disabled={busy||aiBusy} onClick={()=>setSec('acessos')}>Controle do aplicativo ↗</button></div>
    {sec==='recebidos'&&<ClientAppInbox items={inbox} selected={selectedMessage} reply={reply} busy={busy} aiBusy={aiBusy} loading={loadBusy} error={failedSections.includes('inbox')?loadError:''} onSelect={item=>void openInboxMessage(item)} onClose={()=>setActiveInbox(null)} onReply={updateReply} onSuggest={()=>void suggestReply()} onSend={()=>void sendReply()}/>}
    {sec==='recados'&&<div className="app-message-secondary client-area">
        <section className="panel" style={{ marginTop: 20 }}>
          <h2>
            <FileText size={18} /> Recados enviados
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Recado</th>
                  <th>Categoria</th>
                  <th>Enviado</th>
                  <th>Origem</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td>{m.clients?.name || clients.find(client=>client.id===m.client_id)?.name || "Cliente"}</td>
                    <td>
                      <b>{m.title}</b>
                    </td>
                    <td>{m.category}</td>
                    <td>{m.sent_at ? new Date(m.sent_at).toLocaleString("pt-BR") : "Data não informada"}</td>
                    <td>
                      {m.source_channel === "whatsapp"
                        ? "IA: WhatsApp + App"
                        : "Manual: App"}
                    </td>
                    <td>
                      {m.acknowledged_at ? (
                        <>
                          <CheckCircle2 size={14} /> Ciência confirmada
                        </>
                      ) : m.read_at ? (
                        "Visualizado"
                      ) : (
                        "Enviado"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>}
    {sec==='documentos'&&<div className="app-message-secondary client-area"><div className="app-message-secondary-heading"><h2>Documentos do aplicativo</h2><button className="app-message-button app-message-primary" disabled={busy} onClick={()=>setPublishOpen(true)}><Plus size={16}/>Enviar documento</button></div>
        <section className="panel" style={{ marginTop: 20 }}>
          <h2>
            <FileText size={18} /> Autorizações e documentos
          </h2>
          {docReq


            .map((d) => (
              <div className="integration-card" key={d.id}>
                <b>
                  {d.clients?.name || "Cliente"} · {d.title}
                </b>
                <p>
                  Status:{" "}
                  {!d.requires_authorization ? "Disponibilizado" : d.authorization_status === "authorized"
                    ? "Autorizado"
                    : d.authorization_status === "denied"
                      ? "Não autorizado"
                      : "Aguardando autorização"}
                </p>
                {d.authorization_status === "pending" && (
                  <button
                    className="btn-secondary"
                    onClick={() => toggleReminder(d)}
                  >
                    {d.reminder_enabled
                      ? "Desativar lembrete"
                      : "Ativar lembrete"}
                  </button>
                )}
              </div>
            ))}
        </section>
      {!docReq.length&&!loadBusy&&<p>Nenhum documento retornado nesta consulta.</p>}</div>}
    {sec==='acessos'&&<div className="app-message-secondary client-area"><button className="app-message-text-button" onClick={()=>setSec('recebidos')}><ArrowLeft size={16}/>Voltar às mensagens</button>
        <section className="panel" style={{ marginBottom: 20 }}>
          <h2>
            <Eye size={18} /> Clientes no Aplicativo
          </h2>
          <p>
            Visão geral do que está sendo alimentado pela LexOffice para cada
            cliente.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>App</th>
                  <th>Processo</th>
                  <th>Etapa atual</th>
                  <th>Última atualização</th>
                </tr>
              </thead>
              <tbody>
                {appClients.filter(
                  (x: any) => x.access && x.access.status !== "revoked",
                ).length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      Nenhum cliente com acesso ao aplicativo ainda. Libere o
                      acesso na ficha do cliente.
                    </td>
                  </tr>
                )}
                {appClients
                  .filter((x: any) => x.access && x.access.status !== "revoked")
                  .sort(
                    (a: any, b: any) =>
                      (b.access?.status === "active" ? 1 : 0) -
                      (a.access?.status === "active" ? 1 : 0),
                  )
                  .map((x: any) => (
                    <tr key={x.client.id}>
                      <td>
                        <b>{x.client.name}</b>
                      </td>
                      <td>
                        {x.access?.installed_at
                          ? "Instalado"
                          : x.access?.status === "active"
                            ? "Ativo (acessou)"
                            : "Aguardando 1º acesso"}
                      </td>
                      <td>
                        {x.process?.cnj_number ||
                          x.process?.subject ||
                          "Sem processo"}
                      </td>
                      <td>{x.phase?.phase_label || "Sem etapa atual"}</td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            justifyContent: "space-between",
                          }}
                        >
                          <span>
                            {x.phase?.last_movement_at
                              ? new Date(
                                  x.phase.last_movement_at,
                                ).toLocaleString("pt-BR")
                              : "Sem movimentação"}
                          </span>
                          <button
                            className="btn-secondary"
                            title="Ver exatamente o que foi alimentado para este cliente"
                            onClick={() => previewFromControl(x)}
                          >
                            <Eye size={16} /> Ver
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      <label className="app-message-client-select">Selecionar cliente para controle<select value={clientId} onChange={event=>setClientId(event.target.value)}><option value="">Selecione um cliente</option>{clients.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <section className="panel">
            <h2>
              <Smartphone size={18} /> Controle do aplicativo
            </h2>
            {!selected ? (
              <div className="integration-card">
                <b>Selecione um cliente</b>
                <p>
                  Escolha o cliente ao lado para preencher e controlar a área
                  individual dele.
                </p>
              </div>
            ) : (
              <div className="integration-card">
                <b>Acesso individual de {selected.name}</b>
                <p>
                  <strong>Login:</strong>{" "}
                  {access?.login_cpf ||
                    selected.cpf_cnpj ||
                    "CPF não cadastrado"}
                  <br />
                  <strong>Código:</strong>{" "}
                  {access?.access_code || "Ainda não gerado"}
                  <br />
                  <strong>Status:</strong>{" "}
                  {access?.status === "active"
                    ? "Ativo"
                    : access?.status === "revoked"
                      ? "Revogado"
                      : "Não ativado"}
                </p>
                <p>O acesso é administrado na ficha do cliente. <Link className="btn-primary" to={`/clientes/${selected.id}?secao=acesso`}>Gerenciar acesso deste cliente →</Link></p>
              </div>
            )}
            <div className="integration-card">
              <b>Marca pública</b>
              <p>Suzanne Figueiredo Advocacia e Soluções Jurídicas</p>
            </div>
            <div className="integration-card">
              <b>Vínculo do cliente</b>
              <p>
                O aplicativo usa o cadastro da LexOffice. CPF/CNPJ e
                telefone/WhatsApp são identificadores do cliente; o acesso
                continua autenticado para impedir que outra pessoa veja o
                processo.
              </p>
            </div>
            <div className="integration-card">
              <b>Envios proativos da IA</b>
              <p>
                Para clientes com o aplicativo ativado, os envios proativos dos
                agentes também são espelhados automaticamente no App. O WhatsApp
                continua sendo enviado normalmente.
              </p>
            </div>
            <div className="integration-card">
              <b>Restrição</b>
              <p>
                A restrição permanece manual na aba Financeiro e não é removida
                automaticamente por pagamento.
              </p>
            </div>
          </section>
        </div>}
    {composeOpen&&<ClientAppDialog title="Novo recado" onClose={()=>{if(!busy)setComposeOpen(false);}}><div className="app-message-secondary client-area">
          <section className="panel">

            <label>
              Cliente
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Selecione</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <small>
                CPF/CNPJ: {selected.cpf_cnpj || "não informado"} • WhatsApp:{" "}
                {selected.whatsapp || selected.phone || "não informado"}
              </small>
            )}
            <label>
              Título
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Documento recebido"
              />
            </label>
            <label>
              Categoria
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="importante">Importante</option>
                <option value="processo">Processo</option>
                <option value="documentos">Documentos</option>
                <option value="audiencia">Audiência/Compromisso</option>
                <option value="financeiro">Financeiro</option>
                <option value="atendimento">Atendimento</option>
                <option value="informativo">Informativo</option>
              </select>
            </label>
            <label>
              Prioridade
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </select>
            </label>
            <label>
              Mensagem
              <textarea
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Escreva o recado que o cliente verá no aplicativo."
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />{" "}
              Exigir “Li e estou ciente”
            </label>
            <button className="btn-primary" disabled={busy} onClick={send}>
              <Bell size={16} />
              {busy ? " Publicando..." : " Publicar no App"}
            </button>
          </section>
        <small>O recado será publicado no aplicativo. O aviso por WhatsApp terá confirmação separada.</small></div></ClientAppDialog>}
    {publishOpen&&<ClientAppDialog title="Enviar documento ao cliente" onClose={()=>{if(!busy)setPublishOpen(false);}}><div className="app-message-secondary client-area">
        <section className="panel" style={{ marginTop: 20 }}>

          <div className="settings-grid">
            <label>
              Cliente
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Selecione</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Título
              <input
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Ex.: Petição protocolada"
              />
            </label>
          </div>
          <label
            style={{ display: "grid", gap: 8, minWidth: 0, marginTop: 14 }}
          >
            Arquivo
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setDocFile(e.target.files?.[0] || null)}
              style={{
                display: "block",
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                padding: "10px 12px",
                border: "1px solid var(--lx-accent)",
                borderRadius: "var(--lx-radius-md)",
                background: "var(--lx-surface)",
                color: "inherit",
                fontSize: "var(--lx-font-md)",
              }}
            />
          </label>
          <label
            className="check-row"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 10,
              marginTop: 14,
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            <input
              type="checkbox"
              checked={docAuth}
              onChange={(e) => setDocAuth(e.target.checked)}
              style={{
                width: 18,
                height: 18,
                minWidth: 18,
                margin: 0,
                accentColor: "var(--lx-accent)",
                flex: "0 0 auto",
              }}
            />{" "}
            Exigir autorização do cliente
          </label>
          {docAuth && (
            <label
              className="check-row"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 10,
                marginTop: 10,
                width: "fit-content",
                maxWidth: "100%",
              }}
            >
              <input
                type="checkbox"
                checked={docReminder}
                onChange={(e) => setDocReminder(e.target.checked)}
                style={{
                  width: 18,
                  height: 18,
                  minWidth: 18,
                  margin: 0,
                  accentColor: "var(--lx-accent)",
                  flex: "0 0 auto",
                }}
              />{" "}
              Ativar lembrete enquanto aguarda autorização
            </label>
          )}
          <button
            className="btn-primary"
            disabled={busy}
            onClick={publishDocument}
          >
            <FileText size={16} /> Disponibilizar no App
          </button>
        </section>
      </div></ClientAppDialog>}
    {extraOpen&&<ClientAppDialog title="Pedidos extraordinários" onClose={()=>setExtraOpen(false)}><div className="app-message-secondary client-area"><section className="panel">
            <h2>
              <CalendarClock size={18} /> Solicitações extraordinárias
            </h2>
            {extra.map((x) => (
              <div className="integration-card" key={x.id}>
                <b>
                  {x.clients?.name || "Cliente"} ·{" "}
                  {Number(x.fee).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </b>
                <p>
                  {x.fee_rule}
                  <br />
                  {x.status === "receipt_sent"
                    ? "Comprovante recebido"
                    : x.status === "confirmed"
                      ? "Confirmado"
                      : "Aguardando pagamento/aceite"}
                </p>
                {x.status !== "confirmed" && (
                  <button
                    className="btn-primary"
                    onClick={() => confirmExtra(x.id)}
                  >
                    <ShieldCheck size={15} /> Confirmar atendimento
                  </button>
                )}
              </div>
            ))}
          </section>{!extra.length&&<p>Nenhuma solicitação retornada.</p>}</div></ClientAppDialog>}
    {previewClient&&<ClientAppDialog title="Conteúdo do aplicativo do cliente" onClose={()=>setPreviewClient(null)}><div className="app-message-secondary client-area"><div className="integration-head">
              <div>
                <span className="integration-pill">
                  <Eye size={14} /> ESPELHO DO APP
                </span>
                <h2>{previewClient.client.name}</h2>
                <p>Conteúdo que a LexOffice alimentou para este cliente.</p>
              </div>
              <button
                className="btn-secondary"
                onClick={() => setPreviewClient(null)}
              >
                Fechar
              </button>
            </div>
            {previewBusy ? (
              <p>Carregando conteúdo...</p>
            ) : (
              <div className="settings-grid">
                <section>
                  <h3>Processos e linha do tempo</h3>
                  {previewData.processes.map((p: any) => (
                    <div className="integration-card" key={p.id}>
                      <b>{p.cnj_number || p.subject || "Processo"}</b>
                      {previewData.timeline
                        .filter((t: any) => t.process_id === p.id)
                        .map((t: any) => (
                          <p key={t.id}>
                            <strong>
                              {t.status === "current"
                                ? "● "
                                : t.status === "completed"
                                  ? "✓ "
                                  : "○ "}
                              {t.phase_label}
                            </strong>
                            {t.summary ? (
                              <>
                                <br />
                                {t.summary}
                              </>
                            ) : null}
                          </p>
                        ))}
                    </div>
                  ))}
                </section>
                <section>
                  <h3>Recados enviados</h3>
                  {previewData.messages.length ? (
                    previewData.messages.map((m: any) => (
                      <div className="integration-card" key={m.id}>
                        <b>{m.title}</b>
                        <p>{m.body}</p>
                        <small>
                          {new Date(m.created_at).toLocaleString("pt-BR")}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p>Nenhum recado enviado.</p>
                  )}
                </section>
                <section>
                  <h3>Documentos disponibilizados</h3>
                  {previewData.docs.length ? (
                    previewData.docs.map((d: any) => (
                      <div className="integration-card" key={d.id}>
                        <b>{d.title}</b>
                        <p>
                          {d.requires_authorization
                            ? "Autorização: " + d.authorization_status
                            : "Disponibilizado para consulta"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p>Nenhum documento disponibilizado.</p>
                  )}
                </section>
                <section>
                  <h3>Financeiro alimentado</h3>
                  {previewData.finance.length ? (
                    previewData.finance.map((f: any) => (
                      <div className="integration-card" key={f.id}>
                        <b>{f.title}</b>
                        <p>
                          {Number(f.total_amount || 0).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}{" "}
                          • {f.status}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p>Nenhuma informação financeira alimentada.</p>
                  )}
                </section>
              </div>
            )}
</div></ClientAppDialog>}
  </div>;
}

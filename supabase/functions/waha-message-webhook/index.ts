import { quotedMessageId, careReplyContext } from './care-reply.mjs';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json"}}),D=(v:any)=>String(v??'').replace(/\D/g,'');const A=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
// v87 (13/11/2026) — MENU ELEGANTE: saudação ("oi", "bom dia", "menu"...) abre o menu do chatbot (lista com emoji, título e descrição);
//        toque numa opção segue o menu ou passa ao agente certo com o contexto; texto livre continua indo direto para a Helena.
//        Enquanto o fluxo estiver desligado na tela, o menu só aparece para os números de teste (ai_test_allowlist).
// v76 — conversa sem agente definido vai para a triagem (Helena); antes a mensagem era só registrada e ninguém respondia.
const DEFAULT_AGENT='client_service_triage';
const GREETING=/^(oi+e?|ola+|oie|bom dia|boa tarde|boa noite|menu|inicio|opcoes|ajuda|hello|hi)( (tudo bem|td bem|dra|doutora|suzanne))?$/;
const normText=(s:string)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu,' ').replace(/\s+/g,' ').trim();
async function callFlow(a:any,payload:any){const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;try{const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-chatbot-flow`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(40000)});return await r.json().catch(()=>({}))}catch(e){console.error('chatbot-flow',e);return {ok:false}}}
async function saveState(a:any,orgId:string,convId:string,node:string,path:any[]){await a.from('whatsapp_chatbot_flow_state').upsert({conversation_id:convId,org_id:orgId,current_node:node,path:path||[],updated_at:new Date().toISOString()})}
// Devolve {handled:true} quando o menu respondeu; {agent,message} quando a escolha passa a um agente; null quando é texto livre (Helena).
async function menuStep(a:any,v:any,phone:string,body:string,rowId:string){
  const t=normText(body);
  const {data:st}=await a.from('whatsapp_chatbot_flow_state').select('current_node,path,updated_at').eq('conversation_id',v.id).maybeSingle();
  const fresh=st?.updated_at&&Date.now()-new Date(st.updated_at).getTime()<6*3600000;
  const node=fresh&&st?.current_node&&st.current_node!=='agent_conversation'?String(st.current_node):'';
  const choice=rowId||(/^[a-z_]+:[a-z_]+$/i.test(body.trim())?body.trim():'');
  if(node||choice){
    const d:any=await callFlow(a,{org_id:v.org_id,conversation_id:v.id,phone,node:node||'start',choice,text:body,path:node&&Array.isArray(st?.path)?st.path:[]});
    if(d?.blocked)return null;
    if(d?.matched&&d?.handoff){
      await saveState(a,v.org_id,v.id,'agent_conversation',d.path||[]);
      const {data:cv}=await a.from('whatsapp_conversations').select('chatbot_context').eq('id',v.id).maybeSingle();
      await a.from('whatsapp_conversations').update({chatbot_context:{...(cv?.chatbot_context||{}),...(d.context||{})},owner_agent_key:d.agent_key,owner_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',v.id);
      return {agent:String(d.agent_key),message:`A cliente selecionou: ${String(d.context?.summary||d.selected?.label||body)}`};
    }
    if(d?.matched&&d?.node){await saveState(a,v.org_id,v.id,String(d.node),d.path||[]);return {handled:true}}
    if(d?.matched&&d?.replied){await saveState(a,v.org_id,v.id,'agent_conversation',d.path||[]);return {handled:true}}
  }
  if(t&&t.length<=30&&GREETING.test(t)){
    const d:any=await callFlow(a,{org_id:v.org_id,conversation_id:v.id,phone,node:'start'});
    if(d?.ok&&!d?.blocked&&d?.node){await saveState(a,v.org_id,v.id,'start',[]);return {handled:true}}
    console.log('menu_start_not_sent',JSON.stringify({blocked:!!d?.blocked,reason:d?.reason||null,error:d?.error||null}));
  }
  return null;
}
Deno.serve(async req=>{if(req.method!=='POST')return J({ok:false},405);try{const expected=(Deno.env.get('WAHA_API_KEY')||'').trim(),got=(req.headers.get('x-lexoffice-webhook-key')||'').trim();if(!expected||got!==expected)return J({ok:false},401);const b=await req.json().catch(()=>({})),p=b?.payload||b,rawChatId=String(p.fromMe?(p.chatId||p.to||p.phone):(p.chatId||p.from||p.phone)||'').trim(),phoneInitial=D(p.fromMe?(p.chatId||p.to||p.phone):(p.from||p.chatId||p.phone)),body=String(p.buttonsResponseMessage?.selectedDisplayText||p.buttonsResponseMessage?.buttonText?.displayText||p.listResponseMessage?.title||p.body||p.text||p.selectedButtonId||p.buttonId||p.listResponse?.id||p.listResponse?.selectedRowId||p.listResponseMessage?.singleSelectReply?.selectedRowId||p._data?.selectedButtonId||p._data?.selectedRowId||'').trim();
const rowId=String(p.listResponse?.selectedRowId||p.listResponse?.id||p.listResponseMessage?.singleSelectReply?.selectedRowId||p._data?.selectedRowId||p._data?.message?.listResponseMessage?.singleSelectReply?.selectedRowId||p._data?.Message?.listResponseMessage?.singleSelectReply?.selectedRowID||'').trim();
// v91 — "message.any" traz as mensagens que a Dra./equipe digitam no aplicativo do WhatsApp (fromMe): pausa a Helena.
const ev=String(b.event||'');if(ev!=='message'&&ev!=='message.any'){console.log('waha_ignored',JSON.stringify({reason:'event',event:ev}));return J({ok:true,ignored:'unsupported_event'});}
if(ev==='message.any'&&!p.fromMe)return J({ok:true,ignored:'inbound_duplicate'});const connId=req.headers.get('x-lexoffice-connection-id');const session=req.headers.get('x-lexoffice-waha-session');if(!connId||!session||b.session!==session)return J({ok:false},403);const a=A();const{data:conn}=await a.from('integration_connections').select('org_id,settings,status').eq('id',connId).eq('provider','whatsapp').maybeSingle();if(conn?.status!=='connected'||conn.settings?.provider!=='waha'||conn.settings?.waha_session!==session||conn.settings?.channel_enabled!==true)return J({ok:false},403);
let phone=phoneInitial;
let chatContact:any=null;
if(/@lid$/i.test(rawChatId)){
  const byLid=await a.from('whatsapp_contacts').select('id,org_id,client_id,lead_id,owner_user_id,phone,whatsapp_id').eq('org_id',conn.org_id).eq('whatsapp_id',rawChatId).limit(1).maybeSingle();
  chatContact=byLid.data||null;
  phone=''; // v87: os dígitos do LID não são telefone; sem tradução, cai na busca alternativa abaixo.
  const cp=D(chatContact?.phone||''),cl=cp.startsWith('55')?cp.slice(2):cp;
  if(cl.length===10||cl.length===11)phone=cp;
  else{
    const base=(Deno.env.get('WAHA_API_URL')||'https://lexoffice-waha-production.up.railway.app').trim().replace(/\/+$/,'');
    const key=(Deno.env.get('WAHA_API_KEY')||'').trim();
    if(base&&key){
      const mapped=await fetch(base+'/api/'+encodeURIComponent(session)+'/lids/'+encodeURIComponent(rawChatId),{headers:{'X-Api-Key':key},redirect:'error',signal:AbortSignal.timeout(10000)});
      if(mapped.ok){const ld=await mapped.json().catch(()=>null);phone=D(String(ld?.pn||'').replace(/@.*/,'').replace(/:\d+$/,''))}
      else console.log('waha_lid_lookup',JSON.stringify({status:mapped.status}));
    }
  }
}
// v87 — LID sem tradução: tenta o número que o WAHA manda em campos alternativos antes de descartar.
const okLen=(x:string)=>{const l=x.startsWith('55')?x.slice(2):x;return l.length===10||l.length===11};
if((!phone||!okLen(phone))&&/@lid$/i.test(rawChatId)){const before=phone;phone='';
  const alts=[p._data?.key?.senderPn,p._data?.key?.remoteJidAlt,p._data?.key?.participantPn,p._data?.Info?.SenderAlt,p._data?.Info?.Sender,p._data?.Info?.Chat,p._data?.from,p.participant,p.author];
  for(const x of alts){const s=String(x||'');if(/@(s\.whatsapp\.net|c\.us)$/i.test(s)){const d=D(s.replace(/@.*/,'').replace(/:\d+$/,''));if(okLen(d)){phone=d;break}}}
  // Sem número real, mas o contato do LID já existe: segue com ele (o envio usa o próprio LID).
  if(!phone&&chatContact?.phone)phone=D(chatContact.phone);
  console.log('waha_lid_pn',JSON.stringify({len:before.length,tail:before.slice(-3),fromContact:!!chatContact,resolved:okLen(phone)}));
}
if(!phone){console.log('waha_ignored',JSON.stringify({reason:'phone',chat:rawChatId.replace(/^\d+/,'#'),fromMe:!!p.fromMe,keys:Object.keys(p||{}).slice(0,30),dataKeys:Object.keys(p._data||{}).slice(0,30),keyKeys:Object.keys(p._data?.key||{}),infoKeys:Object.keys(p._data?.Info||{})}));return J({ok:true,ignored:'phone'});}

const local=phone.startsWith('55')?phone.slice(2):phone;
if(!(chatContact&&/@lid$/i.test(rawChatId))&&local.length!==10&&local.length!==11){console.log('waha_ignored',JSON.stringify({reason:'invalid_phone',len:phone.length,chat:rawChatId.replace(/^\d+/,'#')}));return J({ok:true,ignored:'invalid_phone'});}
const ddd=local.slice(0,2),tail8=local.slice(-8),variants=[...new Set([phone,local,'55'+ddd+tail8,'55'+ddd+'9'+tail8,ddd+tail8,ddd+'9'+tail8])];
let{data:contacts}=await a.from('whatsapp_contacts').select('id,org_id,client_id,lead_id,owner_user_id,phone,whatsapp_id').eq('org_id',conn.org_id).in('phone',variants).limit(20);
// v87: contato achado pelo LID mas com "telefone" inválido (dígitos do LID) perde para o contato real do número.
let c=(chatContact&&okLen(D(chatContact.phone||''))?chatContact:null)||(contacts||[]).sort((x:any,y:any)=>(D(y.phone)===phone?2:0)+(y.client_id?1:0)-((D(x.phone)===phone?2:0)+(x.client_id?1:0)))[0]||chatContact||null;
if(!c){
 const name=String(p.pushName||p._data?.notifyName||'').trim()||null;
 const created=await a.from('whatsapp_contacts').insert({org_id:conn.org_id,phone,name,profile_name:name,whatsapp_id:/^\d+@(lid|c\.us)$/.test(rawChatId)?rawChatId:null}).select('id,org_id,client_id,lead_id,owner_user_id,phone,whatsapp_id').single();
 if(created.error){
  const retry=await a.from('whatsapp_contacts').select('id,org_id,client_id,lead_id,owner_user_id,phone').eq('org_id',conn.org_id).in('phone',variants).limit(20);
  c=(retry.data||[])[0]||null;
  if(!c)throw created.error;
 }else c=created.data;
}
if(/^\d+@(lid|c\.us)$/.test(rawChatId)&&c.whatsapp_id!==rawChatId){
  await a.from('whatsapp_contacts').update({whatsapp_id:rawChatId}).eq('org_id',conn.org_id).eq('id',c.id);
}
let{data:v}=await a.from('whatsapp_conversations').select('id,org_id,bot_ativo,conversation_owner,last_human_outbound_at,owner_agent_key').eq('org_id',c.org_id).eq('contact_id',c.id).neq('status','closed').order('updated_at',{ascending:false}).limit(1).maybeSingle();
if(!v){
 const created=await a.from('whatsapp_conversations').insert({org_id:c.org_id,contact_id:c.id,client_id:c.client_id||null,status:'open',bot_ativo:true,conversation_owner:'HELENA'}).select('id,org_id,bot_ativo,conversation_owner,last_human_outbound_at,owner_agent_key').single();
 if(created.error)throw created.error;
 v=created.data;
}const now=new Date().toISOString();await a.from('whatsapp_conversations').update({last_message_at:now,last_message_preview:body||'[mídia]',updated_at:now}).eq('id',v.id);const media=p.image||p.audio||p.video||p.document||null;
const externalId=typeof p.id==='string'?p.id:String(p.id?._serialized||p.messageId||'').trim()||null;
const inserted=await a.from('whatsapp_messages').insert({org_id:v.org_id,conversation_id:v.id,direction:p.fromMe?'outbound':'inbound',message_type:media?'media':'text',body:body||null,external_message_id:externalId,status:p.fromMe?'sent':'received',metadata:{source:p.source||'waha',media,selected_option:body||null,...(rowId?{selected_row_id:rowId}:{})}}).select('id').maybeSingle();
if(inserted.error){if(inserted.error.code==='23505')return J({ok:true,event:'duplicate'});throw inserted.error}
if(p.fromMe){
  const source=String(p.source||b?.source||'').toLowerCase();
  const automated=/zapi|api|lexoffice|automation|agent|bot/.test(source);
  if(!automated){
    await a.from('whatsapp_conversations').update({
      bot_ativo:false,
      conversation_owner:'HUMAN',
      owner_agent_key:null,
      last_human_outbound_at:now,
      human_takeover_at:now,
      human_takeover_reason:'manual_whatsapp_device',
      updated_at:now
    }).eq('id',v.id);
    const contactKey=phone;
    await a.from('ai_conversation_controls').upsert({
      org_id:v.org_id,
      contact_key:contactKey,
      ai_enabled:false,
      human_takeover:true,
      human_takeover_at:now,
      last_human_message_at:now,
      resume_after_minutes:0,
      resume_at:null,
      updated_at:now
    },{onConflict:'org_id,contact_key'});
    console.log('waha_human_takeover',JSON.stringify({source,conv:v.id}));
    return J({ok:true,event:'human_takeover',conversation_id:v.id});
  }
  return J({ok:true,event:'outbound_recorded'});
}if(body&&!externalId)return J({ok:true,ignored:'missing_event_id'});
if(body){
 const claim=await a.rpc('claim_waha_active_reply',{p_org:v.org_id,p_conversation:v.id,p_event:externalId});
 if(claim.error)throw claim.error;
 if(claim.data!=='claimed')return J({ok:true,event:claim.data});
}
try {
const normalized=body.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\\s+/g,' ').trim();
const wantsAccess=/\\bQUERO\\b.*\\b(ACESSO|APP|APLICATIVO)\\b|\\b(ACESSO|APP|APLICATIVO)\\b.*\\bQUERO\\b|\\bPODE\\b.*\\b(LIBERAR|ENVIAR)\\b.*\\b(ACESSO|APP|APLICATIVO)\\b/.test(normalized);
if(wantsAccess&&c.client_id){
  const {data:cl}=await a.from('clients').select('id,org_id,name,cpf_cnpj,whatsapp,phone,status').eq('id',c.client_id).maybeSingle();
  const cpf=D(cl?.cpf_cnpj);
  if(cl?.status==='active'&&cpf.length===11){
    const {data:existing}=await a.from('client_app_access').select('login_cpf,access_code,status').eq('client_id',cl.id).maybeSingle();
    let access=existing;
    if(!access?.access_code||access.status==='revoked'){
      const code='SF-'+crypto.randomUUID().replace(/-/g,'').slice(0,4).toUpperCase()+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,4).toUpperCase();
      const {data:up,error:upErr}=await a.from('client_app_access').upsert({org_id:cl.org_id,client_id:cl.id,login_cpf:cpf,access_code:code,status:'not_activated',revoked_at:null},{onConflict:'client_id'}).select('login_cpf,access_code,status').single();
      if(upErr)throw upErr; access=up;
    }
    const msg='Olá, '+cl.name+'! ✨\\n\\n🔐 *SEU ACESSO À ÁREA DO CLIENTE FOI LIBERADO*\\n\\n👤 *LOGIN (CPF):* '+cpf+'\\n🔑 *CÓDIGO DE ACESSO:* '+access.access_code+'\\n\\n🔗 *ACESSE SUA ÁREA DO CLIENTE:*\\nhttps://lexoffice.univittagroup.com.br/cliente\\n\\n📱 No Android, abra no Chrome e use *Adicionar à tela inicial* ou *Instalar aplicativo*.\\n🍎 No iPhone, abra no Safari, toque em *Compartilhar* e depois *Adicionar à Tela de Início*.\\n\\nPor segurança, não compartilhe seu código.';
    const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const send=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-operator-send`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`,'apikey':svc},body:JSON.stringify({org_id:v.org_id,message:msg,targets:[{phone,name:cl.name,conversation_id:v.id}],agent_key:'client_schedule_relationship',next_agent_key:'client_schedule_relationship',keep_ai_active:true,mirror_to_app:false})});
    const sd=await send.json().catch(()=>({}));
    if(!send.ok||!sd?.ok)throw new Error(sd?.error||'Falha ao enviar acesso');
    return J({ok:true,event:'client_app_access_sent',conversation_id:v.id});
  }
}
if(v.bot_ativo===false||v.conversation_owner==='HUMAN'){console.log('waha_skip',JSON.stringify({reason:'human_owner'}));return J({ok:true,event:'human_owner'});}if(v.last_human_outbound_at){const t=new Date(v.last_human_outbound_at).getTime();if(Number.isFinite(t)&&Date.now()-t<1200000)return J({ok:true,event:'human_cooldown'})}
let careContext:string|null=null;
const quoted=quotedMessageId(p);
if(body&&quoted&&c.client_id){
 const {data:notice,error}=await a.from('notification_queue').select('id')
   .eq('org_id',v.org_id).eq('client_id',c.client_id).eq('destination',phone)
   .eq('channel','whatsapp').eq('template_key','sf_care_reviewed').eq('status','sent')
   .eq('provider_message_id',quoted).limit(1).maybeSingle();
 if(error)console.error('sf_care_quote_lookup_failed',error.code);
 if(notice){
  const {data:care}=await a.from('sf_care_outbox').select('event_kind')
    .eq('org_id',v.org_id).eq('client_id',c.client_id).eq('notification_id',notice.id).limit(1).maybeSingle();
  if(care)careContext=careReplyContext(care.event_kind);
 }
}
// v87 — menu elegante (saudação / toque numa opção). Qualquer falha aqui cai na Helena, como antes.
let menuAgent:string|null=null,menuMessage:string|null=null;
if(body&&!media&&!careContext){try{const m:any=await menuStep(a,v,phone,body,rowId);if(m?.handled)return J({ok:true,event:'chatbot_menu',conversation_id:v.id});if(m?.agent){menuAgent=m.agent;menuMessage=m.message}}catch(e){console.error('menuStep',e)}}
const messageNorm=body.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const explicitAgent=/meu processo|andamento|audi[eê]ncia|prazo/.test(messageNorm)?'client_process_updates':
  /financeiro|pagamento|boleto|honor[aá]rio|pix/.test(messageNorm)?'billing':
  /agendar|reuni[aã]o|consulta|mensagem pelo app|recado para a dra|falar com a dra/.test(messageNorm)?'client_schedule_relationship':null;
const agentKey=menuAgent||explicitAgent||String(v.owner_agent_key||DEFAULT_AGENT);if(body){const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/helena-conversation-run`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`},body:JSON.stringify({org_id:v.org_id,conversation_id:v.id,phone,message:careContext?`Resposta a ${careContext} do SF Care. Mensagem do cliente: ${body}`:menuMessage||body,agent_key:agentKey,idempotency_key:`helena:${v.id}:${externalId}`})});const d=await r.json().catch(()=>({}));return J({ok:r.ok,event:menuAgent?'menu_handoff':v.owner_agent_key?'agent_handoff':'default_triage',agent_key:agentKey,agent_response:d},r.ok?200:r.status)}return J({ok:true,event:'received',conversation_id:v.id,owner:'HELENA'}) } finally {
 if(body){
  const released=await a.from('waha_active_reply_claims').update({in_progress:false})
    .eq('org_id',v.org_id).eq('conversation_id',v.id).eq('event_id',externalId);
  if(released.error)console.error('sf_care_reply_release_failed',released.error.code);
 }
}
}catch(e){console.error('waha-message-webhook',e);return J({ok:false,error:e instanceof Error?e.message:String(e)},500)}});

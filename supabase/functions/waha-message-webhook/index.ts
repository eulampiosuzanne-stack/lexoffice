import { deliveryTransition, incomingMessageType } from './events.mjs';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json"}}),D=(v:any)=>String(v??'').replace(/\D/g,'');const A=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
// v76 — conversa sem agente definido vai para a triagem (Helena); antes a mensagem era só registrada e ninguém respondia.
const DEFAULT_AGENT='client_service_triage';
Deno.serve(async req=>{if(req.method!=='POST')return J({ok:false},405);try{const expected=(Deno.env.get('WAHA_API_KEY')||'').trim(),got=(req.headers.get('x-lexoffice-webhook-key')||'').trim();if(!expected||got!==expected)return J({ok:false},401);const b=await req.json().catch(()=>({})),p=b?.payload||b,rawChatId=String(p.fromMe?(p.chatId||p.to||p.phone):(p.chatId||p.from||p.phone)||'').trim(),phoneInitial=D(p.fromMe?(p.chatId||p.to||p.phone):(p.from||p.chatId||p.phone)),body=String(p.buttonsResponseMessage?.selectedDisplayText||p.buttonsResponseMessage?.buttonText?.displayText||p.listResponseMessage?.title||p.body||p.text||p.selectedButtonId||p.buttonId||p.listResponse?.id||p.listResponse?.selectedRowId||p.listResponseMessage?.singleSelectReply?.selectedRowId||p._data?.selectedButtonId||p._data?.selectedRowId||'').trim();if(!['message','message.ack'].includes(b.event))return J({ok:true,ignored:'unsupported_event'});const connId=req.headers.get('x-lexoffice-connection-id');const session=req.headers.get('x-lexoffice-waha-session');if(!connId||!session||b.session!==session)return J({ok:false},403);const a=A();const{data:conn}=await a.from('integration_connections').select('org_id,settings,status').eq('id',connId).eq('provider','whatsapp').maybeSingle();if(conn?.status!=='connected'||conn.settings?.provider!=='waha'||conn.settings?.waha_session!==session||conn.settings?.channel_enabled!==true)return J({ok:false},403);
if(b.event==='message.ack'){
  const transition=deliveryTransition(p,new Date().toISOString());
  if(!transition)return J({ok:true,ignored:'unsupported_ack'});
  const {error}=await a.from('whatsapp_messages').update(transition.update)
    .eq('org_id',conn.org_id).eq('external_message_id',p.id).eq('direction','outbound')
    .filter('metadata->>provider','eq','waha').in('status',transition.from);
  if(error)throw error;
  return J({ok:true,event:'delivery_ack'});
}
let phone=phoneInitial;
let chatContact:any=null;
if(/@lid$/i.test(rawChatId)){
  const byLid=await a.from('whatsapp_contacts').select('id,org_id,client_id,lead_id,owner_user_id,phone,whatsapp_id').eq('org_id',conn.org_id).eq('whatsapp_id',rawChatId).limit(1).maybeSingle();
  chatContact=byLid.data||null;
  if(chatContact?.phone)phone=D(chatContact.phone);
  else{
    const base=(Deno.env.get('WAHA_API_URL')||'https://lexoffice-waha-production.up.railway.app').trim().replace(/\/+$/,'');
    const key=(Deno.env.get('WAHA_API_KEY')||'').trim();
    if(base&&key){
      const mapped=await fetch(base+'/api/'+encodeURIComponent(session)+'/lids/'+encodeURIComponent(rawChatId),{headers:{'X-Api-Key':key},redirect:'error',signal:AbortSignal.timeout(10000)});
      if(mapped.ok){const ld=await mapped.json().catch(()=>null);phone=D(ld?.pn||'')}
    }
  }
}
if(!phone)return J({ok:true,ignored:'phone'});

const local=phone.startsWith('55')?phone.slice(2):phone;
if(local.length!==10&&local.length!==11)return J({ok:true,ignored:'invalid_phone'});
const ddd=local.slice(0,2),tail8=local.slice(-8),variants=[...new Set([phone,local,'55'+ddd+tail8,'55'+ddd+'9'+tail8,ddd+tail8,ddd+'9'+tail8])];
let{data:contacts}=await a.from('whatsapp_contacts').select('id,org_id,client_id,lead_id,owner_user_id,phone,whatsapp_id').eq('org_id',conn.org_id).in('phone',variants).limit(20);
let c=chatContact||(contacts||[]).sort((x:any,y:any)=>(D(y.phone)===phone?2:0)+(y.client_id?1:0)-((D(x.phone)===phone?2:0)+(x.client_id?1:0)))[0]||null;
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
}const now=new Date().toISOString();await a.from('whatsapp_conversations').update({last_message_at:now,last_message_preview:body||'[mídia]',updated_at:now}).eq('id',v.id);const media=p.media||(p.image?{...p.image,mimetype:p.image.mimetype||'image/unknown'}:null)||(p.audio?{...p.audio,mimetype:p.audio.mimetype||'audio/unknown'}:null)||(p.video?{...p.video,mimetype:p.video.mimetype||'video/unknown'}:null)||p.document||(p.hasMedia?{}:null);
const externalId=typeof p.id==='string'?p.id:String(p.id?._serialized||p.messageId||'').trim()||null;
const sourceKind=String(p.source||b.source||'').toLowerCase();
if(!p.fromMe&&(/^(api|automation|agent|bot|lexoffice)$/.test(sourceKind)||String(externalId||'').startsWith('true_')))return J({ok:true,ignored:'system_echo'});
if(!p.fromMe&&!externalId)return J({ok:true,ignored:'missing_event_id'});
const inserted=await a.from('whatsapp_messages').insert({org_id:v.org_id,conversation_id:v.id,direction:p.fromMe?'outbound':'inbound',message_type:incomingMessageType(media),body:body||null,external_message_id:externalId,status:p.fromMe?'sent':'received',metadata:{source:p.source||'waha',media,selected_option:body||null}}).select('id').maybeSingle();
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
    return J({ok:true,event:'human_takeover',conversation_id:v.id});
  }
  return J({ok:true,event:'outbound_recorded'});
}
if(v.bot_ativo===false||v.conversation_owner==='HUMAN')return J({ok:true,event:'human_owner'});if(v.last_human_outbound_at){const t=new Date(v.last_human_outbound_at).getTime();if(Number.isFinite(t)&&Date.now()-t<1200000)return J({ok:true,event:'human_cooldown'})}
if(body){
 const claim=await a.rpc('claim_waha_active_reply',{p_org:v.org_id,p_conversation:v.id,p_event:externalId});
 if(claim.error)throw claim.error;
 if(claim.data!=='claimed'){
   console.info('waha_active_reply_blocked',JSON.stringify({conversation_id:v.id,reason:claim.data}));
   return J({ok:true,event:claim.data});
 }
}
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
const messageNorm=body.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const explicitAgent=/meu processo|andamento|audi[eê]ncia|prazo/.test(messageNorm)?'client_process_updates':
  /financeiro|pagamento|boleto|honor[aá]rio|pix/.test(messageNorm)?'billing':
  /agendar|reuni[aã]o|consulta|mensagem pelo app|recado para a dra|falar com a dra/.test(messageNorm)?'client_schedule_relationship':null;
const agentKey=explicitAgent||String(v.owner_agent_key||DEFAULT_AGENT);if(body){const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/helena-conversation-run`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`},body:JSON.stringify({org_id:v.org_id,conversation_id:v.id,phone,message:body,agent_key:agentKey,quoted_external_id:p.replyTo?.id||p._data?.quotedMsg?.id?._serialized,idempotency_key:externalId?`helena:${v.id}:${externalId}`:undefined})});const d=await r.json().catch(()=>({}));return J({ok:r.ok,event:v.owner_agent_key?'agent_handoff':'default_triage',agent_key:agentKey,agent_response:d},r.ok?200:r.status)}return J({ok:true,event:'received',conversation_id:v.id,owner:'HELENA'})}catch(e){console.error('waha-message-webhook',e);return J({ok:false,error:e instanceof Error?e.message:String(e)},500)}});

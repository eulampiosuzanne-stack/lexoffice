import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
// v22 — menu único + modo teste (ai_test_allowlist).
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json"}}),D=(v:any)=>String(v??'').replace(/\D/g,'');const A=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});async function S(a:any,k:string){const{data}=await a.from('system_runtime_secrets').select('secret').eq('key',k).maybeSingle();return String(data?.secret||'').trim()}async function H(v:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function text(b:any){return String(b?.text?.message||b?.text?.description||b?.message?.text||b?.message?.body||b?.body||b?.caption||b?.image?.caption||b?.video?.caption||b?.document?.caption||b?.buttonsResponseMessage?.selectedDisplayText||b?.buttonsResponseMessage?.message||b?.buttonResponse?.selectedDisplayText||b?.listResponseMessage?.title||'').trim()}
function choice(b:any){return String(b?.buttonsResponseMessage?.buttonId||b?.buttonsResponseMessage?.selectedButtonId||b?.buttonResponse?.buttonId||b?.buttonResponse?.selectedButtonId||b?.buttonResponse?.id||b?.listResponseMessage?.selectedRowId||b?.listResponseMessage?.singleSelectReply?.selectedRowId||b?.listResponse?.selectedRowId||b?.listResponse?.id||b?.selectedButtonId||b?.buttonId||b?.selectedRowId||b?.optionListResponse?.selectedRowId||b?.optionListResponse?.id||b?.message?.buttonsResponseMessage?.buttonId||b?.message?.buttonsResponseMessage?.selectedButtonId||b?.message?.listResponseMessage?.singleSelectReply?.selectedRowId||'').trim()}
function media(b:any){for(const [type,obj] of [['image',b?.image||b?.imageMessage],['audio',b?.audio||b?.audioMessage],['video',b?.video||b?.videoMessage],['document',b?.document||b?.documentMessage]] as any){if(obj){const url=String(obj.url||obj.imageUrl||obj.audioUrl||obj.videoUrl||obj.documentUrl||obj.mediaUrl||obj.downloadUrl||'');if(url)return{type,url,fileName:obj.fileName||`${type}.bin`,mimeType:obj.mimeType||obj.mimetype||''}}}return null}
async function context(a:any,p:string){const phone=D(p);let{data:c}=await a.from('whatsapp_contacts').select('id,org_id,phone,client_id').eq('phone',phone).limit(1).maybeSingle();if(!c){const local=phone.startsWith('55')?phone.slice(2):phone;const suffix=local.length>=10?local.slice(-11):local;const{data:rows}=await a.from('whatsapp_contacts').select('id,org_id,phone').limit(50);c=(rows||[]).find((r:any)=>{const rp=D(r.phone);const rl=rp.startsWith('55')?rp.slice(2):rp;return rl===local||rl.endsWith(suffix)||local.endsWith(rl)})||null}if(!c)return null;const{data:v}=await a.from('whatsapp_conversations').select('id,org_id,client_id,chatbot_context,bot_ativo,conversation_owner,owner_agent_key').eq('org_id',c.org_id).eq('contact_id',c.id).neq('status','closed').order('updated_at',{ascending:false}).limit(1).maybeSingle();return v?{c,v}:null}
async function runAgent(orgId:string,conversationId:string,phone:string,agentKey:string,message:string,testMode=false){const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/helena-conversation-run`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`},body:JSON.stringify({org_id:orgId,conversation_id:conversationId,phone,agent_key:agentKey,interaction_mode:'chatbot',message,test_mode:testMode})});const d=await r.json().catch(()=>({}));if(!r.ok||d?.ok===false)console.error('helena-conversation-run',r.status,d?.error);else if(d?.sent===false||d?.skipped)console.warn('helena não enviou',d?.gate_reason||d?.skipped);return d}
const GREETING=/^(oi+[eê]?|ol[aá]+|opa|e a[ií]|bom dia|boa tarde|boa noite|menu|in[ií]cio|come[cç]ar)[!. ]*$/i;
function routeFor(v:any,node:string){const ctx=v.chatbot_context||{};if(v.owner_agent_key)return String(v.owner_agent_key);const s=String(ctx?.summary||'').toLowerCase()+' '+node;if(ctx?.collection_schedule_id||/financ|pagamento|parcela|cobran/.test(s))return 'billing';if(/process|andamento|audi[eê]ncia|prazo/.test(s))return 'client_process_updates';if(/agend|reuni[aã]o|hor[aá]rio/.test(s))return 'client_schedule_relationship';return 'client_service_triage'}
async function bot(a:any,p:string,ch0:string,t:string){
  const x=await context(a,p);if(!x)return false;
  const restrictedClientId=String(x.v.client_id||x.c.client_id||'');
  const {data:restriction}=restrictedClientId?await a.from('client_service_restrictions').select('id').eq('org_id',x.v.org_id).eq('client_id',restrictedClientId).eq('active',true).limit(1).maybeSingle():{data:null};
  // Se a Dra. Suzanne desligou todos os agentes, o robô inteiro fica em silêncio (nem menu).
  const {count:activeAgents}=await a.from('ai_agent_policies').select('agent_key',{count:'exact',head:true}).eq('org_id',x.v.org_id).eq('active',true);
  // Modo teste: números em ai_test_allowlist recebem o robô mesmo com os agentes desligados (ninguém mais recebe).
  const allow=(await S(a,'ai_test_allowlist')).split(/[,;\s]+/).map(D).filter(Boolean);const testMode=allow.includes(D(p));
  if(!activeAgents&&!testMode)return false;
  const {data:fc}=await a.from('whatsapp_chatbot_flow_config').select('enabled').eq('org_id',x.v.org_id).maybeSingle();if(fc?.enabled===false)return false;
  const {data:ctl}=await a.from('ai_conversation_controls').select('ai_enabled,human_takeover,resume_at').eq('org_id',x.v.org_id).eq('contact_key',D(p)).maybeSingle();
  if(ctl?.human_takeover===true||ctl?.ai_enabled===false){if(!ctl?.resume_at||Date.now()<new Date(ctl.resume_at).getTime())return false}
  if(x.v.conversation_owner==='HUMAN'||x.v.bot_ativo===false)return false;
  const {data:st}=await a.from('whatsapp_chatbot_flow_state').select('current_node,path').eq('conversation_id',x.v.id).maybeSingle();
  const node=String(st?.current_node||'start'),path=Array.isArray(st?.path)?st.path:[],svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const call=async(q:any)=>{const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-chatbot-flow`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`},body:JSON.stringify(q)}),d=await r.json().catch(()=>({}));if(!r.ok||d?.ok===false)throw new Error(d?.error||`chatbot ${r.status}`);return d};
  const saveState=(n:string,pth:any[])=>a.from('whatsapp_chatbot_flow_state').upsert({conversation_id:x.v.id,org_id:x.v.org_id,current_node:n,path:pth,updated_at:new Date().toISOString()});
  if(restriction){
    if(node==='restricted_urgent'&&t&&!ch0){
      const now=new Date().toISOString();
      const {data:owners}=await a.from('profiles').select('id').eq('org_id',x.v.org_id).limit(10);
      if(owners?.length)await a.from('notifications').insert(owners.map((u:any)=>({org_id:x.v.org_id,user_id:u.id,type:'urgent',title:'URGÊNCIA de cliente com atendimento restrito',body:'Cliente restrito relatou possível risco à vida ou à integridade física: '+String(t).slice(0,700),link:'/atendimento',read:false})));
      await a.from('audit_logs').insert({org_id:x.v.org_id,action:'restricted_client_emergency',entity:'client_service_restriction',entity_id:restriction.id,metadata:{conversation_id:x.v.id,client_id:restrictedClientId,report:String(t).slice(0,1500),at:now}}).catch(()=>{});
      await call({org_id:x.v.org_id,conversation_id:x.v.id,phone:p,node:'restricted_urgent_received',path});
      await saveState('restricted',[]);return true;
    }
    if(node==='agent_conversation'&&x.v.owner_agent_key==='billing'&&t&&!ch0){await runAgent(x.v.org_id,x.v.id,p,'billing',t,testMode);return true}
    const d=await call({org_id:x.v.org_id,conversation_id:x.v.id,phone:p,node:'restricted',choice:ch0,text:t,path:[]});
    if(d?.matched){if(d.handoff){await saveState('agent_conversation',d.path||[]);await a.from('whatsapp_conversations').update({owner_agent_key:'billing',conversation_owner:'HELENA',bot_ativo:true,updated_at:new Date().toISOString()}).eq('id',x.v.id);await runAgent(x.v.org_id,x.v.id,p,'billing','A cliente está com atendimento restrito e selecionou regularização financeira. Atenda exclusivamente a pendência financeira; não trate outros assuntos.',testMode)}else await saveState(String(d.node||'restricted'),d.path||[]);return true}
    await call({org_id:x.v.org_id,conversation_id:x.v.id,phone:p,node:'restricted',path:[]});await saveState('restricted',[]);return true;
  }
  // 1) Botão clicado ou texto igual a uma opção do menu atual.
  if(ch0||t){
    const d=await call({org_id:x.v.org_id,conversation_id:x.v.id,phone:p,node,choice:ch0,text:t,path});
    if(d?.blocked)return true;
    if(d?.matched){
      const newPath=Array.isArray(d.path)?d.path:path;
      if(d.handoff){
        await saveState('agent_conversation',newPath);
        const previous=x.v.chatbot_context||{},nextContext=d.context||{};
        const now=new Date().toISOString();
        await a.from('whatsapp_conversations').update({chatbot_context:{...previous,...nextContext},bot_ativo:true,conversation_owner:'HELENA',owner_agent_key:d.agent_key,owner_changed_at:now,updated_at:now}).eq('id',x.v.id);
        await runAgent(x.v.org_id,x.v.id,p,d.agent_key,`A cliente selecionou: ${String(d?.selected?.label||t||ch0)}. Contexto do atendimento: ${String(nextContext.summary||'')}. Continue o atendimento a partir daqui sem repetir perguntas já respondidas.`,testMode);
      }else await saveState(String(d.node||node),newPath);
      return true;
    }
  }
  // 2) Primeira mensagem ou saudação: mostra o menu.
  if(!st||GREETING.test(t)){await call({org_id:x.v.org_id,conversation_id:x.v.id,phone:p,node:'start',path:[]});await saveState('start',[]);if(x.v.owner_agent_key&&GREETING.test(t))await a.from('whatsapp_conversations').update({owner_agent_key:null}).eq('id',x.v.id);return true}
  // 3) Texto livre: o agente de IA responsável conversa.
  if(t){await runAgent(x.v.org_id,x.v.id,p,routeFor(x.v,node),t,testMode);if(node!=='agent_conversation')await saveState('agent_conversation',path);return true}
  return false;
}
Deno.serve(async req=>{if(req.method!=='POST')return J({ok:false},405);try{const a=A(),client=await S(a,'zapi_client_token'),got=new URL(req.url).searchParams.get('key')||'';if(!client||got!==await H(client))return J({ok:false},401);const b=await req.json().catch(()=>null);if(!b)return J({ok:true,ignored:'empty'});if((await S(a,'whatsapp_active_provider')).toLowerCase()!=='zapi')return J({ok:true,ignored:'provider_disabled'});const type=String(b.type||b.event||'').toLowerCase();if(type.includes('disconnect'))return J({ok:true,event:'disconnected'});if(type.includes('connect'))return J({ok:true,event:'connected'});if(type.includes('status')){const externalId=String(b.messageId||b.zaapId||b.id||b.message?.id||b.ids?.[0]?.id||'').trim(),rawStatus=String(b.status||b.messageStatus||b.message?.status||type).toLowerCase(),now=new Date().toISOString(),isRead=/read|played|lido/.test(rawStatus),isDelivered=isRead||/delivered|received|entregue/.test(rawStatus);if(externalId&&(isDelivered||isRead)){const {data:q}=await a.from('process_notification_queue').select('id,org_id,owner_user_id,process_id,delivered_at,read_at').eq('external_message_id',externalId).limit(1).maybeSingle();const patch:any={};if(isDelivered)patch.delivered_at=now;if(isRead)patch.read_at=now;if(Object.keys(patch).length){await a.from('process_notification_queue').update(patch).eq('external_message_id',externalId);await a.from('whatsapp_messages').update({...patch,status:isRead?'read':'delivered'}).eq('external_message_id',externalId)}if(q?.owner_user_id&&isDelivered&&!q.delivered_at){const when=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date());await a.from('notifications').insert({org_id:q.org_id,user_id:q.owner_user_id,type:'process',title:'Andamento entregue ao cliente',body:`O cliente recebeu o andamento em ${when}.`,link:q.process_id?`/processos?processo=${q.process_id}`:'/andamentos',read:false})}}return J({ok:true,event:'status',external_message_id:externalId||null,status:rawStatus,tracked:!!externalId&&(isDelivered||isRead)})}const p=D(b.phone||b.sender?.phone||b.from||b.chatId||b.participantPhone||b.senderPhone),t=text(b),ch=choice(b),m=media(b);
const inboundId=String(b.messageId||b.zaapId||b.id||b.message?.id||'').trim();
const fromMe=b.fromMe===true||b.from_me===true||b.fromMe==='true'||b.from_me==='true'||b.isFromMe===true||b?.message?.fromMe===true;
if(!p)return J({ok:true,ignored:'phone'});
if(b.isGroup||b.isNewsletter)return J({ok:true,ignored:'non_inbound'});
// Z-API também envia eventos auxiliares de mensagem sem conteúdo. Eles não podem acionar a IA.
if(!fromMe&&!t&&!ch&&!m)return J({ok:true,ignored:'empty_inbound_event'});
// Idempotência: uma mensagem externa só pode disparar uma resposta.
if(!fromMe&&inboundId){
  const {data:seen}=await a.from('whatsapp_messages').select('id').eq('external_message_id',inboundId).eq('direction','inbound').limit(1).maybeSingle();
  if(seen?.id)return J({ok:true,ignored:'duplicate_inbound',external_message_id:inboundId});
}
if(fromMe){
  const x=await context(a,p);
  if(x){
    const now=new Date().toISOString();
    await a.from('whatsapp_conversations').update({bot_ativo:false,conversation_owner:'HUMAN',last_human_outbound_at:now,human_takeover_at:now,human_takeover_reason:'manual_whatsapp_cellphone',owner_agent_key:null}).eq('id',x.v.id);
    const {data:settings}=await a.from('whatsapp_settings').select('human_takeover_auto_resume_minutes').eq('org_id',x.v.org_id).maybeSingle();
    const resumeMinutes=Math.max(1,Number(settings?.human_takeover_auto_resume_minutes||20));
    const resumeAt=new Date(Date.now()+resumeMinutes*60000).toISOString();
    const controlPatch={ai_enabled:false,human_takeover:true,human_takeover_at:now,last_human_message_at:now,resume_after_minutes:resumeMinutes,resume_at:resumeAt,updated_at:now};
    const {data:existing}=await a.from('ai_conversation_controls').select('id').eq('org_id',x.v.org_id).eq('contact_key',p).limit(1).maybeSingle();
    if(existing?.id)await a.from('ai_conversation_controls').update(controlPatch).eq('id',existing.id);
    else await a.from('ai_conversation_controls').insert({org_id:x.v.org_id,contact_key:p,...controlPatch});
  }
  return J({ok:true,event:'human_takeover',conversation_id:x?.v?.id||null});
}if(await bot(a,p,ch,t))return J({ok:true,event:'chatbot'});const mp=m?{[m.type]:{url:m.url,fileName:m.fileName,mimeType:m.mimeType}}:{};const payload={event:'message.any',payload:{id:String(b.messageId||b.zaapId||b.id||'')||null,fromMe:false,from:p+'@c.us',to:p+'@c.us',chatId:p+'@c.us',body:t||ch,pushName:String(b.senderName||b.chatName||b.sender?.name||'').trim()||null,source:'zapi',...mp}};const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/waha-message-webhook`,{method:'POST',headers:{'Content-Type':'application/json','x-lexoffice-webhook-key':(Deno.env.get('WAHA_API_KEY')||'').trim()},body:JSON.stringify(payload)}),d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error||'Falha no processamento interno');return J({ok:true,event:'message',processed:d})}catch(e){console.error('zapi-message-webhook',e);return J({ok:false,error:e instanceof Error?e.message:String(e)},500)}});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
const j=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json"}});const D=(v:any)=>String(v??'').replace(/\D/g,'');const GV='v21.0',BURST_WAIT_MS=5000;
function db(){return createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})}
async function secret(s:any,key:string){const {data}=await s.from('system_runtime_secrets').select('secret').eq('key',key).maybeSingle();return String(data?.secret||'').trim()}
async function vaultKey(s:any,o:string,p:string){try{const {data}=await s.rpc('read_integration_secret',{p_org_id:o,p_provider:p});return String(data||'').trim()}catch{return''}}
async function org(s:any){const forced=(Deno.env.get('LEXOFFICE_ORG_ID')||'').trim();if(forced)return forced;const {data}=await s.from('integration_connections').select('org_id').in('provider',['meta_whatsapp','whatsapp_meta']).eq('status','connected');if(data&&data.length===1)return data[0].org_id;throw new Error('org')}
async function context(s:any,o:string,raw:string,name:string|null){const ph=D(raw),{data:owner}=await s.from('profiles').select('id').eq('org_id',o).in('role_key',['owner','admin']).eq('status','active').order('created_at',{ascending:true}).limit(1).maybeSingle(),ownerId=owner?.id;if(!ownerId)throw new Error('org_owner_missing');let {data:ct}=await s.from('whatsapp_contacts').select('*').eq('org_id',o).eq('phone',ph).limit(1).maybeSingle();if(!ct){const r=await s.from('whatsapp_contacts').insert({org_id:o,phone:ph,whatsapp_id:raw,name,profile_name:name,owner_user_id:ownerId}).select('*').single();ct=r.data}let {data:cv}=await s.from('whatsapp_conversations').select('*').eq('org_id',o).eq('contact_id',ct.id).neq('status','closed').order('updated_at',{ascending:false}).limit(1).maybeSingle();if(!cv){const r=await s.from('whatsapp_conversations').insert({org_id:o,contact_id:ct.id,status:'open',priority:'normal',bot_ativo:true,conversation_owner:'HELENA',owner_user_id:ownerId}).select('*').single();cv=r.data}let {data:c}=await s.from('ai_conversation_controls').select('*').eq('org_id',o).eq('contact_key',ph).maybeSingle();if(!c){const r=await s.from('ai_conversation_controls').insert({org_id:o,contact_key:ph,ai_enabled:true,human_takeover:false,resume_after_minutes:0,resume_at:null,owner_user_id:ownerId}).select('*').single();c=r.data}return{cv,c,ct,ph}}
async function pause(s:any,cv:any,c:any,reason='operator_whatsapp_message'){const n=new Date(),now=n.toISOString(),resume=new Date(n.getTime()+10*60000).toISOString();await s.from('whatsapp_conversations').update({bot_ativo:false,human_takeover_at:now,human_takeover_reason:reason,conversation_owner:'HUMAN',owner_agent_key:null,owner_changed_at:now,last_human_outbound_at:now,updated_at:now}).eq('id',cv.id);if(c?.id)await s.from('ai_conversation_controls').update({ai_enabled:false,human_takeover:true,human_takeover_at:now,last_human_message_at:now,resume_after_minutes:10,resume_at:resume,updated_at:now}).eq('id',c.id)}
async function store(s:any,o:string,cv:any,eid:string|null,text:string,out:boolean,source:string,metadata:any={}){const {error}=await s.from('whatsapp_messages').insert({org_id:o,conversation_id:cv.id,owner_user_id:cv.owner_user_id,external_message_id:eid,direction:out?'outbound':'inbound',message_type:'text',body:text,status:out?'sent':'received',sent_at:out?new Date().toISOString():null,metadata:{source,fromMe:out,...metadata}});if(error&&String(error.code)!=='23505')throw error;return !error}
async function gate(s:any,o:string,cvId:string,ph:string){let {data:v}=await s.from('whatsapp_conversations').select('bot_ativo,human_takeover_at,conversation_owner').eq('id',cvId).maybeSingle();let {data:c}=await s.from('ai_conversation_controls').select('id,ai_enabled,human_takeover,resume_at').eq('org_id',o).eq('contact_key',ph).maybeSingle();if(c?.human_takeover===true&&c?.resume_at&&new Date(c.resume_at).getTime()<=Date.now()){const now=new Date().toISOString();await s.from('ai_conversation_controls').update({ai_enabled:true,human_takeover:false,human_takeover_at:null,resume_after_minutes:0,resume_at:null,updated_at:now}).eq('id',c.id);await s.from('whatsapp_conversations').update({bot_ativo:true,human_takeover_at:null,human_takeover_reason:null,conversation_owner:'CLARA',owner_changed_at:now,updated_at:now}).eq('id',cvId);v={...v,bot_ativo:true,human_takeover_at:null,conversation_owner:'CLARA'};c={...c,ai_enabled:true,human_takeover:false,resume_at:null}}return v?.bot_ativo===true&&v?.conversation_owner!=='HUMAN'&&!v?.human_takeover_at&&c?.ai_enabled===true&&c?.human_takeover!==true}
async function latest(s:any,cvId:string,eid:string|null){if(!eid)return true;const {data}=await s.from('whatsapp_messages').select('external_message_id').eq('conversation_id',cvId).eq('direction','inbound').order('created_at',{ascending:false}).limit(1).maybeSingle();return String(data?.external_message_id||'')===eid}
async function metaCfg(s:any){const token=await secret(s,'meta_system_user_token'),phoneId=await secret(s,'meta_whatsapp_phone_number_id');if(!token||!phoneId)throw new Error('Meta Cloud API não configurada');return{token,phoneId}}
async function sendMeta(s:any,to:string,message:string){const {token,phoneId}=await metaCfg(s);const r=await fetch(`https://graph.facebook.com/${GV}/${phoneId}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:message,preview_url:false}})});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error?.message||'Falha Meta');return d}
async function typing(s:any,id:string){if(!id)return false;try{const {token,phoneId}=await metaCfg(s);return (await fetch(`https://graph.facebook.com/${GV}/${phoneId}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',status:'read',message_id:id,typing_indicator:{type:'text'}})})).ok}catch{return false}}
function delay(i:string,r:string){return Math.round(Math.min(7000,1800+Math.random()*1800+Math.min(1800,i.length*8)+Math.min(2800,r.length*9)))}
function route(t:string){if(/(boleto|pix|pagamento|parcela|cobran|vencimento)/i.test(t))return'billing';if(/(processo|andamento|intima|senten|decis|audiência|audiencia)/i.test(t))return'client_process_updates';if(/(agenda|agendar|consulta|reuni|horário|horario|meet)/i.test(t))return'client_schedule_relationship';if(/(preço|preco|honor|contrat|proposta|valor)/i.test(t))return'sales';return'client_service_triage'}
function spNow(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());const g=(x:string)=>parts.find(p=>p.type===x)?.value||'';return{weekday:g('weekday'),minutes:Number(g('hour'))*60+Number(g('minute'))}}
async function businessState(s:any,o:string){
  const {data}=await s.from("whatsapp_settings").select("agenda_start_time,agenda_end_time").eq("org_id",o).maybeSingle();
  const cv=(v:any,def:number)=>{const m=String(v||"").match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):def};
  const n=spNow(),workday=!["Sat","Sun"].includes(n.weekday),start=cv(data?.agenda_start_time,720),end=cv(data?.agenda_end_time,1080),today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());
  let holiday=false;
  try{const {data:h}=await s.from("calendar_events").select("id").eq("org_id",o).gte("starts_at",today+"T00:00:00-03:00").lt("starts_at",today+"T23:59:59-03:00").or("event_type.ilike.%holiday%,event_type.ilike.%feriado%,title.ilike.%feriado%,title.ilike.%ponto facultativo%").limit(1);holiday=!!h?.length}catch(e){console.error("META_HOLIDAY_LOOKUP_FAILED",e)}
  return{inHours:workday&&!holiday&&n.minutes>=start&&n.minutes<end,start,end,holiday}
}
async function isClient(s:any,o:string,ct:any,ph:string){if(ct?.client_id){const {data}=await s.from('clients').select('id').eq('org_id',o).eq('id',ct.client_id).eq('status','active').maybeSingle();if(data)return true}const tail=ph.slice(-11);const {data}=await s.from('clients').select('id,phone,whatsapp').eq('org_id',o).eq('status','active').limit(1000);return (data||[]).some((x:any)=>[D(x.phone),D(x.whatsapp)].some(v=>v&&(v===ph||v.endsWith(tail)||ph.endsWith(v.slice(-11)))))}
function urgent(t:string){return /(urgente|urgência|urgencia|emergência|emergencia|prisão|prisao|preso|plantão|plantao|agora|imediat|risco|ameaça|ameaca|violência|violencia)/i.test(t)}
function wantsHuman(t:string){return /(dra\.?\s*suzanne|doutora|advogada|falar com (a )?dra|falar com (a )?advogada|falar com suzanne|cham(e|ar).*(dra|suzanne)|atendimento humano)/i.test(t)}
function b64(buf:ArrayBuffer){const u=new Uint8Array(buf);let out='';for(let i=0;i<u.length;i+=32768)out+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(out)}
async function groqT(k:string,b:ArrayBuffer,m:string,e:string){if(!k)return'';const f=new FormData();f.append('file',new Blob([b],{type:m}),`audio.${e}`);f.append('model','whisper-large-v3-turbo');f.append('language','pt');f.append('response_format','json');const r=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+k},body:f});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error?.message||'GROQ_TRANSCRIPTION_FAILED');return String(d?.text||'').trim()}
async function gemT(k:string,b:ArrayBuffer,m:string){if(!k)return'';const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(k)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:'Transcreva fielmente este áudio em português do Brasil. Retorne somente a transcrição.'},{inline_data:{mime_type:m,data:b64(b)}}]}],generationConfig:{temperature:0}})});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error?.message||'GEMINI_TRANSCRIPTION_FAILED');return String(d?.candidates?.[0]?.content?.parts?.map((p:any)=>p?.text||'').join(' ')||'').trim()}
async function transcribe(s:any,o:string,id:string,h:string){const token=await secret(s,'meta_system_user_token');const mr=await fetch(`https://graph.facebook.com/${GV}/${encodeURIComponent(id)}`,{headers:{Authorization:'Bearer '+token}}),md=await mr.json();if(!mr.ok||!md?.url)throw new Error('META_MEDIA_URL_FAILED');const ar=await fetch(md.url,{headers:{Authorization:'Bearer '+token}});const b=await ar.arrayBuffer(),m=String(ar.headers.get('content-type')||h||'audio/ogg').split(';')[0],e=m.includes('ogg')?'ogg':m.includes('mpeg')?'mp3':m.includes('mp4')?'m4a':m.includes('wav')?'wav':'ogg',errs:string[]=[];for(const k of [await vaultKey(s,o,'groq_api'),(Deno.env.get('GROQ_API_KEY')||'').trim()].filter((v,i,a)=>v&&a.indexOf(v)===i)){try{const t=await groqT(k,b,m,e);if(t)return{text:t,provider:'groq'}}catch(x){errs.push('groq:'+(x instanceof Error?x.message:String(x)))}}const g=await vaultKey(s,o,'gemini_api');if(g)try{const t=await gemT(g,b,m);if(t)return{text:t,provider:'gemini'}}catch(x){errs.push('gemini:'+(x instanceof Error?x.message:String(x)))}throw new Error(errs.join(' | ')||'AUDIO_TRANSCRIPTION_NOT_CONFIGURED')}

const META_MENU_ROOT=[
  {id:"m1_sou_cliente",title:"SOU CLIENTE"},
  {id:"m1_nao_sou_cliente",title:"NÃO SOU CLIENTE"},
  {id:"m1_outros",title:"OUTROS"}
];
const META_MENU_CLIENT=[
  {id:"client_last_movement",title:"Último andamento"},
  {id:"client_deadlines",title:"Prazos e audiências"},
  {id:"client_documents",title:"Enviar documentos"},
  {id:"client_fees",title:"Honorários"},
  {id:"client_meeting",title:"Agendar atendimento"},
  {id:"client_team",title:"Falar com a equipe"},
  {id:"menu_main",title:"Voltar ao menu"}
];
const META_MENU_AREAS=[
  {id:"lead_area_family",title:"Família e sucessões"},
  {id:"lead_area_divorce",title:"Divórcio e guarda"},
  {id:"lead_area_support",title:"Pensão alimentícia"},
  {id:"lead_area_consumer",title:"Consumidor"},
  {id:"lead_area_banking",title:"Bancário"},
  {id:"lead_area_health",title:"Saúde"},
  {id:"lead_area_civil",title:"Cível e contratos"},
  {id:"lead_area_labor",title:"Trabalhista"},
  {id:"lead_area_social_security",title:"Previdenciário"},
  {id:"lead_area_other",title:"Outro assunto"}
];
const META_MENU_AFTER=[
  {id:"afterhours_next",title:"Próximo horário útil"},
  {id:"afterhours_urgent",title:"É urgente"},
  {id:"afterhours_menu",title:"Ver menu"}
];
const META_AREA_BY_ID: Record<string,string> ={
  lead_area_family:"Família e sucessões",lead_area_divorce:"Divórcio e guarda",
  lead_area_support:"Pensão alimentícia",lead_area_consumer:"Consumidor",
  lead_area_banking:"Bancário",lead_area_health:"Saúde",lead_area_civil:"Cível e contratos",
  lead_area_labor:"Trabalhista",lead_area_social_security:"Previdenciário",lead_area_other:"Outro assunto"
};
const META_OLD_IDS: Record<string,string> ={
  sou_cliente:"m1_sou_cliente",cliente:"m1_sou_cliente",menu_cliente:"m1_sou_cliente",
  nao_sou_cliente:"m1_nao_sou_cliente",novo_cliente:"m1_nao_sou_cliente",lead:"m1_nao_sou_cliente",
  outros:"m1_outros",falar_com_equipe:"client_team",andamento:"client_last_movement",
  honorarios:"client_fees",documentos:"client_documents",agenda:"client_meeting"
};
function metaFallback(items:any[]){return "Para continuar, responda com o número da opção:\n"+items.map((x:any,i:number)=>(i+1)+". "+x.title).join("\n")}
async function metaLog(s:any,o:string,kind:string,payload:any,error:string){try{const {data:p}=await s.from("profiles").select("id").eq("org_id",o).in("role_key",["owner","admin"]).eq("status","active").order("created_at",{ascending:true}).limit(1).maybeSingle();if(!p?.id){console.error("META_EVENT_LOG_OWNER_MISSING",kind,error);return}await s.from("whatsapp_events").insert({org_id:o,event_type:kind,payload,processed:false,error_message:error||null,owner_user_id:p.id})}catch(e){console.error("META_EVENT_LOG_FAILED",e)}}
async function metaSendInteractive(s:any,o:string,cv:any,to:string,body:string,items:any[],kind:"button"|"list",imageHeader=false){
  const {token,phoneId}=await metaCfg(s),action=kind==="button"?{buttons:items.slice(0,3).map((x:any)=>({type:"reply",reply:{id:x.id,title:x.title}}))}:{button:"Ver opções",sections:[{title:"Opções",rows:items.slice(0,10).map((x:any)=>({id:x.id,title:x.title}))}]};
  const interactive:any={type:kind,body:{text:body},action};
  if(kind==="button"&&imageHeader){const logo=(await secret(s,"meta_whatsapp_header_logo_url"))||"https://raw.githubusercontent.com/eulampiosuzanne-stack/lexoffice/feat/meta-whatsapp-menu-flows/public/dama-justica-meta.png";if(/^https:\/\/\S+$/i.test(logo))interactive.header={type:"image",image:{link:logo}}}
  const request={messaging_product:"whatsapp",to,type:"interactive",interactive};
  const r=await fetch("https://graph.facebook.com/"+GV+"/"+phoneId+"/messages",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(request)});
  const result=await r.json().catch(()=>null);
  if(!r.ok){
    const err=String(result?.error?.message||"Falha ao enviar menu interativo pela Meta");
    await metaLog(s,o,"meta_interactive_send_failed",{conversation_id:cv.id,to,items:items.map((x:any)=>({id:x.id,title:x.title})),type:kind},err);
    const fallback=metaFallback(items);
    await sendMeta(s,to,fallback);
    await store(s,o,cv,null,fallback,true,"meta_numbered_fallback",{interactive_send_error:err,menu_type:kind});
    return {fallback:true,error:err};
  }
  const ids=items.map((x:any)=>x.id);
  await store(s,o,cv,String(result?.messages?.[0]?.id||"")||null,body,true,"meta_interactive_menu",{menu_type:kind,button_ids:ids,has_image_header:Boolean(interactive.header)});
  return {fallback:false};
}
async function metaText(s:any,o:string,cv:any,to:string,body:string,source="meta_menu"){
  await sendMeta(s,to,body);
  await store(s,o,cv,null,body,true,source);
}
async function metaSetFlow(s:any,o:string,cv:any,node:string,path:any={}){
  await s.from("whatsapp_chatbot_flow_state").upsert({conversation_id:cv.id,org_id:o,current_node:"meta_"+node,path:{...path,channel:"meta_whatsapp"},updated_at:new Date().toISOString()},{onConflict:"conversation_id"});
}
async function metaGetFlow(s:any,cv:any){
  const {data}=await s.from("whatsapp_chatbot_flow_state").select("current_node,path").eq("conversation_id",cv.id).maybeSingle();
  return String(data?.current_node||"").startsWith("meta_")?data:null;
}
async function metaClearFlow(s:any,cv:any){await s.from("whatsapp_chatbot_flow_state").delete().eq("conversation_id",cv.id)}
async function metaAlertAndHandoff(s:any,o:string,cv:any,c:any,from:string,reason:string,contextText:string,urgentFlag=false){
  const now=new Date().toISOString(),settings=(await s.from("whatsapp_settings").select("alert_phone").eq("org_id",o).maybeSingle()).data;
  const {data:owner}=await s.from("profiles").select("id,phone").eq("org_id",o).in("role_key",["owner","admin"]).eq("status","active").order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(owner?.id)try{await s.from("ai_agent_alerts").insert({org_id:o,agent_key:"helena",contact_phone:from,alert_phone:settings?.alert_phone||owner?.phone||from,reason,context:String(contextText||"").slice(0,1800),status:"pending",owner_user_id:owner.id})}catch(e){console.error("META_HANDOFF_ALERT_FAILED",e)}
  await s.from("whatsapp_conversations").update({bot_ativo:false,priority:urgentFlag?"high":"normal",conversation_owner:"HUMAN",owner_agent_key:null,human_takeover_at:now,human_takeover_reason:reason,owner_changed_at:now,updated_at:now}).eq("id",cv.id);
  await s.from("ai_conversation_controls").update({ai_enabled:false,human_takeover:true,human_takeover_at:now,resume_after_minutes:0,resume_at:null,updated_at:now}).eq("org_id",o).eq("contact_key",D(from));
}
async function metaClientMatches(s:any,o:string,ph:string,nameText:string=""){
  const {data}=await s.from("clients").select("id,name,phone,whatsapp,is_vip,status").eq("org_id",o).eq("status","active").limit(1000);
  const tail=D(ph).slice(-11);
  return (data||[]).filter((x:any)=>{
    const exact=[D(x.phone),D(x.whatsapp)].some((v:string)=>v&&(v===D(ph)||v.endsWith(tail)||D(ph).endsWith(v.slice(-11))));
    const named=!!nameText&&String(x.name||"").trim().toLocaleLowerCase("pt-BR")===nameText.trim().toLocaleLowerCase("pt-BR");
    return exact||named;
  });
}
async function metaNotify(s:any,o:string,cv:any,to:string,reason:string,text:string,urgentFlag=false){
  await metaAlertAndHandoff(s,o,cv,{},to,reason,text,urgentFlag);
  await metaText(s,o,cv,to,text,"meta_handoff_confirmation");
}
async function metaMainMenu(s:any,o:string,cv:any,to:string){
  await metaSetFlow(s,o,cv,"root",{});
  const logo=(await secret(s,"meta_whatsapp_header_logo_url"))||"https://raw.githubusercontent.com/eulampiosuzanne-stack/lexoffice/feat/meta-whatsapp-menu-flows/public/dama-justica-meta.png";
  await metaSendInteractive(s,o,cv,to,"Olá! Você está no atendimento da Suzanne Figueiredo Advocacia e Soluções Jurídicas. Para encaminhar seu atendimento, escolha uma opção.",META_MENU_ROOT,"button",Boolean(logo));
}
async function metaAreaMenu(s:any,o:string,cv:any,to:string){
  await metaSetFlow(s,o,cv,"lead_area",{});
  await metaSendInteractive(s,o,cv,to,"Será um prazer entender melhor seu caso. Escolha a área mais próxima do assunto.",META_MENU_AREAS,"list");
}
async function metaClientMenu(s:any,o:string,cv:any,to:string,name:string){
  await metaSendInteractive(s,o,cv,to,"Olá, "+(name||"tudo bem")+". Como podemos ajudar com seu atendimento?",META_MENU_CLIENT,"list");
}
async function metaAfterHours(s:any,o:string,cv:any,to:string,weekend:boolean){
  await metaSetFlow(s,o,cv,"afterhours_menu",{});
  const body=weekend
    ?"Hoje não é dia de atendimento regular. O retorno pode ocorrer no próximo dia útil, das 12h às 18h. Atendimentos fora desse horário podem ter taxa adicional. Se o assunto for urgente, avise agora para encaminharmos à Dra. Suzanne."
    :"No momento, estamos fora do horário de atendimento, das 12h às 18h, de segunda a sexta-feira. Atendimentos fora desse horário podem ter taxa adicional. Você pode pedir retorno no próximo horário útil ou avisar se o assunto for urgente.";
  await metaSendInteractive(s,o,cv,to,body,META_MENU_AFTER,"button");
}
async function metaProcessFlow(s:any,o:string,cv:any,c:any,from:string,menuId:string,text:string,flow:any,profileName:string|null){
  let selected=String(menuId||"");
  if(!selected&&/^\\d{1,2}$/.test(text.trim())&&flow){
    const n=Number(text.trim())-1;
    const options=flow.current_node==="meta_root"?META_MENU_ROOT:flow.current_node==="meta_client_menu"?META_MENU_CLIENT:flow.current_node==="meta_lead_area"?META_MENU_AREAS:flow.current_node==="meta_afterhours_menu"?META_MENU_AFTER:META_MENU_ROOT;
    if(n>=0&&n<options.length)selected=String(options[n].id);
  }
  if(selected==="menu_main"||selected==="afterhours_menu"||/^menu$/i.test(text.trim())){await metaClearFlow(s,cv);await metaMainMenu(s,o,cv,from);return true}
  if(selected==="m1_sou_cliente"||selected==="1"){
    const found=await metaClientMatches(s,o,from);
    if(found.length===1&&found[0].is_vip){
      const first=String(found[0].name||profileName||"").split(/\s+/)[0]||"";
      const greeting="Olá, "+(first||"tudo bem")+". Sua mensagem foi recebida e encaminhada à Dra. Suzanne. Ela continuará seu atendimento por aqui.";
      await metaAlertAndHandoff(s,o,cv,c,from,"vip_whatsapp_handoff",greeting,true);
      await metaText(s,o,cv,from,greeting,"meta_vip_greeting");await metaClearFlow(s,cv);return true;
    }
    if(found.length===1){await metaSetFlow(s,o,cv,"client_menu",{client_id:found[0].id,client_name:found[0].name});await metaClientMenu(s,o,cv,from,String(found[0].name||""));return true}
    await metaSetFlow(s,o,cv,"client_lookup",{});
    await metaText(s,o,cv,from,"Não localizei um cadastro único por este telefone. Envie seu nome completo e o número do processo, separados por barra.","meta_client_lookup");return true;
  }
  if(selected==="m1_nao_sou_cliente"||selected==="2"){await metaSetFlow(s,o,cv,"lead_area",{});await metaAreaMenu(s,o,cv,from);return true}
  if(selected==="m1_outros"||selected==="3"){await metaSetFlow(s,o,cv,"other_summary",{});await metaText(s,o,cv,from,"Por favor, resuma seu assunto em poucas palavras. Vou encaminhar sua mensagem à Dra. Suzanne.","meta_other_summary");return true}
  if(selected==="afterhours_urgent"){await metaNotify(s,o,cv,from,"urgent_after_hours",text||"Cliente marcou atendimento como urgente.",true);await metaClearFlow(s,cv);return true}
  if(selected==="afterhours_next"){await metaNotify(s,o,cv,from,"next_business_hours_return",text||"Cliente pediu retorno no próximo horário útil.");await metaClearFlow(s,cv);return true}
  if(META_AREA_BY_ID[selected]){
    await metaSetFlow(s,o,cv,"lead_name",{area:META_AREA_BY_ID[selected]});
    await metaText(s,o,cv,from,"Por favor, informe seu nome completo.","meta_lead_name");return true;
  }
  if(selected==="client_last_movement"||selected==="client_deadlines"||selected==="client_documents"||selected==="client_fees"||selected==="client_meeting"||selected==="client_team"){
    const clientId=flow?.path?.client_id;
    if(selected==="client_last_movement"&&clientId){
      const {data:ps}=await s.from("processes").select("id,cnj_number,internal_number").eq("org_id",o).eq("client_id",clientId).eq("status","active").limit(2);
      if((ps||[]).length===1){
        const {data:m}=await s.from("process_movements").select("movement_date,title,client_message").eq("org_id",o).eq("process_id",ps[0].id).eq("approved_for_client",true).eq("is_sensitive",false).order("movement_date",{ascending:false}).limit(1).maybeSingle();
        if(m){await metaText(s,o,cv,from,"A atualização mais recente do processo "+(ps[0].cnj_number||ps[0].internal_number||"")+" é de "+new Date(m.movement_date).toLocaleDateString("pt-BR")+": "+String(m.client_message||m.title||"Há uma nova movimentação registrada.").slice(0,900),"meta_last_movement");await metaClientMenu(s,o,cv,from,String(flow?.path?.client_name||""));return true}
      }
      await metaSetFlow(s,o,cv,"client_lookup",{client_id:clientId,client_name:flow?.path?.client_name||""});
      await metaText(s,o,cv,from,"Para localizar a atualização, envie o número do processo. Se preferir, informe seu nome completo e o número do processo.","meta_client_process_number");return true;
    }
    const label=String(META_MENU_CLIENT.find((x:any)=>x.id===selected)?.title||"");
    await metaSetFlow(s,o,cv,"client_handoff",{client_id:clientId||null,client_name:flow?.path?.client_name||""});
    await metaNotify(s,o,cv,from,"client_"+selected,"Pedido de cliente: "+label,true);
    await metaClearFlow(s,cv);return true;
  }
  if(flow?.current_node==="meta_client_lookup"){
    const value=text.trim(),parts=value.split(/[|/;]/).map((x:string)=>x.trim()),name=parts.length>1?parts[0]:"",caseNo=parts.length>1?parts.slice(1).join(" "):value;
    const matches=await metaClientMatches(s,o,from,name);
    const ids=matches.map((x:any)=>x.id);
    const {data:ps}=await s.from("processes").select("id,client_id,cnj_number,internal_number").eq("org_id",o).in("client_id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]).limit(1000);
    const digitsCase=D(caseNo),p=(ps||[]).find((x:any)=>D(x.cnj_number)===digitsCase||D(x.internal_number)===digitsCase);
    if(p){
      const {data:m}=await s.from("process_movements").select("movement_date,title,client_message").eq("org_id",o).eq("process_id",p.id).eq("approved_for_client",true).eq("is_sensitive",false).order("movement_date",{ascending:false}).limit(1).maybeSingle();
      if(m)await metaText(s,o,cv,from,"A atualização mais recente do processo é de "+new Date(m.movement_date).toLocaleDateString("pt-BR")+": "+String(m.client_message||m.title||"Há uma movimentação registrada.").slice(0,900),"meta_last_movement");
      else await metaText(s,o,cv,from,"Localizei o processo, mas não há uma atualização liberada para envio pelo WhatsApp. Vou encaminhar a consulta à equipe.","meta_process_no_public_update");

      await metaClearFlow(s,cv);return true;
    }
    await metaNotify(s,o,cv,from,"client_not_found","Não foi localizado cliente e processo com os dados enviados.");
    await metaClearFlow(s,cv);return true;
  }
  if(flow?.current_node==="meta_lead_name"){
    if(text.trim().length<3){await metaText(s,o,cv,from,"Não consegui identificar o nome. Por favor, envie seu nome completo.","meta_input_retry");return true}
    await metaSetFlow(s,o,cv,"lead_description",{...flow.path,name:text.trim()});
    await metaText(s,o,cv,from,"Em poucas palavras, conte o que aconteceu e como podemos ajudar.","meta_lead_description");return true;
  }
  if(flow?.current_node==="meta_lead_description"){
    const description=text.trim();if(description.length<4){await metaText(s,o,cv,from,"Por favor, descreva o assunto em poucas palavras para que a equipe possa encaminhar corretamente.","meta_input_retry");return true}
    const existingClients=await metaClientMatches(s,o,from);
    if(existingClients.length){await metaNotify(s,o,cv,from,"lead_phone_matches_client","Este telefone já pertence a um cliente. Confirmar se o caso deve ser vinculado ao cadastro existente.");await metaClearFlow(s,cv);return true}
    const {data:leadRows}=await s.from("leads").select("id,phone,whatsapp,notes").eq("org_id",o).limit(1000);const old=(leadRows||[]).find((x:any)=>[D(x.phone),D(x.whatsapp)].some((p:string)=>p&&(p===D(from)||p.endsWith(D(from).slice(-11))||D(from).endsWith(p.slice(-11)))));
    const {data:owner}=await s.from("profiles").select("id").eq("org_id",o).in("role_key",["owner","admin"]).eq("status","active").order("created_at",{ascending:true}).limit(1).maybeSingle();
    if(!owner?.id){await metaText(s,o,cv,from,"Recebemos seus dados, mas a equipe precisa concluir o cadastro. Já encaminhei a solicitação.","meta_lead_owner_missing");await metaAlertAndHandoff(s,o,cv,c,from,"lead_owner_missing",description);await metaClearFlow(s,cv);return true}
    const leadData={name:String(flow.path?.name||profileName||"Contato WhatsApp"),phone:D(from),whatsapp:D(from),origin:"whatsapp_meta",stage_key:"novo_lead",notes:"Área: "+String(flow.path?.area||"Não informada")+"\nResumo: "+description,owner_user_id:owner.id,org_id:o,is_demo:false};
    let leadId=old?.id||null;let saveError:any=null;if(old?.id){const saved=await s.from("leads").update({name:leadData.name,notes:[old.notes,leadData.notes].filter(Boolean).join("\n\n"),updated_at:new Date().toISOString()}).eq("id",old.id);saveError=saved.error}else{const saved=await s.from("leads").insert(leadData).select("id").single();leadId=saved.data?.id||null;saveError=saved.error}if(saveError){console.error("META_LEAD_SAVE_FAILED",saveError);await metaNotify(s,o,cv,from,"lead_registration_error","Não foi possível concluir o registro automático. A equipe recebeu o pedido.");await metaClearFlow(s,cv);return true}
    if(leadId)await s.from("whatsapp_conversations").update({lead_id:leadId}).eq("id",cv.id);
    await metaText(s,o,cv,from,"Obrigada, "+String(flow.path?.name||"").split(/\s+/)[0]+". Recebemos suas informações e encaminhamos para análise da equipe.","meta_lead_registered");
    await metaClearFlow(s,cv);return true;
  }
  if(flow?.current_node==="meta_other_summary"){
    if(text.trim().length<3){await metaText(s,o,cv,from,"Por favor, escreva um breve resumo para que eu possa encaminhar.","meta_input_retry");return true}
    await metaNotify(s,o,cv,from,"other_subject_handoff",text.trim());await metaClearFlow(s,cv);return true;
  }
  if(/^menu$/i.test(text.trim())){await metaMainMenu(s,o,cv,from);return true}
  if(selected){await metaClearFlow(s,cv);await metaMainMenu(s,o,cv,from);return true}
  return false;
}
async function handleMetaMenus(s:any,o:string,cv:any,c:any,ct:any,from:string,msg:any,interactiveId:string,text:string,profileName:string|null){
  const flow=await metaGetFlow(s,cv);
  const normalized=text.trim().toLocaleLowerCase("pt-BR");
  const isMenuWord=/^(menu|início|inicio|voltar ao menu)$/i.test(normalized);
  if(/^(kkk+|ok|aqui)$/i.test(normalized))return {handled:true,action:"ignored_short_ack"};
  const known=!!interactiveId;
  const id=interactiveId?String(META_OLD_IDS[interactiveId]||interactiveId):"";
  const firstMessages=await s.from("whatsapp_messages").select("id,direction").eq("conversation_id",cv.id).order("created_at",{ascending:true}).limit(2);
  const isFirstContact=firstMessages.data?.length===1&&firstMessages.data?.[0]?.direction==="inbound";
  const clientRows=await metaClientMatches(s,o,from);
  if(clientRows.length===1&&clientRows[0].is_vip&&!cv.human_takeover_at){
    const person=String(clientRows[0].name||profileName||"").split(/\s+/)[0]||"";
    const greeting="Olá, "+(person||"tudo bem")+". Sua mensagem foi recebida e encaminhada à Dra. Suzanne. Ela continuará seu atendimento por aqui.";
    await metaAlertAndHandoff(s,o,cv,c,from,"vip_whatsapp_handoff",greeting,true);
    await metaText(s,o,cv,from,greeting,"meta_vip_greeting");return {handled:true,action:"vip_handoff"};
  }
  const currentBusiness=await businessState(s,o);
  if(!currentBusiness.inHours&&urgent(text)&&!cv.human_takeover_at){
    await metaNotify(s,o,cv,from,"urgent_after_hours",text,true);
    return {handled:true,action:"urgent_handoff"};
  }
  if(isMenuWord||id||isFirstContact){
    const state=currentBusiness;
    if(!state.inHours&&!id.startsWith("afterhours_")&&flow?.current_node!=="meta_root"){
      await metaAfterHours(s,o,cv,from,["Sat","Sun"].includes(spNow().weekday));
      return {handled:true,action:"after_hours_menu"};
    }
    if(id==="m1_sou_cliente"||id==="m1_nao_sou_cliente"||id==="m1_outros"||id==="1"||id==="2"||id==="3"){
      const handled=await metaProcessFlow(s,o,cv,c,from,id,text,flow,profileName);return {handled,action:"menu_selection"};
    }
    if(id.startsWith("afterhours_")||id.startsWith("lead_area_")||id.startsWith("client_")||id==="menu_main"){
      const handled=await metaProcessFlow(s,o,cv,c,from,id,text,flow,profileName);return {handled,action:"menu_selection"};
    }
    if(isFirstContact||isMenuWord||known){await metaMainMenu(s,o,cv,from);return {handled:true,action:"main_menu"}}
  }
  if(flow){
    const handled=await metaProcessFlow(s,o,cv,c,from,id,text,flow,profileName);
    if(handled)return {handled:true,action:"flow_step"};
  }
  if(/(lig(a|ação|acao)|telefon(e|ar)|me chama por voz|me liga)/i.test(text)){
    await metaNotify(s,o,cv,from,"client_call_request",text);return {handled:true,action:"call_handoff"};
  }
  return {handled:false};
}

Deno.serve(async(req)=>{const u=new URL(req.url),s=db();if(req.method==='GET'){const e=await secret(s,'meta_webhook_secret');if(u.searchParams.get('hub.mode')==='subscribe'&&u.searchParams.get('hub.verify_token')===e)return new Response(u.searchParams.get('hub.challenge')||'');return j({ok:false},403)}if(req.method!=='POST')return j({ok:false},405);try{const e=await secret(s,'meta_webhook_secret');if(!e||u.searchParams.get('key')!==e)return j({ok:false},401);const body=await req.json().catch(()=>null),value=body?.entry?.[0]?.changes?.[0]?.value;if(!value)return j({ok:true,ignored:'no_value'});const o=await org(s),myId=await secret(s,'meta_whatsapp_phone_number_id');if(String(value?.metadata?.phone_number_id||'')!==myId)return j({ok:true,ignored:'other_number'});if(!value.messages?.length)return j({ok:true,ignored:'status_or_no_message'});const msg=value.messages[0],interactiveId=String(msg?.interactive?.button_reply?.id||msg?.interactive?.list_reply?.id||''),fromRaw=String(msg?.from||'').trim();if(!fromRaw)return j({ok:true,ignored:'no_from'});const eid=typeof msg?.id==='string'?msg.id:null,name=(value.contacts||[])[0]?.profile?.name||null,{cv,c,ct,ph}=await context(s,o,fromRaw,name);const myDisplay=D((await secret(s,'meta_whatsapp_display_number'))||'');if(myDisplay&&D(fromRaw)===myDisplay){const et=msg?.type==='text'?String(msg?.text?.body||'').trim():'[mensagem humana enviada pelo WhatsApp]';const fresh=await store(s,o,cv,eid,et||'[mensagem humana enviada pelo WhatsApp]',true,'meta_human_echo');if(fresh)await pause(s,cv,c,'operator_meta_message');return j({ok:true,action:'human_takeover_temporary'})}
let text='',audio=false,tp='';if(msg?.type==='text')text=String(msg?.text?.body||'').trim();else if(msg?.type==='interactive')text=String(msg?.interactive?.button_reply?.title||msg?.interactive?.list_reply?.title||'').trim();else if(msg?.type==='audio'&&msg?.audio?.id){audio=true;try{const tr=await transcribe(s,o,String(msg.audio.id),String(msg.audio.mime_type||''));text=tr.text;tp=tr.provider}catch(x){await store(s,o,cv,eid,'[Áudio recebido, mas não foi possível transcrever automaticamente.]',false,'meta_cloud_api',{original_type:'audio',transcribed:false,transcription_error:x instanceof Error?x.message:String(x)});return j({ok:true,action:'audio_transcription_failed'})}}if(!text)return j({ok:true,ignored:'unsupported'});const fresh=await store(s,o,cv,eid,audio?`[Áudio transcrito]\n${text}`:text,false,'meta_cloud_api',audio?{original_type:'audio',transcribed:true,transcription_provider:tp,transcription:text}:{});if(!fresh)return j({ok:true,ignored:'duplicate'});if(!(await gate(s,o,cv.id,ph)))return j({ok:true,action:'stored_no_ai'});const menuResult=await handleMetaMenus(s,o,cv,c,ct,fromRaw,msg,interactiveId,text,name);if(menuResult.handled)return j({ok:true,...menuResult});if(!(await gate(s,o,cv.id,ph)))return j({ok:true,action:'stored_no_ai'});if(msg?.type==='text')await new Promise(q=>setTimeout(q,25000));else await new Promise(q=>setTimeout(q,BURST_WAIT_MS));if(!(await latest(s,cv.id,eid)))return j({ok:true,action:'superseded'});const {data:br}=await s.from('whatsapp_messages').select('body,created_at').eq('conversation_id',cv.id).eq('direction','inbound').gte('created_at',new Date(Date.now()-45000).toISOString()).order('created_at',{ascending:true});const burst=(br||[]).map((m:any)=>String(m.body||'').trim()).filter(Boolean).join('\n'),rt=burst||text,bs=await businessState(s,o),client=await isClient(s,o,ct,ph),outside=!bs.inHours,uFlag=urgent(rt),human=wantsHuman(rt);let afterHours='';if(outside){afterHours=`FORA DO HORÁRIO REGULAR (12h às 18h, de segunda a sexta, horário de Brasília). Informe com cordialidade que atendimento fora desse horário pode ter taxa adicional, sem indicar valor. Ofereça retorno no próximo horário útil. Se a pessoa indicar urgência, avise a Dra. Suzanne imediatamente, antes de qualquer atendimento. Não prometa horário de ligação.`}
const agentKey=route(rt),{data:pol}=await s.from('ai_agent_policies').select('*').eq('org_id',o).eq('agent_key',agentKey).eq('active',true).maybeSingle();if(!pol)return j({ok:true,action:'agent_disabled'});const su=Deno.env.get('SUPABASE_URL')!,sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{data:h}=await s.from('whatsapp_messages').select('direction,body,created_at').eq('conversation_id',cv.id).order('created_at',{ascending:false}).limit(18),recent=(h||[]).reverse().map((m:any)=>(m.direction==='inbound'?'Cliente: ':'Escritório: ')+(m.body||'')).join('\n');const instructions=`Você conversa no WhatsApp em nome do escritório Suzanne Figueiredo Advocacia. Seu nome é Helena. Internamente você é ${agentKey}, mas jamais exponha agentes, IA, automação ou sistema. Seja natural, calorosa, objetiva e elegante. Responda em 1 a 3 pequenos parágrafos, no máximo uma pergunta por vez e normalmente 1 ou 2 emojis adequados. Trate mensagens consecutivas como uma única fala e gere UMA resposta. Não resgate contexto antigo desconexo. Nunca invente processo, andamento, agenda, pagamento, honorários ou resultado jurídico. ${afterHours} ${outside&&human&&!uFlag?'A pessoa pediu contato humano, mas NÃO declarou urgência. Não acione a Dra. Suzanne agora; continue o atendimento e, se necessário, registre o pedido para o próximo horário.':''} ${outside&&uFlag&&!client?'Há indicação de urgência e não é cliente ativo. Se a necessidade for falar imediatamente com a Dra. Suzanne, explique que pode haver taxa adicional, sem inventar valor, e ofereça retorno no próximo horário útil; se for urgência, avise a Dra. Suzanne imediatamente antes do atendimento.':''} ${(pol.system_prompt||'')}`;const r=await fetch(su+'/functions/v1/ai-provider-gateway',{method:'POST',headers:{Authorization:'Bearer '+sk,apikey:sk,'Content-Type':'application/json'},body:JSON.stringify({org_id:o,conversation_id:cv.id,agent_key:agentKey,purpose:'whatsapp_reply',provider:pol.provider||'auto',model:pol.model||'',instructions,input:recent})}),d=await r.json().catch(()=>null);let x=String(d?.text||'').trim().replace(/^```(?:json)?|```$/g,'').trim();try{const p=JSON.parse(x);if(p?.reply)x=String(p.reply).trim()}catch{}if(!r.ok||!x||x==='SEM_RESPOSTA')return j({ok:true,action:'no_reply'});if(!(await latest(s,cv.id,eid))||!(await gate(s,o,cv.id,ph)))return j({ok:true,action:'suppressed'});const ti=await typing(s,eid||''),dl=msg?.type==='text'?0:delay(rt,x);await new Promise(q=>setTimeout(q,dl));if(!(await latest(s,cv.id,eid))||!(await gate(s,o,cv.id,ph)))return j({ok:true,action:'suppressed_after_typing'});const full='Clara | Suzanne Figueiredo Advocacia\n\n'+x;await sendMeta(s,fromRaw,full);await store(s,o,cv,null,full,true,'meta_ai',{agent_key:agentKey,outside_business_hours:outside,recognized_client:client,urgency_detected:uFlag,human_requested:human,burst_message_count:(br||[]).length});return j({ok:true,action:'sent',agent:agentKey,outside_business_hours:outside,recognized_client:client,urgency_detected:uFlag,human_requested:human})}catch(x){console.error(x);return j({ok:false,error:x instanceof Error?x.message:String(x)},500)}});
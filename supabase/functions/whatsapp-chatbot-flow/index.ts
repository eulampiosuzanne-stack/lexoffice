import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
// v31 — MENU ÚNICO. O menu vem de whatsapp_chatbot_flow_config.flow.nodes (salvo no banco / tela).
// Se não houver nada salvo, usa o DEFAULT abaixo. Envio E leitura das respostas usam a mesma fonte.
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const D=(v:any)=>String(v??'').replace(/\D/g,'');
const A=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu,' ').replace(/\s+/g,' ').trim();
async function secret(a:any,k:string){const {data}=await a.from('system_runtime_secrets').select('secret').eq('key',k).maybeSingle();return String(data?.secret||'').trim()}
async function cfg(a:any){const base=(await secret(a,'evolution_api_url')).replace(/\/+$/,''),key=await secret(a,'evolution_api_key');if(!/^https:\/\//.test(base)||!key)throw new Error('Evolution não configurada');const {data:i}=await a.from('whatsapp_evolution_instances').select('status,is_active').eq('instance_name','suzanne-lexoffice').maybeSingle();if(i?.status!=='connected'||i?.is_active!==true)throw new Error('Evolution desconectada');return {base,key,instance:'suzanne-lexoffice'}}
type O={id:string,label:string,description?:string,next?:string,agent?:string,reply?:string,ctx?:Record<string,unknown>};type N={message:string,options:O[],image?:string};
const back:O={id:'menu',label:'↩️ Voltar ao menu',next:'start'};
export const DEFAULT_NODES:Record<string,N>={
  start:{message:'Olá! 👋 Seja bem-vindo(a) ao escritório Suzanne Figueiredo Advocacia e Soluções Jurídicas.\n\nEscolha uma opção:',image:'https://lexoffice-ashy.vercel.app/file_000000003d3c820ea01435d641ac6df8.png',options:[
    {id:'process',label:'⚖️ Meu processo',agent:'client_process_updates'},
    {id:'new',label:'✨ Novo caso',next:'new'},
    {id:'finance',label:'💳 Financeiro',agent:'billing'},
    {id:'schedule',label:'📅 Agendamento',agent:'client_schedule_relationship'},
    {id:'docs',label:'📎 Documentos',agent:'client_service_triage'},
    {id:'team',label:'👩‍⚖️ Falar com a equipe',agent:'client_service_triage'},
    {id:'urgent',label:'🚨 Urgência',next:'urgent'}]},
  new:{message:'Qual assunto mais se aproxima do que você precisa?',options:[
    {id:'family',label:'👨‍👩‍👧 Família e Sucessões',agent:'client_service_triage'},
    {id:'labor',label:'👷 Trabalhista',agent:'client_service_triage'},
    {id:'consumer',label:'🛒 Consumidor',agent:'client_service_triage'},
    {id:'bank',label:'🏦 Bancário / Dívidas',agent:'client_service_triage'},
    {id:'health',label:'🏥 Saúde / Plano de saúde',agent:'client_service_triage'},
    {id:'property',label:'🏠 Imóveis',agent:'client_service_triage'},
    {id:'criminal',label:'🚔 Criminal',agent:'client_service_triage'},
    {id:'other',label:'📄 Outro assunto',agent:'client_service_triage'},back]},
  urgent:{message:'🚨 Qual é a situação?',options:[
    {id:'violence',label:'🛡️ Violência / medida protetiva',agent:'client_service_triage'},
    {id:'criminal',label:'🚔 Prisão, delegacia ou audiência',agent:'client_service_triage'},
    {id:'minor',label:'👶 Criança ou adolescente em risco',agent:'client_service_triage'},
    {id:'health',label:'🏥 Urgência de saúde',agent:'client_service_triage'},
    {id:'property',label:'🏠 Despejo ou retirada imediata',agent:'client_service_triage'},
    {id:'deadline',label:'⏰ Prazo que vence hoje',agent:'client_service_triage'},
    {id:'other',label:'⚠️ Outra situação urgente',agent:'client_service_triage'},back]},
  restricted:{message:'Identificamos uma pendência financeira vinculada ao seu atendimento.\n\nPara que possamos direcioná-lo adequadamente, selecione uma das opções abaixo:\n\n💳 Regularizar questão financeira\n🚨 Comunicar urgência',options:[
    {id:'finance',label:'💳 Regularizar questão financeira',agent:'billing',ctx:{restricted_service:true}},
    {id:'urgent',label:'🚨 Comunicar urgência',next:'restricted_urgent'}]},
  restricted_urgent:{message:'🚨 Esta opção é exclusiva para situação com risco à vida ou à integridade física.\n\nDescreva, em uma mensagem, o que está acontecendo. A informação será encaminhada para análise prioritária.',options:[]},
  restricted_urgent_received:{message:'Recebemos sua comunicação de urgência. A informação foi encaminhada para análise prioritária. A restrição do atendimento permanece ativa.',options:[]},
  process_delivery_followup:{message:'Você entendeu o andamento enviado ou deseja que eu explique melhor?',options:[
    {id:'understood',label:'✅ Entendi',reply:'Perfeito! Se surgir qualquer dúvida, é só me chamar por aqui.'},
    {id:'explain',label:'❓ Quero explicações',agent:'client_process_updates'}]},
  collection_followup:{message:'Como deseja tratar esta pendência?',options:[
    {id:'pix',label:'💠 Receber chave PIX',agent:'billing',ctx:{collection_action:'pix'}},
    {id:'negotiate_amount',label:'💬 Negociar valor',agent:'billing',ctx:{collection_action:'negotiate_amount',negotiation_stage:'awaiting_proposal',negotiation_kind:'amount'}},
    {id:'negotiate_date',label:'📅 Negociar data',agent:'billing',ctx:{collection_action:'negotiate_date',negotiation_stage:'awaiting_proposal',negotiation_kind:'date'}},
    {id:'paid',label:'✅ Já paguei',agent:'billing',ctx:{collection_action:'paid'}},
    {id:'other',label:'👩‍⚖️ Outra opção',agent:'billing',ctx:{collection_action:'other'}}]},
  collection_interest_confirmation:{message:'Deseja seguir com essa proposta?',options:[
    {id:'accept',label:'✅ Aceito',agent:'billing',ctx:{collection_action:'accept'}},
    {id:'reject',label:'❌ Não aceito',agent:'billing',ctx:{collection_action:'reject'}},
    {id:'counter',label:'💬 Fazer proposta',agent:'billing',ctx:{collection_action:'counter',negotiation_stage:'awaiting_proposal',negotiation_kind:'amount'}},
    {id:'human',label:'👩‍⚖️ Falar com responsável',agent:'billing',ctx:{collection_action:'human'}}]},
};
async function loadNodes(a:any,orgId:string):Promise<{nodes:Record<string,N>,enabled:boolean}>{
  const {data}=await a.from('whatsapp_chatbot_flow_config').select('enabled,flow').eq('org_id',orgId).maybeSingle();
  const saved=data?.flow?.nodes&&typeof data.flow.nodes==='object'?data.flow.nodes:{};
  return {nodes:{...DEFAULT_NODES,...saved},enabled:data?.enabled!==false};
}
// Resolve a resposta do cliente: 1) id do botão ("no:opcao" ou "opcao"); 2) número da opção; 3) texto igual ao rótulo.
function resolve(nodes:Record<string,N>,node:string,choice:string,text:string):{node:string,opt:O}|null{
  const c=String(choice||'').trim();
  if(c.includes(':')){const [n,id]=c.split(':');const o=nodes[n]?.options.find(x=>x.id===id);if(o)return {node:n,opt:o}}
  const cur=nodes[node];if(!cur)return null;
  if(c){const o=cur.options.find(x=>x.id===c);if(o)return {node,opt:o}}
  const t=norm(text||c);if(!t)return null;
  if(/^\d{1,2}$/.test(t)){const o=cur.options[Number(t)-1];if(o)return {node,opt:o}}
  const o=cur.options.find(x=>norm(x.label)===t);
  return o?{node,opt:o}:null;
}
async function blocked(a:any,o:string,id:string|null,p:string){if(id){const {data:v}=await a.from('whatsapp_conversations').select('bot_ativo,conversation_owner,last_human_outbound_at,human_takeover_at').eq('org_id',o).eq('id',id).maybeSingle();if(v?.bot_ativo===false||v?.conversation_owner==='HUMAN')return 'human_owner';const ts=v?.last_human_outbound_at;if(ts&&Date.now()-new Date(ts).getTime()<20*60000)return 'human_cooldown'}const {data:c}=await a.from('ai_conversation_controls').select('ai_enabled,human_takeover,resume_at').eq('org_id',o).eq('contact_key',D(p)).maybeSingle();if(c?.human_takeover===true||c?.ai_enabled===false){if(c?.resume_at&&Date.now()>=new Date(c.resume_at).getTime())return null;return 'human_takeover'}return null}
async function sendNode(a:any,o:string,id:string|null,p:string,key:string,x:N){
 const options=x.options.map((v,i)=>String(i+1)+'. '+v.label+(v.description?'\n   '+v.description:'')).join('\n\n');
 const message=x.message+(options?'\n\n'+options:'')+'\n\nResponda com o número da opção.';
 const sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const response=await fetch(Deno.env.get('SUPABASE_URL')!+'/functions/v1/whatsapp-outbound-gate',{method:'POST',headers:{Authorization:'Bearer '+sk,apikey:sk,'Content-Type':'application/json'},body:JSON.stringify({org_id:o,conversation_id:id,phone:D(p),message,agent_key:'helena_chatbot',idempotency_key:'chatbot:'+String(id||D(p))+':'+key+':'+Math.floor(Date.now()/120000),format_agent_reply:false}),signal:AbortSignal.timeout(16000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data?.ok||data?.allowed!==true)throw new Error('Envio bloqueado: '+String(data?.reason||data?.error||response.status));
 return data.provider_response||data;
}
async function logOut(a:any,o:string,id:string|null,body:string,key:string,resp:any){if(!id||key==='process_delivery_followup'||key==='collection_followup')return;try{await a.from('whatsapp_messages').insert({org_id:o,conversation_id:id,direction:'outbound',message_type:'interactive',body,status:'sent',external_message_id:String(resp?.zaapId||resp?.messageId||resp?.id||'')||null,sent_at:new Date().toISOString(),metadata:{source:'chatbot_menu',node:key}})}catch{}}
Deno.serve(async req=>{if(req.method!=='POST')return J({ok:false},405);try{
  const sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if((req.headers.get('authorization')||'')!==`Bearer ${sk}`)return J({ok:false},401);
  const b=await req.json().catch(()=>({})),o=String(b.org_id||''),id=b.conversation_id?String(b.conversation_id):null,p=String(b.phone||''),k=String(b.node||'start'),ch=String(b.choice||''),tx=String(b.text||'');
  let path:any[]=Array.isArray(b.path)?b.path:[];
  if(!o||!p)return J({ok:false,error:'org_id e phone obrigatórios'},400);
  const a=A();const {nodes,enabled}=await loadNodes(a,o);
  if(b.action==='nodes')return J({ok:true,nodes:Object.keys(nodes)});
  if(b.action==='preview'){
    const x=nodes[k];if(!x)return J({ok:false,error:'node_not_found'},404);
    const result=(ch||tx)?resolve(nodes,k,ch,tx):null;
    const chosen=result?.opt||null;
    return J({ok:true,preview:true,enabled, node:k,message:x.message,options:x.options.map((v:any,i:number)=>({number:i+1,id:v.id,label:v.label,description:v.description||'',next:v.next||null,agent:v.agent||null})),matched:Boolean(result),selected:chosen?{id:chosen.id,label:chosen.label,next:chosen.next||null,agent:chosen.agent||null}:null});
  }

  if(!enabled)return J({ok:true,blocked:true,reason:'flow_disabled',path});
  const why=await blocked(a,o,id,p);if(why)return J({ok:true,blocked:true,reason:why,path});
  if(ch||tx){
    const r=resolve(nodes,k,ch,tx);
    if(!r)return J({ok:true,matched:false,node:k,known_node:Boolean(nodes[k])});
    const z=r.opt;
    if(z.id==='menu')path=[];else path=[...path,{node:r.node,choice:z.id,label:z.label}];
    if(z.reply){const resp=await sendNode(a,o,id,p,'reply_'+r.node,{message:z.reply,options:[]});await logOut(a,o,id,z.reply,r.node,resp);return J({ok:true,matched:true,replied:true,node:'agent_conversation',path})}
    if(z.agent){const urgent=path.some((s:any)=>s.node==='urgent');return J({ok:true,matched:true,handoff:true,agent_key:z.agent,selected:{node:r.node,choice:z.id,label:z.label},next_node:'agent_conversation',path,context:{path,summary:path.map((s:any)=>String(s.label).replace(/^[^\p{L}\p{N}]+/u,'').trim()).join(' → '),profile:path[0]?.choice||null,urgent,...(z.ctx||{})}})}
    if(z.next){const x=nodes[z.next];if(!x)return J({ok:false,error:`nó inexistente: ${z.next}`},400);const resp=await sendNode(a,o,id,p,z.next,x);return J({ok:true,matched:true,node:z.next,path,provider_response:resp})}
    return J({ok:true,matched:false,node:k});
  }
  const x=nodes[k];if(!x)return J({ok:false,error:`nó inexistente: ${k}`},400);
  const resp=await sendNode(a,o,id,p,k,x);
  return J({ok:true,node:k,path,provider_response:resp});
}catch(e){return J({ok:false,error:e instanceof Error?e.message:String(e)},500)}});

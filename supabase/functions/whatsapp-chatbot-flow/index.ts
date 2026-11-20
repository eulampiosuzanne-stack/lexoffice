import { receptionMessages } from './reception-messages.mjs';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
// v65 (20/11/2026) — etiquetas internas de assunto/prioridade pelos botões (catálogo §20/22).
// v64 (20/11/2026) — catálogo bloco A: botões "Já sou cliente / Busco atendimento / Outros assuntos"; "prefiro não usar o menu" responde 03.
// v63 (20/11/2026) — digitar "menu" reabre a recepção e solta o agente anterior.
// v52 (13/11/2026) — MENU ELEGANTE: cada nó sai como LISTA interativa (emoji + título curto + descrição curta),
// sem números soltos. Se o WhatsApp/WAHA não aceitar a lista, o gate manda texto com o mesmo visual.
// Resposta aceita: toque na lista, o nome da opção escrito, ou número (compatibilidade). Texto livre segue para a Helena.
// v31 — MENU ÚNICO. O menu vem de whatsapp_chatbot_flow_config.flow.nodes (salvo no banco / tela).
// Se não houver nada salvo, usa o DEFAULT abaixo. Envio E leitura das respostas usam a mesma fonte.
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const D=(v:any)=>String(v??'').replace(/\D/g,'');
const A=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu,' ').replace(/\s+/g,' ').trim();
async function secret(a:any,k:string){const {data}=await a.from('system_runtime_secrets').select('secret').eq('key',k).maybeSingle();return String(data?.secret||'').trim()}
type O={id:string,label:string,description?:string,next?:string,agent?:string,reply?:string,ctx?:Record<string,unknown>};type N={message:string,options:O[],image?:string,section?:string,button?:string};
const back:O={id:'menu',label:'↩️ Menu inicial',description:'Voltar às opções principais',next:'start'};
const T='client_service_triage';
export const DEFAULT_NODES:Record<string,N>={
  start:{message:'Seja bem-vindo ao Suzanne Figueiredo Advocacia e Soluções Jurídicas.\n\nSou Helena. Como posso ajudar você hoje?',button:'Opções de atendimento',section:'Como podemos ajudar',options:[
    {id:'process',label:'📂 Meus processos',description:'Andamento, audiências e próximos passos',next:'processos'},
    {id:'docs',label:'📄 Documentos',description:'Enviar, receber ou consultar documentos',next:'documentos'},
    {id:'finance',label:'💳 Financeiro',description:'Parcelas, Pix e comprovantes',next:'financeiro'},
    {id:'schedule',label:'📅 Agendamentos',description:'Marcar, remarcar ou cancelar reunião',next:'agendamentos'},
    {id:'urgent',label:'🚨 Urgência',description:'Situação que não pode esperar',next:'urgent'},
    {id:'lawyer',label:'👩‍⚖️ Falar com a Dra.',description:'Agendar conversa com a Dra. Suzanne',next:'advogada'},
    {id:'new',label:'✨ Novo caso',description:'Primeira consulta com o escritório',next:'new'}]},
  processos:{message:'📂 *Meus processos*\n\nO que você gostaria de saber?',section:'Meus processos',options:[
    {id:'last',label:'🔔 Último andamento',description:'O que aconteceu por último no processo',agent:'client_process_updates'},
    {id:'hearing',label:'🗓️ Próxima audiência',description:'Data, horário e como participar',agent:'client_process_updates'},
    {id:'question',label:'💬 Tirar uma dúvida',description:'Pergunte sobre o seu processo',agent:'client_process_updates'},back]},
  documentos:{message:'📄 *Documentos*\n\nComo podemos ajudar com os seus documentos?',section:'Documentos',options:[
    {id:'send',label:'📤 Enviar documento',description:'Mande fotos ou PDFs pedidos pelo escritório',agent:T,ctx:{docs_action:'send'}},
    {id:'receive',label:'📥 Receber documento',description:'Cópia de contrato, petição ou decisão',agent:T,ctx:{docs_action:'receive'}},
    {id:'pending',label:'📋 Pendências',description:'Veja o que ainda falta entregar',agent:T,ctx:{docs_action:'pending'}},back]},
  financeiro:{message:'💳 *Financeiro*\n\nEscolha o assunto:',section:'Financeiro',options:[
    {id:'installments',label:'🧾 Minhas parcelas',description:'Valores e próximos vencimentos',agent:'billing'},
    {id:'pix',label:'💠 Chave Pix',description:'Dados para pagamento',agent:'billing',ctx:{collection_action:'pix'}},
    {id:'paid',label:'✅ Enviar comprovante',description:'Informe um pagamento já feito',agent:'billing',ctx:{collection_action:'paid'}},back]},
  agendamentos:{message:'📅 *Agendamentos*\n\nO que você precisa?',section:'Agendamentos',options:[
    {id:'book',label:'🗓️ Agendar reunião',description:'Escolha um horário disponível',agent:'client_schedule_relationship'},
    {id:'reschedule',label:'🔄 Remarcar',description:'Mudar a data ou o horário',agent:'client_schedule_relationship'},
    {id:'cancel',label:'❌ Cancelar',description:'Desmarcar um compromisso',agent:'client_schedule_relationship'},back]},
  advogada:{message:'👩‍⚖️ *Falar com a Dra. Suzanne*\n\nOs atendimentos com a Dra. são agendados. Escolha uma opção:',section:'Dra. Suzanne',options:[
    {id:'book',label:'📅 Agendar com a Dra.',description:'Reunião online no período da tarde',agent:'client_schedule_relationship',ctx:{lawyer_talk:true}},
    {id:'note',label:'📝 Deixar recado',description:'Registramos e a Dra. retorna',agent:T,ctx:{lawyer_note:true}},back]},
  new:{message:'✨ *Novo caso*\n\nQual assunto mais se aproxima do que você precisa?',section:'Áreas',options:[
    {id:'family',label:'👨‍👩‍👧 Família',description:'Divórcio, pensão, guarda e inventário',agent:T},
    {id:'health',label:'🏥 Saúde',description:'Plano de saúde, erro médico, medicamentos',agent:T},
    {id:'consumer',label:'🛒 Consumidor',description:'Compras, bancos e cobranças indevidas',agent:T},
    {id:'social',label:'🏛️ Previdenciário',description:'Aposentadoria e benefícios do INSS',agent:T},
    {id:'labor',label:'💼 Trabalhista',description:'Direitos no emprego',agent:T},
    {id:'property',label:'🏠 Imóveis',description:'Compra, aluguel e usucapião',agent:T},
    {id:'other',label:'📄 Outro assunto',description:'Conte em poucas palavras',agent:T},back]},
  urgent:{message:'🚨 *Urgência*\n\nQual é a situação? Se houver risco imediato à vida, ligue 190.',section:'Urgência',options:[
    {id:'violence',label:'🛡️ Violência ou ameaça',description:'Medida protetiva ou risco à integridade',agent:T},
    {id:'prison',label:'🚔 Prisão ou delegacia',description:'Prisão, flagrante ou custódia',agent:T},
    {id:'minor',label:'👶 Criança em risco',description:'Criança ou adolescente em perigo',agent:T},
    {id:'health',label:'🏥 Urgência de saúde',description:'Atendimento médico ou plano de saúde',agent:T},
    {id:'property',label:'🏠 Despejo',description:'Retirada imediata do imóvel',agent:T},
    {id:'deadline',label:'⏰ Prazo hoje',description:'Prazo que vence hoje',agent:T},
    {id:'other',label:'⚠️ Outra urgência',description:'Descreva o que está acontecendo',agent:T},back]},
  restricted:{message:'Identificamos uma pendência financeira vinculada ao seu atendimento.\n\nEscolha como deseja seguir:',section:'Atendimento',options:[
    {id:'finance',label:'💳 Regularizar',description:'Tratar a pendência financeira',agent:'billing',ctx:{restricted_service:true}},
    {id:'urgent',label:'🚨 Comunicar urgência',description:'Somente risco à vida ou à integridade',next:'restricted_urgent'}]},
  restricted_urgent:{message:'🚨 Esta opção é exclusiva para situação com risco à vida ou à integridade física.\n\nDescreva, em uma mensagem, o que está acontecendo. A informação será encaminhada para análise prioritária.',options:[]},
  restricted_urgent_received:{message:'Recebemos sua comunicação de urgência. A informação foi encaminhada para análise prioritária. A restrição do atendimento permanece ativa.',options:[]},
  process_delivery_followup:{message:'Você entendeu o andamento enviado ou deseja que eu explique melhor?',options:[
    {id:'understood',label:'✅ Entendi',description:'Está tudo claro',reply:receptionMessages.understood},
    {id:'explain',label:'❓ Quero explicações',description:'Explicar com mais detalhes',agent:'client_process_updates'}]},
  collection_followup:{message:'Como deseja tratar esta pendência?',options:[
    {id:'pix',label:'💠 Receber chave PIX',description:'Dados para pagamento',agent:'billing',ctx:{collection_action:'pix'}},
    {id:'negotiate_amount',label:'💬 Negociar valor',description:'Enviar uma proposta de valor',agent:'billing',ctx:{collection_action:'negotiate_amount',negotiation_stage:'awaiting_proposal',negotiation_kind:'amount'}},
    {id:'negotiate_date',label:'📅 Negociar data',description:'Propor outra data',agent:'billing',ctx:{collection_action:'negotiate_date',negotiation_stage:'awaiting_proposal',negotiation_kind:'date'}},
    {id:'paid',label:'✅ Já paguei',description:'Informar pagamento feito',agent:'billing',ctx:{collection_action:'paid'}},
    {id:'other',label:'👩‍⚖️ Outra opção',description:'Falar sobre outra alternativa',agent:'billing',ctx:{collection_action:'other'}}]},
  collection_interest_confirmation:{message:'Deseja seguir com essa proposta?',options:[
    {id:'accept',label:'✅ Aceito',agent:'billing',ctx:{collection_action:'accept'}},
    {id:'reject',label:'❌ Não aceito',agent:'billing',ctx:{collection_action:'reject'}},
    {id:'counter',label:'💬 Fazer proposta',agent:'billing',ctx:{collection_action:'counter',negotiation_stage:'awaiting_proposal',negotiation_kind:'amount'}},
    {id:'human',label:'👩‍⚖️ Responsável',description:'Falar com o escritório',agent:'billing',ctx:{collection_action:'human'}}]},
};
const LABEL_BY_NODE:Record<string,string>={processos:'assunto:processual',documentos:'assunto:documentos',financeiro:'assunto:financeiro',agendamentos:'assunto:agendamento',urgent:'prioridade:urgencia_triagem'};
const LABEL_BY_OPTION:Record<string,string>={'agendamentos:note':'assunto:recado_advogada','advogada:note':'assunto:recado_advogada','advogada:book':'assunto:agendamento','reception_other:partnership':'assunto:parceria','reception_other:administrative':'assunto:administrativo'};
const oUsesReceptionMenu=(orgId:string)=>orgId==='b3dd3ed0-2a05-4087-8220-307a44352cec';
async function loadNodes(a:any,orgId:string):Promise<{nodes:Record<string,N>,enabled:boolean,render:string}>{
  const {data}=await a.from('whatsapp_chatbot_flow_config').select('enabled,flow').eq('org_id',orgId).maybeSingle();
  const saved=data?.flow?.nodes&&typeof data.flow.nodes==='object'?data.flow.nodes:{};
  const nodes:Record<string,N>={...DEFAULT_NODES,...saved};
  if(oUsesReceptionMenu(orgId)){
    const previous=nodes.start;
    // Modo botão (WhatsApp: até 3 botões, só título): cada tela com no máximo 3 opções, sem "Mais opções".
    nodes.reception_client={message:'Como podemos ajudar com seu atendimento?',options:[
      {id:'process',label:'📂 Meus processos',description:'Andamento e audiências',next:'processos'},
      {id:'finance',label:'💳 Financeiro',description:'Parcelas, Pix e comprovantes',next:'financeiro'},
      {id:'more',label:'➕ Outros pedidos',description:'Documentos, agenda e urgência',next:'client_more'}]};
    nodes.client_more={message:'O que você precisa?',options:[
      {id:'docs',label:'📄 Documentos',description:'Enviar, receber ou consultar',next:'documentos'},
      {id:'schedule',label:'📅 Agenda e recado',description:'Agendar ou deixar recado',next:'agendamentos'},
      {id:'urgent',label:'🚨 Urgência',description:'Situação que não pode esperar',next:'urgent'}]};
    nodes.processos={message:'Sobre o seu processo, o que você precisa?',options:[
      {id:'last',label:'🔔 Último andamento',agent:'client_process_updates'},
      {id:'hearing',label:'🗓️ Próxima audiência',agent:'client_process_updates'},
      {id:'question',label:'💬 Tirar uma dúvida',agent:'client_process_updates'}]};
    nodes.documentos={message:'O que você precisa sobre documentos?',options:[
      {id:'send',label:'📤 Enviar documento',agent:T,ctx:{docs_action:'send'}},
      {id:'receive',label:'📥 Receber documento',agent:T,ctx:{docs_action:'receive'}},
      {id:'pending',label:'📋 Pendências',agent:T,ctx:{docs_action:'pending'}}]};
    nodes.financeiro={message:'Sobre o financeiro, o que você precisa?',options:[
      {id:'installments',label:'🧾 Minhas parcelas',agent:'billing'},
      {id:'pix',label:'💠 Chave Pix',reply:receptionMessages.pix_team},
      {id:'paid',label:'✅ Enviar comprovante',agent:'billing',ctx:{collection_action:'paid'}}]};
    nodes.agendamentos={message:'Como podemos ajudar com a agenda?',options:[
      {id:'book',label:'🗓️ Agendar reunião',agent:'client_schedule_relationship'},
      {id:'change',label:'🔄 Remarcar/cancelar',agent:'client_schedule_relationship'},
      {id:'note',label:'📝 Recado pelo app',reply:receptionMessages.app_note}]};
    nodes.new={message:'Qual assunto mais se aproxima do que você precisa?',options:[
      {id:'health',label:'🏥 Saúde',agent:T},
      {id:'consumer',label:'🛒 Consumidor',agent:T},
      {id:'more',label:'➕ Outras áreas',next:'new_more'}]};
    nodes.new_more={message:'Qual área mais se aproxima?',options:[
      {id:'family',label:'👨‍👩‍👧 Família',agent:T},
      {id:'labor',label:'💼 Trabalho e INSS',agent:T},
      {id:'other',label:'📄 Outro assunto',agent:T}]};
    nodes.urgent={message:'🚨 Qual é a situação? Se houver risco imediato à vida, ligue 190.',options:[
      {id:'risk',label:'🛡️ Risco à pessoa',agent:T},
      {id:'custody',label:'🚔 Prisão ou despejo',agent:T},
      {id:'deadline',label:'⏰ Prazo ou outra',agent:T}]};
    nodes.reception_other={message:'Qual assunto você gostaria de tratar?',options:[
      {id:'partnership',label:'🤝 Parcerias',description:'Apresentar uma proposta de parceria',agent:T},
      {id:'administrative',label:'🏢 Administrativo',description:'Informações sobre o escritório',agent:T},
      {id:'professional',label:'👨‍⚖️ Sou advogado(a)',description:'Contato entre colegas e correspondência.',agent:T,ctx:{contact_type:'advogado'}}
    ]};
    nodes.start={message:receptionMessages.welcome,section:'Atendimento',button:'Opções de atendimento',options:[
      {id:'existing',label:'👤 Já sou cliente',description:'Processos, financeiro, documentos e agenda.',next:'reception_client'},
      {id:'prospect',label:'⚖️ Busco atendimento',description:'Quero atendimento jurídico.',next:'new'},
      {id:'other',label:'💬 Outros assuntos',description:'Parcerias, imprensa e administrativo.',next:'reception_other'}
    ]};
    nodes.advogada={message:receptionMessages.busy,options:[
      {id:'book',label:'📅 Ver horários',description:'Verificar disponibilidade para o próximo dia útil',agent:'client_schedule_relationship',ctx:{lawyer_talk:true}},
      {id:'note',label:'📝 Recado pelo app',description:'Enviar um recado direto à Dra. Suzanne',reply:receptionMessages.app_note},back
    ]};
  }
  return {nodes,enabled:data?.enabled!==false,render:data?.flow?.render==='text'?'text':'list'};
}
// Resolve a resposta do cliente: 1) id da linha ("no:opcao" ou "opcao"); 2) nome da opção escrito (com ou sem emoji); 3) número (compatibilidade).
function resolve(nodes:Record<string,N>,node:string,choice:string,text:string):{node:string,opt:O}|null{
  const c=String(choice||'').trim();
  for(const v of [c,String(text||'').trim()]){if(/^[a-z_]+:[a-z_]+$/i.test(v)){const [n,id]=v.split(':');const o=nodes[n]?.options.find(x=>x.id===id);if(o)return {node:n,opt:o}}}
  const cur=nodes[node];if(!cur)return null;
  if(c){const o=cur.options.find(x=>x.id===c);if(o)return {node,opt:o}}
  const t=norm(text||c);if(!t)return null;
  if(/^\d{1,2}$/.test(t)){const o=cur.options[Number(t)-1];if(o)return {node,opt:o}}
  let o=cur.options.find(x=>norm(x.label)===t||(node==='start'&&((x.id==='existing'&&t==='sou cliente')||(x.id==='prospect'&&t==='nao sou cliente'))));
  // Nome da opção dentro de uma frase curta ("quero meus processos"); frases longas ficam com a Helena.
  if(!o&&node!=='start'&&t.length<=40)o=cur.options.find(x=>{const l=norm(x.label);return l.length>=5&&t.includes(l)});
  return o?{node,opt:o}:null;
}
async function blocked(a:any,o:string,id:string|null,p:string){if(id){const {data:v}=await a.from('whatsapp_conversations').select('bot_ativo,conversation_owner,last_human_outbound_at,human_takeover_at').eq('org_id',o).eq('id',id).maybeSingle();if(v?.bot_ativo===false||v?.conversation_owner==='HUMAN')return 'human_owner';const ts=v?.last_human_outbound_at;if(ts&&Date.now()-new Date(ts).getTime()<20*60000)return 'human_cooldown'}const {data:c}=await a.from('ai_conversation_controls').select('ai_enabled,human_takeover,resume_at').eq('org_id',o).eq('contact_key',D(p)).maybeSingle();if(c?.human_takeover===true||c?.ai_enabled===false){if(c?.resume_at&&Date.now()>=new Date(c.resume_at).getTime())return null;return 'human_takeover'}return null}
function menuInteractive(key:string,x:N,render:string){
  return {type:'list',style:'menu',prefer:render,header:'',body:x.message,button:x.button||'Ver opções',section:x.section||'Opções',footer:'Ou escreva sua mensagem',
    rows:x.options.slice(0,10).map(v=>({id:key+':'+v.id,title:v.label,description:render==='text'?'':(v.description||'')}))};
}
async function sendNode(a:any,o:string,id:string|null,p:string,key:string,x:N,render='list'){
 const interactive=x.options.length?menuInteractive(key,x,render):null;
 const sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const response=await fetch(Deno.env.get('SUPABASE_URL')!+'/functions/v1/whatsapp-outbound-gate',{method:'POST',headers:{Authorization:'Bearer '+sk,apikey:sk,'Content-Type':'application/json'},body:JSON.stringify({org_id:o,conversation_id:id,phone:D(p),message:x.message,...(interactive?{interactive}:{}),agent_key:'helena_chatbot',idempotency_key:'chatbot:'+String(id||D(p))+':'+key+':'+Math.floor(Date.now()/120000),format_agent_reply:false}),signal:AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data?.ok||data?.allowed!==true)throw new Error('Envio bloqueado: '+String(data?.reason||data?.error||response.status));
 return data.provider_response||data;
}
async function logOut(a:any,o:string,id:string|null,body:string,key:string,resp:any){if(!id||key==='process_delivery_followup'||key==='collection_followup')return;try{await a.from('whatsapp_messages').insert({org_id:o,conversation_id:id,direction:'outbound',message_type:'interactive',body,status:'sent',external_message_id:String(resp?.zaapId||resp?.messageId||resp?.id||'')||null,sent_at:new Date().toISOString(),metadata:{source:'chatbot_menu',node:key,format:resp?.format||null}})}catch{}}
Deno.serve(async req=>{if(req.method!=='POST')return J({ok:false},405);try{
  const sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if((req.headers.get('authorization')||'')!==`Bearer ${sk}`)return J({ok:false},401);
  const b=await req.json().catch(()=>({})),o=String(b.org_id||''),id=b.conversation_id?String(b.conversation_id):null,p=String(b.phone||''),k=String(b.node||'start'),ch=String(b.choice||''),tx=String(b.text||'');
  let path:any[]=Array.isArray(b.path)?b.path:[];
  if(!o||!p)return J({ok:false,error:'org_id e phone obrigatórios'},400);
  const a=A();const {nodes,enabled,render}=await loadNodes(a,o);
  if(b.action==='nodes')return J({ok:true,nodes:Object.keys(nodes)});
  if(b.action==='preview'){
    const x=nodes[k];if(!x)return J({ok:false,error:'node_not_found'},404);
    const result=(ch||tx)?resolve(nodes,k,ch,tx):null;
    const chosen=result?.opt||null;
    return J({ok:true,preview:true,enabled,render,node:k,message:x.message,interactive:x.options.length?menuInteractive(k,x,render):null,options:x.options.map((v:any,i:number)=>({number:i+1,id:v.id,label:v.label,description:v.description||'',next:v.next||null,agent:v.agent||null})),matched:Boolean(result),selected:chosen?{id:chosen.id,label:chosen.label,next:chosen.next||null,agent:chosen.agent||null}:null});
  }

  if(!enabled){const allow=(await secret(a,'ai_test_allowlist')).split(/[,;\s]+/).map(D).filter(Boolean);if(o!=='b3dd3ed0-2a05-4087-8220-307a44352cec'||!allow.includes(D(p)))return J({ok:true,blocked:true,reason:'flow_disabled',path});}
  const why=await blocked(a,o,id,p);if(why)return J({ok:true,blocked:true,reason:why,path});
  if(ch||tx){
    const r=resolve(nodes,k,ch,tx);
    if(!r){
      // Catálogo 03: só quando a pessoa diz que prefere não usar o menu.
      if(!ch&&/\b(nao (quero|gosto|consigo|precisa)( de)?( usar)?( o| os| a| as| desse| desses| dessa| dessas)? (menu|botao|botoes|opcoes)|prefiro (nao usar|escrever|digitar|falar|conversar)|sem (menu|botao|botoes)|(chega|para) de (menu|botoes|opcoes))\b/.test(norm(tx))){const resp=await sendNode(a,o,id,p,'ignore_menu',{message:receptionMessages.ignore_menu,options:[]},render);await logOut(a,o,id,receptionMessages.ignore_menu,'ignore_menu',resp);return J({ok:true,matched:true,replied:true,node:'agent_conversation',path})}
      return J({ok:true,matched:false,node:k,known_node:Boolean(nodes[k])});
    }
    const z=r.opt;
    // Caminho sem repetições: volta ao menu zera; a mesma escolha seguida não se acumula.
    if(z.id==='menu'||z.next==='start')path=[];else{const last=path[path.length-1];if(!(last&&last.node===r.node&&last.choice===z.id))path=[...path,{node:r.node,choice:z.id,label:z.label}].slice(-6)}
    // Catálogo §20/22: etiqueta interna de assunto/prioridade conforme o botão escolhido (sem repetir, sem tocar nas demais).
    const lab=LABEL_BY_OPTION[r.node+':'+z.id]||LABEL_BY_NODE[r.node];if(lab&&id&&!z.next){try{await a.rpc('conversation_add_label',{p_conversation:id,p_label:lab})}catch{}}
    if(z.reply){const resp=await sendNode(a,o,id,p,'reply_'+r.node,{message:z.reply,options:[]},render);await logOut(a,o,id,z.reply,r.node,resp);return J({ok:true,matched:true,replied:true,node:'agent_conversation',path})}
    if(z.agent){const urgent=path.some((s:any)=>s.node==='urgent');return J({ok:true,matched:true,handoff:true,agent_key:z.agent,selected:{node:r.node,choice:z.id,label:z.label},next_node:'agent_conversation',path,context:{path,summary:path.map((s:any)=>String(s.label).replace(/^[^\p{L}\p{N}]+/u,'').trim()).join(' → '),profile:path[0]?.choice||null,urgent,...(z.ctx||{})}})}
    if(z.next){const x=nodes[z.next];if(!x)return J({ok:false,error:`nó inexistente: ${z.next}`},400);const resp=await sendNode(a,o,id,p,z.next,x,render);return J({ok:true,matched:true,node:z.next,path,provider_response:resp})}
    return J({ok:true,matched:false,node:k});
  }
  if(k==='start'&&id){const {data:st0}=await a.from('whatsapp_chatbot_flow_state').select('updated_at').eq('conversation_id',id).maybeSingle();if(st0?.updated_at&&Date.now()-new Date(st0.updated_at).getTime()<6*3600000){const {data:lm}=await a.from('whatsapp_messages').select('body').eq('conversation_id',id).eq('direction','inbound').order('created_at',{ascending:false}).limit(1).maybeSingle();if(!/^(menu|inicio|opcoes)$/.test(norm(lm?.body||'')))return J({ok:true,blocked:true,reason:'already_presented',path});await a.from('whatsapp_conversations').update({owner_agent_key:null}).eq('id',id);}}
  const x=nodes[k];if(!x)return J({ok:false,error:`nó inexistente: ${k}`},400);
  const resp=await sendNode(a,o,id,p,k,x,render);
  return J({ok:true,node:k,path,provider_response:resp});
}catch(e){return J({ok:false,error:e instanceof Error?e.message:String(e)},500)}});
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
// v44 (05/10/2026) — roteamento reavaliado a cada mensagem: a conversa não fica mais "grudada" no último agente.
//        Sem assunto claro e sem conversa nas últimas 3h → volta para a triagem. Lead que pede consulta/agenda/PIX
//        → financeiro (cobra a consulta) enquanto não houver pagamento registrado; com pagamento → agenda.
//        Lead que hesita/recusa o valor da consulta → Agente de Vendas.
//        Mídia: a intenção é lida só do conteúdo (foto de documento não cai mais no financeiro).
// v41 — "QUERO MEU ACESSO" tratado ANTES de tudo (não depende de agente ligado, atendimento humano nem junção de mensagens);
//        aceita variações ("quero meu acesso!", "Quero meu acesso por favor"); se faltar CPF, pede o CPF e gera o código quando o cliente responder;
//        reaproveita o código existente (não derruba quem já ativou); avisa a Dra. quando não dá para liberar; cartilha nova (busca a imagem "cartilha*" no Storage).
// v28 — número novo (nunca cadastrado) não é mais ignorado: cria contato (+ lead automático pelo gatilho do banco) e a Helena dá boas-vindas com a foto na PRIMEIRA mensagem, seja qual for o texto.
// v26 — reconhece o contato com ou sem o 9º dígito e com telefone formatado (antes, quem estava cadastrado com 13 dígitos era ignorado).
// v25 — lê áudio (transcreve), imagem e PDF (OpenAI) e passa o conteúdo para a IA; avisa a Dra. quando chega documento.
// v24 — trava atômica anti-duplicidade (messageId) e ignora eco do próprio robô (fromApi).
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json"}}),D=(v:any)=>String(v??'').replace(/\D/g,'');const A=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});async function S(a:any,k:string){const{data}=await a.from('system_runtime_secrets').select('secret').eq('key',k).maybeSingle();return String(data?.secret||'').trim()}async function H(v:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const DEFAULT_ORG='b3dd3ed0-2a05-4087-8220-307a44352cec';
function text(b:any){return String(b?.text?.message||b?.text?.description||b?.message?.text||b?.message?.body||b?.body||b?.caption||b?.image?.caption||b?.video?.caption||b?.document?.caption||b?.buttonsResponseMessage?.selectedDisplayText||b?.buttonsResponseMessage?.message||b?.buttonResponse?.selectedDisplayText||b?.listResponseMessage?.title||'').trim()}
function choice(b:any){return String(b?.buttonsResponseMessage?.buttonId||b?.buttonsResponseMessage?.selectedButtonId||b?.buttonResponse?.buttonId||b?.buttonResponse?.selectedButtonId||b?.buttonResponse?.id||b?.listResponseMessage?.selectedRowId||b?.listResponseMessage?.singleSelectReply?.selectedRowId||b?.listResponse?.selectedRowId||b?.listResponse?.id||b?.selectedButtonId||b?.buttonId||b?.selectedRowId||b?.optionListResponse?.selectedRowId||b?.optionListResponse?.id||b?.message?.buttonsResponseMessage?.buttonId||b?.message?.buttonsResponseMessage?.selectedButtonId||b?.message?.listResponseMessage?.singleSelectReply?.selectedRowId||'').trim()}
function media(b:any){for(const [type,obj] of [['image',b?.image||b?.imageMessage],['audio',b?.audio||b?.audioMessage],['video',b?.video||b?.videoMessage],['document',b?.document||b?.documentMessage]] as any){if(obj){const url=String(obj.url||obj.imageUrl||obj.audioUrl||obj.videoUrl||obj.documentUrl||obj.mediaUrl||obj.downloadUrl||'');if(url)return{type,url,fileName:obj.fileName||obj.title||`${type}.bin`,mimeType:obj.mimeType||obj.mimetype||''}}}return null}
function realPhone(phone:string){const l=phone.startsWith('55')?phone.slice(2):phone;return (phone.startsWith('55')&&(phone.length===12||phone.length===13))||(!phone.startsWith('55')&&(l.length===10||l.length===11))}
async function context(a:any,p:string,senderName='',createIfMissing=false){
  const phone=D(p);if(!phone)return null;
  const local=phone.startsWith('55')&&phone.length>=12?phone.slice(2):phone;
  const sel='id,org_id,phone,client_id,name,tags,is_blocked';
  let rows:any[]=[];
  if(local.length>=10&&local.length<=11){
    const ddd=local.slice(0,2),tail8=local.slice(-8);
    const variants=[...new Set([phone,local,'55'+ddd+tail8,'55'+ddd+'9'+tail8,ddd+tail8,ddd+'9'+tail8])];
    const r1=await a.from('whatsapp_contacts').select(sel).in('phone',variants).limit(20);rows=r1.data||[];
    if(!rows.length){const r2=await a.from('whatsapp_contacts').select(sel).ilike('phone','%'+tail8.slice(-4)+'%').limit(300);rows=(r2.data||[]).filter((r:any)=>{const rp=D(r.phone);const rl=rp.startsWith('55')&&rp.length>=12?rp.slice(2):rp;return rl.slice(0,2)===ddd&&rl.slice(-8)===tail8})}
  }else{const r=await a.from('whatsapp_contacts').select(sel).eq('phone',phone).limit(5);rows=r.data||[]}
  rows.sort((x:any,y:any)=>(D(y.phone)===phone?2:0)+(y.client_id?1:0)-((D(x.phone)===phone?2:0)+(x.client_id?1:0)));
  for(const c of rows){const{data:v}=await a.from('whatsapp_conversations').select('id,org_id,client_id,chatbot_context,bot_ativo,conversation_owner,owner_agent_key,last_human_outbound_at,human_takeover_at').eq('org_id',c.org_id).eq('contact_id',c.id).neq('status','closed').order('updated_at',{ascending:false}).limit(1).maybeSingle();if(v)return{c,v}}
  let c=rows[0];
  if(!c){
    // Número novo: antes era ignorado em silêncio (ninguém recebia boas-vindas). Agora cria o contato;
    // o gatilho crm_attach_whatsapp_lead liga ao cliente já cadastrado (pelo telefone) ou cria o lead.
    if(!createIfMissing||!realPhone(phone))return null;
    const org=(await S(a,'zapi_org_id'))||DEFAULT_ORG;
    const name=String(senderName||'').trim()||null;
    const ins=await a.from('whatsapp_contacts').insert({org_id:org,phone,name,profile_name:name}).select(sel).single();
    if(ins.error||!ins.data){console.error('context create contact',ins.error?.message);return null}
    c=ins.data;
  }
  const{data:cl}=c.client_id?await a.from('clients').select('owner_user_id').eq('id',c.client_id).maybeSingle():{data:null};
  const ins=await a.from('whatsapp_conversations').insert({org_id:c.org_id,contact_id:c.id,client_id:c.client_id||null,owner_user_id:cl?.owner_user_id||undefined,status:'open',bot_ativo:true,conversation_owner:'HELENA'}).select('id,org_id,client_id,chatbot_context,bot_ativo,conversation_owner,owner_agent_key,last_human_outbound_at,human_takeover_at').single();
  if(ins.error||!ins.data){console.error('context create conversation',ins.error?.message);return null}
  return{c,v:ins.data};
}
async function runAgent(orgId:string,conversationId:string,phone:string,agentKey:string,message:string,testMode=false){const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/helena-conversation-run`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`},body:JSON.stringify({org_id:orgId,conversation_id:conversationId,phone,agent_key:agentKey,interaction_mode:'chatbot',message,test_mode:testMode})});const d=await r.json().catch(()=>({}));if(!r.ok||d?.ok===false)console.error('helena-conversation-run',r.status,d?.error);else if(d?.sent===false||d?.skipped)console.warn('helena não enviou',d?.gate_reason||d?.skipped);return d}
const GREETING=/^(oi+[eê]?|ol[aá]+|opa|e a[ií]|bom dia|boa tarde|boa noite|menu|in[ií]cio|come[cç]ar)[!. ]*$/i;
const PHOTO='https://lexoffice-ashy.vercel.app/file_000000003d3c820ea01435d641ac6df8.png';
const SIG='⚖️ *Helena | Suzanne Figueiredo Advocacia* ⚖️';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
// v27 — sem menu de entrada: cumprimento elegante com a foto da Dra.; texto livre vai direto ao agente certo; junta mensagens picadas; ignora contatos marcados como "pessoal".
// ===================== ROTEAMENTO (v44) =====================
function intentFor(t:string){const s=String(t||'').toLowerCase();if(/process|andamento|audi[eê]ncia|senten[cç]a|juiz|liminar|movimenta|intima/.test(s))return 'client_process_updates';if(/pag|parcela|boleto|\bpix\b|cobran|d[ée]bito|honor[aá]rio|atras|comprovante|cart[aã]o/.test(s))return 'billing';if(/agend|reuni[aã]o|consulta|hor[aá]rio|remarc|atendimento presencial/.test(s))return 'client_schedule_relationship';return ''}
// Mídia: avalia só o conteúdo lido, não a instrução interna (que cita "comprovante").
function intentText(t:string){const s=String(t||'');if(!/^\[O cliente enviou/.test(s))return s;const m=s.match(/legenda: "([\s\S]*?)"\./);const c=s.match(/Conteúdo lido automaticamente:\s*([\s\S]*?)\.\s*Confirme o recebimento/);return [m?.[1]||'',c?.[1]||''].join(' ').trim()}
const CONSULT_RE=/consult|agend|marcar|hor[aá]rio|reuni[aã]o|\bpix\b|paguei|pagamento|comprovante|transferi|quanto (custa|é|e|fica|cobra|sai) a consult|valor da consult/;
const CONTRACT_RE=/honor[aá]rio|contrat|parcel|entrada|(valor|quanto).{0,25}(a[cç][aã]o|processo)/;
// Lead que hesita ou recusa o valor da consulta → Agente de Vendas (contorna objeção / follow-up).
const OBJECTION_RE=/(pagar|pago|cobrar|cobra).{0,30}pra qu[eê]|pra qu[eê] (vou )?pagar|t[aá] caro|muito caro|\bcaro\b|vou pensar|depois (eu )?vejo|n[aã]o tenho (condi|dinheiro|como pagar)|sem condi[cç]|mais barato|desconto|gr[aá]tis|gratuit|de gra[cç]a|s[oó] (pra|para) tirar d[uú]vida|n[aã]o vou pagar|n[aã]o quero pagar|n[aã]o posso pagar/;
function decideAgent(o:{isClient:boolean,text:string,owner:string|null,ownerActive:boolean,leadPaid:boolean,requirePayment:boolean}){
  const s=intentText(o.text).toLowerCase();
  const intent=intentFor(s);
  if(!o.isClient){
    if(OBJECTION_RE.test(s))return 'sales';
    const consult=CONSULT_RE.test(s)&&!(CONTRACT_RE.test(s)&&!/consult/.test(s));
    if(consult)return (o.requirePayment&&!o.leadPaid)?'billing':'client_schedule_relationship';
    if(o.owner&&o.ownerActive&&['client_service_triage','billing','client_schedule_relationship','sales'].includes(o.owner))return o.owner;
    return 'client_service_triage';
  }
  if(intent)return intent;
  if(o.owner&&o.ownerActive&&o.owner!=='human')return o.owner;
  return 'client_service_triage';
}
async function pickAgent(a:any,x:any,t:string){
  const isClient=!!(x.v.client_id||x.c.client_id);
  let ownerActive=false,leadPaid=false,requirePayment=true;
  if(x.v.owner_agent_key){const {data:lo}=await a.from('whatsapp_messages').select('created_at').eq('conversation_id',x.v.id).eq('direction','outbound').order('created_at',{ascending:false}).limit(1).maybeSingle();ownerActive=!!lo?.created_at&&Date.now()-new Date(lo.created_at).getTime()<3*3600000}
  if(!isClient){
    try{
      const {data:ws}=await a.from('whatsapp_settings').select('require_payment_before_booking').eq('org_id',x.v.org_id).maybeSingle();requirePayment=ws?.require_payment_before_booking!==false;
      const {data:cv}=await a.from('whatsapp_conversations').select('lead_id').eq('id',x.v.id).maybeSingle();
      const {data:ct}=await a.from('whatsapp_contacts').select('lead_id').eq('id',x.c.id).maybeSingle();
      const leadId=cv?.lead_id||ct?.lead_id||null;
      if(leadId){const {count}=await a.from('payment_receipts').select('id',{count:'exact',head:true}).eq('lead_id',leadId);leadPaid=(count||0)>0}
    }catch(e){console.error('pickAgent lead',e)}
  }
  return decideAgent({isClient,text:t,owner:x.v.owner_agent_key||null,ownerActive,leadPaid,requirePayment});
}
// ==============================================================
function spGreeting(){const h=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date()));return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}
async function sendGreeting(a:any,x:any,p:string,askHelp=true){
 const caption=askHelp?'Olá. Sou Helena, do escritório Suzanne Figueiredo Advocacia e Soluções Jurídicas.\n\nComo posso ajudar?':'Olá. Seja bem-vindo(a) ao escritório Suzanne Figueiredo Advocacia e Soluções Jurídicas.';
 const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const r=await fetch(Deno.env.get('SUPABASE_URL')!+'/functions/v1/whatsapp-outbound-gate',{method:'POST',headers:{'Authorization':'Bearer '+svc,'apikey':svc,'Content-Type':'application/json'},body:JSON.stringify({org_id:x.v.org_id,conversation_id:x.v.id,phone:D(p),message:caption,agent_key:'helena_chatbot',idempotency_key:'greeting:'+x.v.id})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.allowed!==true)return false;
 return true;
}
async function claimInbound(a:any,x:any,inboundId:string,t:string,ch:string,type='text'){if(!inboundId)return true;const {error}=await a.from('whatsapp_messages').insert({org_id:x.v.org_id,conversation_id:x.v.id,external_message_id:inboundId,direction:'inbound',message_type:type,body:(t||ch||'').slice(0,4000),status:'received',sent_at:new Date().toISOString(),metadata:{source:'evolution',choice:ch||null}});if(error){if(String(error.code)==='23505')return false;console.error('claimInbound',error.message)}return true}
async function gateSend(orgId:string,conversationId:string,phone:string,message:string,key:string){const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;try{await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-outbound-gate`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`,apikey:svc},body:JSON.stringify({org_id:orgId,conversation_id:conversationId,phone,message,agent_key:'system',idempotency_key:key})})}catch(e){console.error('gateSend',e)}}

// ===================== ACESSO À ÁREA DO CLIENTE ("QUERO MEU ACESSO") =====================
const ACCESS_LINK='https://lexoffice.univittagroup.com.br/cliente';
const OLD_GUIDE='cartilha-lexoffice.png';
function norm(v:string){return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim()}
export function isAccessRequest(t:string){const s=norm(t);if(!s||s.length>80)return false;return /\bQUERO (O |MEU |MINHA )?(ACESSO|CODIGO|SENHA)\b/.test(s)||/^(MEU )?ACESSO( AO APP| AO APLICATIVO| A AREA DO CLIENTE)?$/.test(s)||/\bLIBERA(R)? (O |MEU )?ACESSO\b/.test(s)||/\bQUERO ACESSAR (O APP|O APLICATIVO|A AREA DO CLIENTE)\b/.test(s)}
export function isDecline(t:string){const s=norm(t);return s==='AGORA NAO'||s==='AGORA NAO OBRIGADO'||s==='AGORA NAO OBRIGADA'}
export function cpfOk(v:string){const c=D(v);if(c.length!==11||/^(\d)\1{10}$/.test(c))return false;for(const t of [9,10]){let s=0;for(let i=0;i<t;i++)s+=Number(c[i])*(t+1-i);if(((s*10)%11)%10!==Number(c[t]))return false}return true}
export function cpfInText(t:string){const s=String(t||'');const m=s.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g)||[];for(const x of m){const d=D(x);if(d.length===11)return d}return ''}
function fmtCpf(c:string){return c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4')}
async function guideUrl(a:any){try{const {data}=await a.storage.from('chatbot-assets').list('',{limit:20,search:'cartilha',sortBy:{column:'created_at',order:'desc'}});const f=(data||[]).find((o:any)=>/^cartilha.*\.(png|jpe?g|webp)$/i.test(o.name)&&Number(o?.metadata?.size||0)>20000);if(!f)return null;return a.storage.from('chatbot-assets').getPublicUrl(f.name).data.publicUrl}catch(e){console.error('guideUrl',e);return null}}
async function notifyOffice(a:any,orgId:string,title:string,body:string){try{const {data:owners}=await a.from('profiles').select('id').eq('org_id',orgId).eq('status','active').limit(10);if(owners?.length)await a.from('notifications').insert(owners.map((u:any)=>({org_id:orgId,user_id:u.id,type:'service',title,body:body.slice(0,700),link:'/clientes',read:false})))}catch(e){console.error('notifyOffice',e)}}
async function sysSend(a:any,x:any,p:string,message:string,kind:string,image:string|null=null){
  const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-outbound-gate`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`,apikey:svc},body:JSON.stringify({org_id:x.v.org_id,conversation_id:x.v.id,phone:D(p),message,image,caption:image?message:null,agent_key:'system',idempotency_key:`${kind}:${x.v.id}:${Date.now()}`})});
  const d=await r.json().catch(()=>({}));const ok=r.ok&&d?.ok&&d?.allowed!==false;
  if(!ok)console.error('sysSend',kind,r.status,JSON.stringify(d).slice(0,300));
  await a.from('whatsapp_messages').insert({org_id:x.v.org_id,conversation_id:x.v.id,direction:'outbound',message_type:image?'image':'text',body:message.slice(0,4000),status:ok?'sent':'failed',external_message_id:String(d?.provider_response?.zaapId||d?.provider_response?.messageId||d?.provider_response?.id||'')||null,sent_at:new Date().toISOString(),metadata:{source:'system',kind,error:ok?null:(d?.error||d?.reason||'falha')}});
  return ok;
}
async function setCtx(a:any,x:any,patch:any){const ctx={...(x.v.chatbot_context||{}),...patch};for(const k of Object.keys(patch))if(patch[k]===null)delete ctx[k];x.v.chatbot_context=ctx;await a.from('whatsapp_conversations').update({chatbot_context:ctx,updated_at:new Date().toISOString()}).eq('id',x.v.id)}
async function deliverAccess(a:any,x:any,p:string,client:any,cpf:string){
  const {data:cur}=await a.from('client_app_access').select('login_cpf,access_code,status').eq('client_id',client.id).maybeSingle();
  if(cur?.status==='revoked'){
    await sysSend(a,x,p,'Recebi sua solicitação.\n\nNossa equipe vai verificar a liberação do seu acesso e retorna em breve.','client_app_revoked');
    await notifyOffice(a,x.v.org_id,'Pedido de acesso de cliente com App revogado',`${client.name||'Cliente'} pediu acesso pelo WhatsApp, mas o acesso dele(a) ao App está revogado. Se quiser liberar, use "Gerar código" na ficha do cliente.`);
    return;
  }
  let access=cur;
  if(!cur?.access_code||D(cur.login_cpf)!==cpf){
    const code='SF-'+crypto.randomUUID().replace(/-/g,'').slice(0,4).toUpperCase()+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,4).toUpperCase();
    const {data,error}=await a.from('client_app_access').upsert({client_id:client.id,org_id:x.v.org_id,login_cpf:cpf,access_code:code,status:'not_activated',activated_at:null,revoked_at:null,updated_at:new Date().toISOString(),updated_by:null},{onConflict:'client_id'}).select('login_cpf,access_code,status').single();
    if(error||!data){console.error('client_app_access upsert',error?.message);await sysSend(a,x,p,'Recebi sua solicitação de acesso.\n\nHouve uma instabilidade ao gerar o código e nossa equipe vai conferir.','client_app_error');await notifyOffice(a,x.v.org_id,'Falha ao gerar acesso ao App',`Não foi possível gerar o código de ${client.name||'cliente'}: ${error?.message||'erro'}`);return}
    access=data;
  }
  const guide=await guideUrl(a);
  const first=String(client.name||'').trim().split(/\s+/)[0]||'';
  const nome=first?first.charAt(0).toUpperCase()+first.slice(1).toLowerCase():'';
  const msg=`Olá${nome?', '+nome:''}!\n\n🔐 *SEU ACESSO À ÁREA DO CLIENTE FOI LIBERADO*\n\nSuzanne Figueiredo Advocacia e Soluções Jurídicas\n\n👤 *LOGIN (CPF):* ${access.login_cpf}\n\n🔑 *CÓDIGO DE ACESSO:* ${access.access_code}\n\n🔗 *ACESSE SUA ÁREA DO CLIENTE:*\n${ACCESS_LINK}\n\n${guide?'📱 Logo abaixo segue a cartilha com o passo a passo para instalar no celular (Android ou iPhone).':'📱 Abra o link acima e, no menu do navegador, toque em "Adicionar à tela inicial".'}\n\n⚠️ Guarde seu código e não compartilhe seus dados de acesso com terceiros.\n\n🎧 Precisa de ajuda? Responda esta mensagem.`;
  const ok=await sysSend(a,x,p,msg,'client_app_access');
  if(!ok){await notifyOffice(a,x.v.org_id,'Acesso gerado, mas o WhatsApp não enviou',`O código de ${client.name||'cliente'} foi gerado (${access.access_code}), mas a mensagem não saiu. Use "Copiar acesso" na ficha do cliente.`);return}
  if(guide){await sleep(1500);const g=await sysSend(a,x,p,'Passo a passo para instalar a Área do Cliente no seu celular.','client_app_guide',guide);if(!g)await notifyOffice(a,x.v.org_id,'Cartilha do App não enviada',`O acesso de ${client.name||'cliente'} foi enviado, mas a cartilha (imagem) falhou.`)}
  else await notifyOffice(a,x.v.org_id,'Cartilha do App não encontrada',`O acesso de ${client.name||'cliente'} foi enviado sem a cartilha porque a imagem não está publicada no Storage (bucket chatbot-assets, arquivo começando com "cartilha").`);
}
// Retorna true quando a mensagem foi tratada aqui (pedido de acesso, recusa ou CPF aguardado).
async function accessFlow(a:any,p:string,t:string,ch0:string,inboundId:string,senderName:string){
  const raw=t||ch0;if(!raw)return false;
  const wantsAccess=isAccessRequest(raw),declines=isDecline(raw),cpfTyped=cpfInText(raw)||(/^\s*[\d.\-\s]{11,16}\s*$/.test(raw)?D(raw):'');
  if(!wantsAccess&&!declines&&!cpfTyped)return false;
  const x=await context(a,p,senderName,true);if(!x)return false;
  const tags=(Array.isArray(x.c.tags)?x.c.tags:[]).map((s:any)=>String(s).toLowerCase());
  if(x.c.is_blocked===true||tags.includes('pessoal')||tags.includes('nao_responder'))return false;
  const ctx=x.v.chatbot_context||{};
  const pendingCpf=ctx.access_cpf_pending_at&&Date.now()-new Date(ctx.access_cpf_pending_at).getTime()<48*3600000;
  if(!wantsAccess&&!declines&&!pendingCpf)return false; // número qualquer fora do fluxo de acesso segue para a Helena
  const clientId=String(x.v.client_id||x.c.client_id||'');
  if(clientId){const {data:r}=await a.from('client_service_restrictions').select('id').eq('org_id',x.v.org_id).eq('client_id',clientId).eq('active',true).limit(1).maybeSingle();if(r)return false} // cliente restrito não recebe acesso; segue o fluxo de restrição
  if(!(await claimInbound(a,x,inboundId,t,ch0)))return true;
  if(declines&&!wantsAccess){const {data:camp}=await a.from('whatsapp_messages').select('id').eq('conversation_id',x.v.id).eq('direction','outbound').ilike('body','%QUERO MEU ACESSO%').gt('created_at',new Date(Date.now()-7*86400000).toISOString()).limit(1).maybeSingle();if(!camp&&!pendingCpf){return await bot(a,p,ch0,t,inboundId,true,senderName)}await setCtx(a,x,{access_cpf_pending_at:null});await sysSend(a,x,p,'Tudo bem.\n\nQuando desejar o acesso à Área do Cliente, é só enviar "Quero meu acesso".','client_app_decline');return true}
  if(wantsAccess){const {data:recent}=await a.from('whatsapp_messages').select('id').eq('conversation_id',x.v.id).eq('direction','outbound').eq('metadata->>kind','client_app_access').gt('created_at',new Date(Date.now()-3*60000).toISOString()).limit(1).maybeSingle();if(recent)return true}
  if(!clientId){
    await sysSend(a,x,p,'Recebi sua solicitação de acesso.\n\nNão localizei este WhatsApp no cadastro de clientes, então nossa equipe vai conferir seus dados e retorna em breve.','client_app_unlinked');
    await notifyOffice(a,x.v.org_id,'Pedido de acesso de número não cadastrado',`${senderName||x.c.name||'Contato'} (${D(p)}) pediu acesso à Área do Cliente pelo WhatsApp, mas este número não está vinculado a nenhum cliente. Cadastre o WhatsApp na ficha do cliente e clique em "Gerar código".`);
    return true;
  }
  const {data:client}=await a.from('clients').select('id,org_id,name,cpf_cnpj').eq('id',clientId).eq('org_id',x.v.org_id).maybeSingle();
  if(!client){await sysSend(a,x,p,'Recebi sua solicitação de acesso.\n\nNossa equipe vai conferir seu cadastro e retorna em breve.','client_app_error');await notifyOffice(a,x.v.org_id,'Pedido de acesso sem cadastro localizado',`O WhatsApp ${D(p)} pediu acesso, mas o cliente vinculado não foi encontrado.`);return true}
  const saved=D(client.cpf_cnpj);
  if(saved.length===11){
    if(pendingCpf&&cpfTyped&&!wantsAccess&&cpfTyped!==saved){await setCtx(a,x,{access_cpf_pending_at:null});await sysSend(a,x,p,'O CPF informado não confere com o nosso cadastro.\n\nNossa equipe vai verificar e retorna em breve.','client_app_cpf_mismatch');await notifyOffice(a,x.v.org_id,'CPF divergente no pedido de acesso',`${client.name} informou um CPF diferente do cadastrado ao pedir acesso ao App. Confira a ficha antes de gerar o código.`);return true}
    if(pendingCpf)await setCtx(a,x,{access_cpf_pending_at:null});
    await deliverAccess(a,x,p,client,saved);return true;
  }
  // Cadastro sem CPF: pede o CPF e gera o código assim que o cliente responder.
  if(!cpfTyped){await setCtx(a,x,{access_cpf_pending_at:new Date().toISOString()});await sysSend(a,x,p,'Para liberar seu acesso, por gentileza, me envie o seu CPF (somente números).','client_app_ask_cpf');return true}
  if(!cpfOk(cpfTyped)){await setCtx(a,x,{access_cpf_pending_at:new Date().toISOString()});await sysSend(a,x,p,'Esse CPF parece incorreto.\n\nPode conferir e enviar novamente, somente os números?','client_app_cpf_invalid');return true}
  const {data:dup}=await a.from('clients').select('id,name,cpf_cnpj').eq('org_id',x.v.org_id).neq('id',client.id).or(`cpf_cnpj.eq.${cpfTyped},cpf_cnpj.eq.${fmtCpf(cpfTyped)}`).limit(1).maybeSingle();
  if(dup){await setCtx(a,x,{access_cpf_pending_at:null});await sysSend(a,x,p,'Recebi seu CPF.\n\nNossa equipe vai conferir o cadastro antes de liberar o acesso e retorna em breve.','client_app_cpf_conflict');await notifyOffice(a,x.v.org_id,'CPF já usado em outro cadastro',`${client.name} informou um CPF que já pertence ao cadastro de ${dup.name}. Nenhum código foi gerado.`);return true}
  const {error:upErr}=await a.from('clients').update({cpf_cnpj:fmtCpf(cpfTyped)}).eq('id',client.id).eq('org_id',x.v.org_id);
  if(upErr){console.error('save cpf',upErr.message);await sysSend(a,x,p,'Recebi seu CPF.\n\nNossa equipe vai concluir a liberação do acesso e retorna em breve.','client_app_error');await notifyOffice(a,x.v.org_id,'Falha ao salvar CPF do cliente',`${client.name}: ${upErr.message}`);return true}
  await setCtx(a,x,{access_cpf_pending_at:null});
  await notifyOffice(a,x.v.org_id,'CPF informado pelo cliente no WhatsApp',`${client.name} informou o CPF ${fmtCpf(cpfTyped)} ao pedir acesso ao App. O CPF foi salvo na ficha e o acesso foi enviado.`);
  await deliverAccess(a,x,p,client,cpfTyped);
  return true;
}
// ==========================================================================================

async function bot(a:any,p:string,ch0:string,t:string,inboundId:string,preClaimed=false,senderName=''){
  const x=await context(a,p,senderName,true);if(!x)return false;
  const tags=(Array.isArray(x.c.tags)?x.c.tags:[]).map((s:any)=>String(s).toLowerCase());
  if(x.c.is_blocked===true||tags.includes('pessoal')||tags.includes('nao_responder')){if(!preClaimed)await claimInbound(a,x,inboundId,t,ch0);return true}
  const restrictedClientId=String(x.v.client_id||x.c.client_id||'');
  const {data:restriction}=restrictedClientId?await a.from('client_service_restrictions').select('id').eq('org_id',x.v.org_id).eq('client_id',restrictedClientId).eq('active',true).limit(1).maybeSingle():{data:null};
  const {count:activeAgents}=await a.from('ai_agent_policies').select('agent_key',{count:'exact',head:true}).eq('org_id',x.v.org_id).eq('active',true);
  const allow=(await S(a,'ai_test_allowlist')).split(/[,;\s]+/).map(D).filter(Boolean);const testMode=allow.includes(D(p));
  if(!activeAgents&&!testMode)return false;
  const {data:fc}=await a.from('whatsapp_chatbot_flow_config').select('enabled').eq('org_id',x.v.org_id).maybeSingle();if(fc?.enabled===false)return false;
  const {data:ctl}=await a.from('ai_conversation_controls').select('ai_enabled,human_takeover,resume_at').eq('org_id',x.v.org_id).eq('contact_key',D(p)).maybeSingle();
  if(ctl?.human_takeover===true||ctl?.ai_enabled===false){
    if(!ctl?.resume_at||Date.now()<new Date(ctl.resume_at).getTime())return false;
    const now=new Date().toISOString();
    await a.from('ai_conversation_controls').update({ai_enabled:true,human_takeover:false,resume_at:null,updated_at:now}).eq('org_id',x.v.org_id).eq('contact_key',D(p));
    await a.from('whatsapp_conversations').update({bot_ativo:true,conversation_owner:'HELENA',updated_at:now}).eq('id',x.v.id);
    x.v.bot_ativo=true;x.v.conversation_owner='HELENA';
  }
  if(x.v.conversation_owner==='HUMAN'||x.v.bot_ativo===false)return false;
  if(!preClaimed&&!(await claimInbound(a,x,inboundId,t,ch0)))return true;
  // Junta mensagens picadas: espera o cliente terminar de escrever e responde uma vez só.
  if(t&&!ch0&&inboundId){
    const {data:me}=await a.from('whatsapp_messages').select('created_at').eq('conversation_id',x.v.id).eq('external_message_id',inboundId).limit(1).maybeSingle();
    if(me?.created_at){
      await sleep(25000);
      const {data:newer}=await a.from('whatsapp_messages').select('id').eq('conversation_id',x.v.id).eq('direction','inbound').gt('created_at',me.created_at).limit(1).maybeSingle();
      if(newer)return true;
      const {data:lastOut}=await a.from('whatsapp_messages').select('created_at').eq('conversation_id',x.v.id).eq('direction','outbound').order('created_at',{ascending:false}).limit(1).maybeSingle();
      const since=lastOut?.created_at&&lastOut.created_at<me.created_at?lastOut.created_at:new Date(new Date(me.created_at).getTime()-10*60000).toISOString();
      const {data:burst}=await a.from('whatsapp_messages').select('body,message_type').eq('conversation_id',x.v.id).eq('direction','inbound').gt('created_at',since).order('created_at',{ascending:true}).limit(10);
      const parts=(burst||[]).filter((m:any)=>m.message_type==='text'||m.message_type==='audio').map((m:any)=>String(m.body||'').trim()).filter(Boolean).filter((s:string)=>!isAccessRequest(s));
      if(parts.length>1&&!preClaimed)t=parts.join('\n');
      const {data:accessReply}=await a.from('whatsapp_messages').select('id').eq('conversation_id',x.v.id).eq('direction','outbound').like('metadata->>kind','client_app%').gt('created_at',me.created_at).limit(1).maybeSingle();
      if(accessReply)return true; // o fluxo de acesso já respondeu depois desta mensagem
    }
  }
  const {data:st}=await a.from('whatsapp_chatbot_flow_state').select('current_node,path').eq('conversation_id',x.v.id).maybeSingle();
  const node=String(st?.current_node||'start'),path=Array.isArray(st?.path)?st.path:[],svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const call=async(q:any)=>{const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-chatbot-flow`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`},body:JSON.stringify(q)}),d=await r.json().catch(()=>({}));if(!r.ok||d?.ok===false)throw new Error(d?.error||`chatbot ${r.status}`);return d};
  const saveState=(n:string,pth:any[])=>a.from('whatsapp_chatbot_flow_state').upsert({conversation_id:x.v.id,org_id:x.v.org_id,current_node:n,path:pth,updated_at:new Date().toISOString()});
  if(restriction){
    if(node==='restricted_urgent'&&t&&!ch0){
      const now=new Date().toISOString();
      const {data:owners}=await a.from('profiles').select('id').eq('org_id',x.v.org_id).limit(10);
      if(owners?.length)await a.from('notifications').insert(owners.map((u:any)=>({org_id:x.v.org_id,user_id:u.id,type:'service',title:'URGÊNCIA de cliente com atendimento restrito',body:'Cliente restrito relatou possível risco à vida ou à integridade física: '+String(t).slice(0,700),link:'/atendimento',read:false})));
      try{await a.from('audit_logs').insert({org_id:x.v.org_id,action:'restricted_client_emergency',entity:'client_service_restriction',entity_id:restriction.id,metadata:{conversation_id:x.v.id,client_id:restrictedClientId,report:String(t).slice(0,1500),at:now}})}catch{}
      await call({org_id:x.v.org_id,conversation_id:x.v.id,phone:p,node:'restricted_urgent_received',path});
      await saveState('restricted',[]);return true;
    }
    if(node==='agent_conversation'&&x.v.owner_agent_key==='billing'&&t&&!ch0){await runAgent(x.v.org_id,x.v.id,p,'billing',t,testMode);return true}
    const d=await call({org_id:x.v.org_id,conversation_id:x.v.id,phone:p,node:'restricted',choice:ch0,text:t,path:[]});
    if(d?.matched){if(d.handoff){await saveState('agent_conversation',d.path||[]);await a.from('whatsapp_conversations').update({owner_agent_key:'billing',conversation_owner:'HELENA',bot_ativo:true,updated_at:new Date().toISOString()}).eq('id',x.v.id);await runAgent(x.v.org_id,x.v.id,p,'billing','A cliente está com atendimento restrito e selecionou regularização financeira. Atenda exclusivamente a pendência financeira; não trate outros assuntos.',testMode)}else await saveState(String(d.node||'restricted'),d.path||[]);return true}
    await call({org_id:x.v.org_id,conversation_id:x.v.id,phone:p,node:'restricted',path:[]});await saveState('restricted',[]);return true;
  }
  const menuNodes=['start','new','urgent','agent_conversation'];
  if(ch0||(t&&!menuNodes.includes(node))){
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
  // Boas-vindas: na PRIMEIRA mensagem da pessoa (nunca recebeu nada da Helena/escritório) — qualquer que seja o texto —
  // ou quando ela só cumprimenta ("oi", "bom dia") depois de 6h sem conversa.
  if(t){
    const {data:lastOut}=await a.from('whatsapp_messages').select('created_at').eq('conversation_id',x.v.id).eq('direction','outbound').order('created_at',{ascending:false}).limit(1).maybeSingle();
    const {data:prevGreet}=await a.from('whatsapp_messages').select('id').eq('conversation_id',x.v.id).eq('direction','outbound').eq('metadata->>kind','greeting').gt('created_at',new Date(Date.now()-12*3600000).toISOString()).limit(1).maybeSingle();
    const {data:older}=await a.from('whatsapp_messages').select('id').eq('conversation_id',x.v.id).lt('created_at',new Date(Date.now()-15*60000).toISOString()).limit(1).maybeSingle();
    const firstContact=!lastOut?.created_at&&!older&&!x.v.last_human_outbound_at&&!x.v.human_takeover_at;
    const onlyGreeting=GREETING.test(t.trim());
    const stale=!lastOut?.created_at||Date.now()-new Date(lastOut.created_at).getTime()>6*3600000;
    if(!prevGreet&&(firstContact||(onlyGreeting&&stale))){
      const ok=await sendGreeting(a,x,p,onlyGreeting);
      if(ok&&onlyGreeting){await saveState('agent_conversation',[]);if(x.v.owner_agent_key)await a.from('whatsapp_conversations').update({owner_agent_key:null}).eq('id',x.v.id);return true}
      if(ok)await sleep(2500);
    }
  }
  if(t){
    // v44: a cada mensagem o assunto é reavaliado (antes, a conversa ficava presa no último agente).
    const key=await pickAgent(a,x,t);
    if(key!==x.v.owner_agent_key)await a.from('whatsapp_conversations').update({owner_agent_key:key,owner_changed_at:new Date().toISOString()}).eq('id',x.v.id);
    await runAgent(x.v.org_id,x.v.id,p,key,t,testMode);if(node!=='agent_conversation')await saveState('agent_conversation',path);return true
  }
  return false;
}

// ===================== ADMIN COMMAND BRIDGE v45 =====================
function samePhone(a:any,b:any){const x=D(a),y=D(b);return !!x&&!!y&&x===y}
async function isAdminSender(a:any,p:string){const {data:rows}=await a.from('whatsapp_settings').select('alert_phone').not('alert_phone','is',null);return (rows||[]).some((x:any)=>samePhone(x.alert_phone,p))}
function parseAdminSchedule(s:string){
 const raw=String(s||'').toLowerCase(),tm=raw.match(/(?:às|as|a)\s*(\d{1,2})(?:[:h](\d{2}))?\b/)||raw.match(/\b(\d{1,2})h(?:(\d{2}))?\b/);if(!tm)return null;
 const hh=Number(tm[1]),mm=Number(tm[2]||0);if(hh>23||mm>59)return null;
 const now=new Date(),sp=new Date(now.toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));let y=sp.getFullYear(),mo=sp.getMonth(),d=sp.getDate();
 if(/\bamanh[ãa]\b/.test(raw)){const z=new Date(y,mo,d+1);y=z.getFullYear();mo=z.getMonth();d=z.getDate()}
 else if(!/\bhoje\b/.test(raw)){const dm=raw.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);if(!dm)return null;d=Number(dm[1]);mo=Number(dm[2])-1;if(dm[3]){y=Number(dm[3]);if(y<100)y+=2000}}
 const local=new Date(y,mo,d,hh,mm,0,0),starts=new Date(local.getTime()+3*3600000),ends=new Date(starts.getTime()+3600000);
 if(!Number.isFinite(starts.getTime())||starts.getTime()<Date.now()-300000)return null;return{starts_at:starts.toISOString(),ends_at:ends.toISOString()}
}
async function operatorSend(a:any,orgId:string,phone:string,message:string){
 const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,r=await fetch(Deno.env.get('SUPABASE_URL')!+'/functions/v1/whatsapp-operator-send',{method:'POST',headers:{Authorization:'Bearer '+svc,apikey:svc,'Content-Type':'application/json'},body:JSON.stringify({org_id:orgId,message,keep_ai_active:true,targets:[{phone:D(phone),name:'Helena'}]})});
 const d=await r.json().catch(()=>null);return{ok:r.ok&&Number(d?.sent||0)>0,data:d}
}
async function handleAdminCommand(a:any,p:string,message:string,inboundId:string){
 const command=String(message||'').trim();
 if(!command)return false;
 const {data:settings}=await a.from('whatsapp_settings').select('org_id,alert_phone,alerts_enabled').not('alert_phone','is',null).limit(50),ws=(settings||[]).find((x:any)=>samePhone(x.alert_phone,p));if(!ws?.org_id)return false;
 const orgId=String(ws.org_id),adminPhone=D(p),since=new Date(Date.now()-86400000).toISOString();
 if(inboundId){const {data:seen}=await a.from('audit_logs').select('id').eq('org_id',orgId).eq('action','helena_admin_command').eq('metadata->>external_message_id',inboundId).limit(1).maybeSingle();if(seen?.id)return true}
 const {data:rows}=await a.from('ai_agent_alerts').select('id,client_id,contact_phone,alert_phone,reason,context,status,created_at').eq('org_id',orgId).gt('created_at',since).order('created_at',{ascending:false}).limit(40);
 const pending=(rows||[]).find((x:any)=>samePhone(x.alert_phone,adminPhone)&&String(x.reason||'').startsWith('ADMIN_COMMAND_PENDING_SCHEDULE')&&x.status==='pending');
 // Mensagens livres no canal administrativo so sao executadas apos pedir instrucao personalizada ou agendamento.
 const customPending=(rows||[]).find((x:any)=>samePhone(x.alert_phone,adminPhone)&&x.status==='pending'&&String(x.reason||'')==='ADMIN_COMMAND_CUSTOM_INSTRUCTION');
 const source=pending||customPending||(rows||[]).find((x:any)=>samePhone(x.alert_phone,adminPhone)&&x.status==='pending'&&!String(x.reason||'').startsWith('ADMIN_COMMAND_'));
 if(!/^[1-5]$/.test(command)&&!pending&&!customPending)return true;
 // Numero reservado a alertas internos: sem alerta pendente, nao entra no atendimento de clientes.
 if(!source?.contact_phone&&!customPending?.contact_phone)return true;
 const targetPhone=D(source.contact_phone),x=await context(a,targetPhone,'',false);let clientId=String(source.client_id||x?.v?.client_id||x?.c?.client_id||'')||null,clientName='';
 if(clientId){const {data:cl}=await a.from('clients').select('name').eq('org_id',orgId).eq('id',clientId).maybeSingle();clientName=String(cl?.name||'')}if(!clientName)clientName=String(x?.c?.name||'cliente');
 const cmd=String(message).trim();
 // Ações do painel administrativo: 1-5 são comandos internos, nunca texto para o cliente.
 const menuChoice=/^[1-5]$/.test(cmd)?cmd:'';
 if(menuChoice==='4'){await a.from('ai_agent_alerts').update({status:'handled',updated_at:new Date().toISOString()}).eq('id',source.id);await operatorSend(a,orgId,adminPhone,'Certo. Nenhuma mensagem será enviada a '+(clientName||'essa cliente')+'.');return true}
 if(menuChoice==='2'){const msg='A Dra. Suzanne recebeu sua solicitação e retornará assim que a agenda permitir. Se houver alguma informação nova importante, pode nos escrever por aqui.';const sent=await operatorSend(a,orgId,targetPhone,msg);if(sent.ok)await a.from('ai_agent_alerts').update({status:'handled',updated_at:new Date().toISOString()}).eq('id',source.id);await operatorSend(a,orgId,adminPhone,sent.ok?'Cliente avisada de que a Dra. Suzanne retornará.':'Não consegui avisar a cliente.');return true}
 if(menuChoice==='3'){const msg='Para que eu encaminhe sua dúvida corretamente à Dra. Suzanne, poderia me explicar um pouco melhor o que aconteceu ou qual informação você precisa?';const sent=await operatorSend(a,orgId,targetPhone,msg);if(sent.ok)await a.from('ai_agent_alerts').update({status:'handled',updated_at:new Date().toISOString()}).eq('id',source.id);await operatorSend(a,orgId,adminPhone,sent.ok?'Pedi à cliente as informações necessárias.':'Não consegui pedir as informações à cliente.');return true}
 if(menuChoice==='5'){await a.from('ai_agent_alerts').insert({org_id:orgId,agent_key:'helena_chatbot',client_id:clientId,contact_phone:targetPhone,alert_phone:adminPhone,reason:'ADMIN_COMMAND_CUSTOM_INSTRUCTION',context:('Aguardando orientação personalizada para '+clientName).slice(0,1500),status:'pending'});await operatorSend(a,orgId,adminPhone,'Escreva a orientação que deseja que eu execute com '+(clientName||'a cliente')+'. Vou tratá-la como comando interno, não como texto para copiar e enviar.');return true}
 if(menuChoice==='1'){
   const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
   const tomorrow=new Date(Date.now()+86400000),day=tomorrow.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
   const rr=await fetch(Deno.env.get('SUPABASE_URL')!+'/functions/v1/ai-agent-calendar',{method:'POST',headers:{Authorization:'Bearer '+svc,apikey:svc,'Content-Type':'application/json'},body:JSON.stringify({org_id:orgId,agent_key:'client_schedule_relationship',action:'availability',date:day,client_id:clientId,client_name:clientName})}),rd=await rr.json().catch(()=>null);
   const slots=(rd?.slots||rd?.available_slots||rd?.data?.slots||[]).slice(0,5);
   if(!rr.ok||!rd?.ok||!slots.length){await operatorSend(a,orgId,adminPhone,'Não consegui obter horários livres reais da agenda para oferecer a '+(clientName||'essa cliente')+'. Nenhuma mensagem de horário foi enviada.');return true}
   const fmt=(s:any)=>{const v=String(s?.slot_start||s?.start||s);try{return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}catch{return v}};
   const opts=slots.map(fmt).filter(Boolean),msg='A Dra. Suzanne pode atendê-la amanhã. Tenho estes horários disponíveis: '+opts.join(', ')+'. Qual deles fica melhor para você?';
   const sent=await operatorSend(a,orgId,targetPhone,msg);
   if(sent.ok){await a.from('ai_agent_alerts').insert({org_id:orgId,agent_key:'client_schedule_relationship',client_id:clientId,contact_phone:targetPhone,alert_phone:adminPhone,reason:'CLIENT_SCHEDULE_OPTIONS_SENT',context:JSON.stringify({date:day,slots,options:opts}).slice(0,1500),status:'pending'});await a.from('ai_agent_alerts').update({status:'handled',updated_at:new Date().toISOString()}).eq('id',source.id)}
   await operatorSend(a,orgId,adminPhone,sent.ok?'Consultei a agenda e ofereci a '+(clientName||'cliente')+' os horários livres de amanhã: '+opts.join(', ')+'.':'Não consegui enviar os horários à cliente.');return true
 }
 await a.from('audit_logs').insert({org_id:orgId,action:'helena_admin_command',entity:'whatsapp',entity_id:source.id,metadata:{external_message_id:inboundId||null,admin_phone:adminPhone,target_phone:targetPhone,client_id:clientId,command:cmd.slice(0,1000),at:new Date().toISOString()}});
 if(/^(n[aã]o responda|n[aã]o envie|deixa|deixe|ignora|ignore)\b/i.test(cmd)){if(pending?.id)await a.from('ai_agent_alerts').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',pending.id);await operatorSend(a,orgId,adminPhone,'Certo. Não enviarei mensagem ao cliente deste alerta.');return true}
 const custom=(rows||[]).find((x:any)=>samePhone(x.alert_phone,adminPhone)&&String(x.reason||'')==='ADMIN_COMMAND_CUSTOM_INSTRUCTION'&&x.status==='pending');
 if(custom){const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const rr=await fetch(Deno.env.get('SUPABASE_URL')!+'/functions/v1/ai-provider-gateway',{method:'POST',headers:{Authorization:'Bearer '+svc,apikey:svc,'Content-Type':'application/json'},body:JSON.stringify({org_id:orgId,provider:'auto',instructions:'Você transforma uma orientação interna da Dra. Suzanne em uma mensagem elegante ao cliente. Nunca repita comandos internos como consulte minha agenda, fale com ela, ofereça horários ou você precisa ir. Gere somente a mensagem que o cliente deve receber, sem inventar fatos, horários ou providências.',input:cmd})}),rd=await rr.json().catch(()=>null);const msg=String(rd?.text||'').trim();if(!rr.ok||!rd?.ok||!msg){await operatorSend(a,orgId,adminPhone,'Não consegui transformar sua orientação com segurança. Nada foi enviado à cliente.');return true}const sent=await operatorSend(a,orgId,targetPhone,msg);if(sent.ok)await a.from('ai_agent_alerts').update({status:'handled',updated_at:new Date().toISOString()}).eq('id',custom.id);await operatorSend(a,orgId,adminPhone,sent.ok?'Orientação executada com '+(clientName||'a cliente')+'.':'Não consegui executar a orientação.');return true}
 const wantsSchedule=/\b(agend|marc|consulta|atendimento|reuni[aã]o)\w*/i.test(cmd)||!!pending;
 if(wantsSchedule){
  const when=parseAdminSchedule(cmd);
  if(!when){if(!pending)await a.from('ai_agent_alerts').insert({org_id:orgId,agent_key:'helena_chatbot',client_id:clientId,contact_phone:targetPhone,alert_phone:adminPhone,reason:'ADMIN_COMMAND_PENDING_SCHEDULE',context:('Agendamento solicitado para '+clientName+'. Comando: '+cmd).slice(0,1500),status:'pending'});await operatorSend(a,orgId,adminPhone,'Certo. Para agendar '+(clientName||'essa cliente')+', me diga o dia e o horário. Ex.: “amanhã às 15h” ou “08/10 às 14h30”.');return true}
  const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,rr=await fetch(Deno.env.get('SUPABASE_URL')!+'/functions/v1/ai-agent-calendar',{method:'POST',headers:{Authorization:'Bearer '+svc,apikey:svc,'Content-Type':'application/json'},body:JSON.stringify({org_id:orgId,agent_key:'client_schedule_relationship',action:'create',client_id:clientId,client_name:clientName,title:'Atendimento online — '+(clientName||'Cliente'),starts_at:when.starts_at,ends_at:when.ends_at,meeting_mode:'online'})}),rd=await rr.json().catch(()=>null);
  if(!rr.ok||!rd?.ok){await operatorSend(a,orgId,adminPhone,'Não consegui confirmar o agendamento de '+(clientName||'essa cliente')+': '+String(rd?.error||'horário indisponível').slice(0,220)+'.');return true}
  if(pending?.id)await a.from('ai_agent_alerts').update({status:'handled',updated_at:new Date().toISOString()}).eq('id',pending.id);
  const whenBr=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(rd.event.starts_at)),clientMsg='Seu atendimento com a Dra. Suzanne foi agendado para '+whenBr+'. Será realizado online.'+(rd.meeting_url?'\n\nLink de acesso: '+rd.meeting_url:'');
  await operatorSend(a,orgId,targetPhone,clientMsg);await operatorSend(a,orgId,adminPhone,'Agendado. '+(clientName||'Cliente')+': '+whenBr+'. A confirmação também foi enviada ao cliente.');return true
 }
 let clientMsg=cmd.replace(/^(diga|avise|informe|responda|fale|mande|envie|pe[cç]a)\s+(?:para\s+(?:ela|ele|a cliente|o cliente)\s+)?(?:que\s+)?/i,'').trim();if(!clientMsg)clientMsg=cmd;clientMsg=clientMsg.charAt(0).toUpperCase()+clientMsg.slice(1);
 const sent=await operatorSend(a,orgId,targetPhone,clientMsg);if(!sent.ok){await operatorSend(a,orgId,adminPhone,'Não consegui enviar a orientação ao cliente. O comando foi registrado para conferência.');return true}
 await operatorSend(a,orgId,adminPhone,'Enviado para '+(clientName||'o cliente')+': “'+clientMsg.slice(0,280)+'”');return true
}
// ===================================================================

Deno.serve(async req=>{if(req.method!=='POST')return J({ok:false},405);try{const a=A(),client=await S(a,'zapi_client_token'),got=new URL(req.url).searchParams.get('key')||'';const evolutionBridge=req.headers.get('authorization')==='Bearer '+Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')&&req.headers.get('x-evolution-bridge')==='suzanne-lexoffice';if(!evolutionBridge&&(!client||got!==await H(client)))return J({ok:false},401);const b=await req.json().catch(()=>null);if(!b)return J({ok:true,ignored:'empty'});const activeProvider=(await S(a,'whatsapp_active_provider')).toLowerCase();if((evolutionBridge&&activeProvider!=='evolution')||(!evolutionBridge&&activeProvider!=='zapi'))return J({ok:true,ignored:'provider_disabled'});const type=String(b.type||b.event||'').toLowerCase();if(type.includes('disconnect'))return J({ok:true,event:'disconnected'});if(type.includes('connect'))return J({ok:true,event:'connected'});if(type.includes('status')){const externalId=String(b.messageId||b.zaapId||b.id||b.message?.id||b.ids?.[0]?.id||'').trim(),rawStatus=String(b.status||b.messageStatus||b.message?.status||type).toLowerCase(),now=new Date().toISOString(),isRead=/read|played|lido/.test(rawStatus),isDelivered=isRead||/delivered|received|entregue/.test(rawStatus);if(externalId&&(isDelivered||isRead)){const {data:q}=await a.from('process_notification_queue').select('id,org_id,owner_user_id,process_id,delivered_at,read_at').eq('external_message_id',externalId).limit(1).maybeSingle();const patch:any={};if(isDelivered)patch.delivered_at=now;if(isRead)patch.read_at=now;if(Object.keys(patch).length){await a.from('process_notification_queue').update(patch).eq('external_message_id',externalId);await a.from('whatsapp_messages').update({...patch,status:isRead?'read':'delivered'}).eq('external_message_id',externalId)}if(q?.owner_user_id&&isDelivered&&!q.delivered_at){const when=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date());await a.from('notifications').insert({org_id:q.org_id,user_id:q.owner_user_id,type:'process',title:'Andamento entregue ao cliente',body:`O cliente recebeu o andamento em ${when}.`,link:q.process_id?`/processos?processo=${q.process_id}`:'/andamentos',read:false})}}return J({ok:true,event:'status',external_message_id:externalId||null,status:rawStatus,tracked:!!externalId&&(isDelivered||isRead)})}const p=D(b.phone||b.sender?.phone||b.from||b.chatId||b.participantPhone||b.senderPhone),t=text(b),ch=choice(b),m=media(b);
const senderName=String(b.senderName||b.chatName||b.sender?.name||'').trim();
const inboundId=String(b.messageId||b.zaapId||b.id||b.message?.id||'').trim();
const fromMe=b.fromMe===true||b.from_me===true||b.fromMe==='true'||b.from_me==='true'||b.isFromMe===true||b?.message?.fromMe===true;
const fromApi=b.fromApi===true||b.fromApi==='true'||b.isFromApi===true;
if(fromMe&&fromApi)return J({ok:true,ignored:'own_api_echo'});
if(!p)return J({ok:true,ignored:'phone'});
if(b.isGroup||b.isNewsletter)return J({ok:true,ignored:'non_inbound'});
if(!fromMe&&!t&&!ch&&!m)return J({ok:true,ignored:'empty_inbound_event'});
if(!fromMe&&inboundId){
  const {data:seen}=await a.from('whatsapp_messages').select('id').eq('external_message_id',inboundId).limit(1).maybeSingle();
  if(seen?.id)return J({ok:true,ignored:'duplicate_or_own_message',external_message_id:inboundId});
}
if(!fromMe&&!m&&(t||ch)){try{if(await handleAdminCommand(a,p,t||ch,inboundId))return J({ok:true,event:'admin_command'})}catch(e){console.error('admin command',e)}}
// Um numero administrativo nao pode virar lead, cliente ou disparar o menu do publico.
if(!fromMe&&await isAdminSender(a,p))return J({ok:true,ignored:'admin_channel_reserved'});
// "QUERO MEU ACESSO" e resposta com CPF: tratado antes de qualquer outra regra.
if(!fromMe&&!m&&(t||ch)){try{if(await accessFlow(a,p,t,ch,inboundId,senderName))return J({ok:true,event:'client_app_access'})}catch(e){console.error('accessFlow',e)}}
// Áudio, imagem e PDF: lê o conteúdo (OpenAI) e segue o atendimento com esse conteúdo.
if(!fromMe&&m&&(m.type==='audio'||m.type==='image'||m.type==='document')){
  const x=await context(a,p,senderName,true);
  if(!x){if(m.type==='audio')return J({ok:true,ignored:'audio_without_context'})}
  else{
    if(!(await claimInbound(a,x,inboundId,t||`[${m.type}]`,'',m.type)))return J({ok:true,ignored:'duplicate_media'});
    const svc=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;let extracted='',read=false;
    try{const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-media-analyzer`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${svc}`},body:JSON.stringify({org_id:x.v.org_id,url:m.url,type:m.type,mime:m.mimeType,filename:m.fileName})});const d=await r.json().catch(()=>null);read=!!d?.ok;extracted=String(d?.text||'').trim();if(!read)console.warn('media-analyzer',d?.error)}catch(e){console.error('media-analyzer',e)}
    const label=m.type==='audio'?'🎤 Áudio transcrito':m.type==='image'?'🖼️ Imagem recebida':'📄 Documento recebido';
    const stored=read?`${label}: ${extracted}`:`${label} (não foi possível ler automaticamente)`;
    const body=((t?t+'\n\n':'')+stored).slice(0,4000);
    if(inboundId)await a.from('whatsapp_messages').update({body,media_mime_type:m.mimeType||null,media_file_name:m.fileName||null}).eq('org_id',x.v.org_id).eq('external_message_id',inboundId);
    if(m.type!=='audio'){try{const {data:owners}=await a.from('profiles').select('id').eq('org_id',x.v.org_id).limit(10);if(owners?.length)await a.from('notifications').insert(owners.map((u:any)=>({org_id:x.v.org_id,user_id:u.id,type:'document',title:m.type==='image'?'Cliente enviou uma imagem':'Cliente enviou um documento',body:stored.slice(0,600),link:'/atendimento',read:false})))}catch{}}
    if(m.type==='audio'&&!read){await gateSend(x.v.org_id,x.v.id,p,'Não consegui ouvir seu áudio agora. Pode me escrever a mensagem, por gentileza?',`audio_fail:${inboundId}`);return J({ok:true,event:'audio_unreadable'})}
    if(m.type==='audio'&&read&&isAccessRequest(extracted)){try{if(await accessFlow(a,p,extracted,'','',senderName))return J({ok:true,event:'client_app_access_audio'})}catch(e){console.error('accessFlow audio',e)}}
    const agentText=m.type==='audio'?extracted:`[O cliente enviou ${m.type==='image'?'uma imagem':'um documento'}${t?` com a legenda: "${t}"`:''}. Conteúdo lido automaticamente: ${read?extracted:'não foi possível ler'}. Confirme o recebimento de forma breve e acolhedora. Se for comprovante de pagamento, agradeça e diga que a Dra. Suzanne vai conferir e dar baixa. Não repita dados pessoais do documento na resposta e não faça perguntas desnecessárias.]`;
    const handled=await bot(a,p,'',agentText,inboundId,true,senderName);
    return J({ok:true,event:'media',kind:m.type,read,handled});
  }
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
}if(await bot(a,p,ch,t,inboundId,false,senderName))return J({ok:true,event:'chatbot'});const mp=m?{[m.type]:{url:m.url,fileName:m.fileName,mimeType:m.mimeType}}:{};const payload={event:'message.any',payload:{id:String(b.messageId||b.zaapId||b.id||'')||null,fromMe:false,from:p+'@c.us',to:p+'@c.us',chatId:p+'@c.us',body:t||ch,pushName:senderName||null,source:'zapi',...mp}};const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/waha-message-webhook`,{method:'POST',headers:{'Content-Type':'application/json','x-lexoffice-webhook-key':(Deno.env.get('WAHA_API_KEY')||'').trim()},body:JSON.stringify(payload)}),d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error||'Falha no processamento interno');return J({ok:true,event:'message',processed:d})}catch(e){console.error('zapi-message-webhook',e);return J({ok:false,error:e instanceof Error?e.message:String(e)},500)}});

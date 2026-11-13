// SF Private Care — motores determinísticos de proposta, sem disparo automático.
// A camada de execução deve persistir as propostas em fila auditável e exigir aprovação.
import { planejarRelacionamento, deduplicar, type Cliente, type Processo, type Proposta, type PendenciaRelacionamento } from "./sf-proactive-relationship.ts";

export type EventoSF =
  | { kind:"phase_changed"; process_id:string; phase:string; verified_at:string; explanation:string }
  | { kind:"movement_verified"; process_id:string; movement_id:string; verified_at:string; explanation:string }
  | { kind:"hearing"; process_id:string; hearing_id:string; scheduled_at:string; preparation:string }
  | { kind:"onboarding"; process_id:string|null; contract_verified:boolean }
  | { kind:"document_request"; process_id:string; request_id:string; instructions:string };

export type ContextoSF = {
  cliente:Cliente; processos:Processo[]; agora:Date; ultimaInteracao?:string|null;
  pendencias?:PendenciaRelacionamento[];
  eventos:EventoSF[]; chavesEnviadas:Set<string>; chavesPendentes:Set<string>;
  humanoAtivo:boolean; ultimaMensagemHumana?:string|null; urgente:boolean;
  bloqueioFinanceiro:boolean; janelaMetaAberta:boolean; modeloMetaAprovado:boolean;
};

export type PropostaSF=Proposta & {channel:"app"|"whatsapp"; media:"text"|"audio"|"video"|"poll"; source_id:string|null};

const validDate=(v:string)=>Number.isFinite(new Date(v).getTime());
const daysUntil=(v:string,now:Date)=>Math.ceil((new Date(v).getTime()-now.getTime())/86400000);
const elapsedMinutes=(v:string,now:Date)=>(now.getTime()-new Date(v).getTime())/60000;
const firstName=(name:string)=>name.trim().split(/\s+/)[0]||"cliente";
const safe=(s:string)=>s.replace(/[<>]/g,"").trim().slice(0,650);

export function planejarMotoresSF(ctx:ContextoSF):PropostaSF[]{
  const {cliente,agora}=ctx;
  if(!cliente.opt_in||cliente.opt_out||ctx.urgente||ctx.bloqueioFinanceiro)return [];
  if(ctx.humanoAtivo||ctx.ultimaMensagemHumana&&validDate(ctx.ultimaMensagemHumana)&&elapsedMinutes(ctx.ultimaMensagemHumana,agora)<20)return [];
  if(!["ativo","active","cliente","cliente_ativo","cliente_private"].includes((cliente.status||"").toLowerCase()))return [];
  const pids=new Set(ctx.processos.map(p=>p.id));
  const proposals:PropostaSF[]=[];
  const add=(kind:string,processId:string|null,key:string,text:string,media:PropostaSF["media"],sourceId:string|null)=>{
    // Nunca inventar confirmação de auditoria, movimentação, assinatura ou audiência.
    proposals.push({client_id:cliente.id,process_id:processId,kind,dedupe_key:key,priority:"review",requires_approval:true,
      text:safe(text),channel:ctx.janelaMetaAberta||ctx.modeloMetaAprovado?"whatsapp":"app",media,source_id:sourceId});
  };
  const name=firstName(cliente.name);
  for(const e of ctx.eventos){
    if("process_id" in e&&e.process_id&&!pids.has(e.process_id))continue;
    if(e.kind==="phase_changed"&&validDate(e.verified_at)&&e.explanation.trim()){
      add("phase_video",e.process_id,`phase:${e.process_id}:${e.phase}:${e.verified_at.slice(0,10)}`,
        `Olá, ${name}! A fase do seu processo foi atualizada: ${e.phase}. ${e.explanation}`,"video",e.process_id);
    } else if(e.kind==="movement_verified"&&validDate(e.verified_at)&&e.explanation.trim()){
      add("movement_audio",e.process_id,`movement:${e.process_id}:${e.movement_id}`,
        `Olá, ${name}! Temos uma atualização verificada do seu processo. ${e.explanation}`,"audio",e.movement_id);
    } else if(e.kind==="hearing"&&validDate(e.scheduled_at)&&e.preparation.trim()){
      const d=daysUntil(e.scheduled_at,agora);
      if(d===7||d===3||d===1)add("hearing_preparation",e.process_id,`hearing:${e.hearing_id}:D-${d}`,
        `Olá, ${name}! Sua audiência se aproxima. ${e.preparation}`,"text",e.hearing_id);
    } else if(e.kind==="onboarding"&&e.contract_verified){
      add("onboarding_video",e.process_id,`onboarding:${cliente.id}`,
        `Olá, ${name}! Bem-vindo(a) ao acompanhamento digital do escritório. Conheça os recursos do seu aplicativo.`,"video",null);
    } else if(e.kind==="document_request"&&e.instructions.trim()){
      add("document_checklist",e.process_id,`documents:${e.request_id}`,
        `Olá, ${name}! Preparamos orientações para os documentos do seu processo. ${e.instructions}`,"text",e.request_id);
    }
  }
  for(const p of planejarRelacionamento(cliente,ctx.processos,agora,ctx.ultimaInteracao,ctx.pendencias)){
    proposals.push({...p,channel:ctx.janelaMetaAberta||ctx.modeloMetaAprovado?"whatsapp":"app",media:"text",source_id:p.process_id});
  }
  const seen=new Set([...ctx.chavesEnviadas,...ctx.chavesPendentes]);
  return deduplicar(proposals,seen).filter((p,i,a)=>a.findIndex(x=>x.dedupe_key===p.dedupe_key)===i);
}

// Regras obrigatórias no executor: aprovação humana individual; envio Meta somente com
// janela de atendimento válida ou template aprovado; idempotência persistida em banco;
// opt-out verificado novamente no instante do envio; nunca fallback para outros provedores.

// Decisão operacional sem revisão manual para comunicações rotineiras verificadas.
// Não executa envios: a camada de transporte ainda deve revalidar consentimento,
// autorização Meta, opt-out, idempotência, limite diário e horário permitido.
export function elegivelParaEnvioAutomatico(proposta:PropostaSF, ctx:ContextoSF):boolean{
  const rotina=new Set(["hearing_preparation","document_checklist"]);
  if(!rotina.has(proposta.kind)||proposta.media!=="text"||proposta.channel!=="whatsapp")return false;
  if(!ctx.cliente.opt_in||ctx.cliente.opt_out||ctx.humanoAtivo||ctx.urgente||ctx.bloqueioFinanceiro)return false;
  if(ctx.ultimaMensagemHumana&&validDate(ctx.ultimaMensagemHumana)&&elapsedMinutes(ctx.ultimaMensagemHumana,ctx.agora)<20)return false;
  if(!ctx.janelaMetaAberta&&!ctx.modeloMetaAprovado)return false;
  if(ctx.chavesEnviadas.has(proposta.dedupe_key)||ctx.chavesPendentes.has(proposta.dedupe_key))return false;
  return proposta.client_id===ctx.cliente.id&&(!proposta.process_id||ctx.processos.some(p=>p.id===proposta.process_id));
}

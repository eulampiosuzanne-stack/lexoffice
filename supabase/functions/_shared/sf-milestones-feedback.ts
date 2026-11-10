// SF: eventos de relacionamento, sem execução de envio nem decisão jurídica automática.
export type MarcoSF =
 | {kind:"favorable_interim_decision";clientId:string;processId:string;decisionId:string;verified:boolean;reviewedByLawyer:boolean;summary:string;isFinal:boolean}
 | {kind:"case_closed";clientId:string;processId:string;closureId:string;verified:boolean;reviewedByLawyer:boolean}
 | {kind:"agreement_preference";clientId:string;processId:string;questionId:string;verified:boolean};
export type MensagemMarcoSF={key:string;kind:"milestone"|"nps"|"poll";clientId:string;processId:string;text:string;options?:string[];requiresApproval:boolean};
const clean=(v:string)=>v.replace(/[<>]/g,"").trim().slice(0,400);
export function planejarMarcoSF(e:MarcoSF):MensagemMarcoSF|null{
 if(!e.clientId||!e.processId||!e.verified)return null;
 if(e.kind==="favorable_interim_decision"){
  if(!e.reviewedByLawyer||!e.decisionId||!clean(e.summary))return null;
  return {key:`sf:decision:${e.processId}:${e.decisionId}`,kind:"milestone",clientId:e.clientId,processId:e.processId,
   text:`🎉 Uma etapa importante do seu processo teve decisão favorável. ${clean(e.summary)} ${e.isFinal?"A decisão foi registrada como definitiva após conferência jurídica.":"Essa decisão ainda não significa o encerramento do processo."} Acompanhe os detalhes no portal seguro.`,
   requiresApproval:true};
 }
 if(e.kind==="case_closed"){
  if(!e.reviewedByLawyer||!e.closureId)return null;
  return {key:`sf:nps:${e.processId}:${e.closureId}`,kind:"nps",clientId:e.clientId,processId:e.processId,
   text:"🌷 Acompanhamento encerrado. De 0 a 10, como você avalia o atendimento da nossa equipe? Sua resposta é opcional.",
   options:Array.from({length:11},(_,i)=>String(i)),requiresApproval:false};
 }
 if(!e.questionId)return null;
 return {key:`sf:poll:${e.processId}:${e.questionId}`,kind:"poll",clientId:e.clientId,processId:e.processId,
 text:"Se a outra parte apresentasse uma proposta de acordo, como você preferiria proceder?",
 options:["Quero avaliar com a Dra. Suzanne","Prefiro conversar antes de decidir"],
 requiresApproval:true};
}
// Enquete não é autorização de acordo; opções de NPS 0–10 podem exigir fluxo
// interativo em múltiplas etapas conforme os limites da API oficial da Meta.
// Executor deve validar vínculo, opt-in, templates, janela Meta e idempotência.

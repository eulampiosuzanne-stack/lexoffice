// Helena: políticas de acolhimento fora do expediente e lembrete de acesso comprovado.
// Não envia mensagens; retorna decisões para executor autenticado com fila idempotente.
export type HorarioSF={weekday:number;hour:number;minute:number;year:number;month:number;day:number};
const fmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false});
export function horarioSP(agora:Date):HorarioSF{
 const parts=Object.fromEntries(fmt.formatToParts(agora).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
 const weekdays:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
 return {weekday:weekdays[parts.weekday],hour:Number(parts.hour)%24,minute:Number(parts.minute),year:Number(parts.year),month:Number(parts.month),day:Number(parts.day)};
}
export function foraDoExpediente(agora:Date):boolean{
 const h=horarioSP(agora);return h.weekday===0||h.weekday===6||h.hour<8||h.hour>=18;
}
export function proximoCheckupSP(agora:Date):string{
 // Data local, não UTC: inclui finais de semana. Feriados exigem calendário externo.
 const h=horarioSP(agora);let days= h.weekday===6?2:h.weekday===0?1:h.hour>=18?1:0;
 const date=new Date(Date.UTC(h.year,h.month-1,h.day+days,12));
 let w=date.getUTCDay();if(w===6)date.setUTCDate(date.getUTCDate()+2);if(w===0)date.setUTCDate(date.getUTCDate()+1);
 return date.toISOString().slice(0,10)+"T09:00:00-03:00";
}
export function mensagemSono(nome:string,agora:Date,urgente:boolean):{send:boolean;texto:string;checkupAt:string|null}{
 if(urgente)return {send:false,texto:"",checkupAt:null};
 if(!foraDoExpediente(agora))return {send:false,texto:"",checkupAt:null};
 const primeiro=(nome||"").trim().split(/\s+/)[0]||"";
 return {send:true,checkupAt:proximoCheckupSP(agora),texto:`Olá, ${primeiro}! 🌷 Recebi sua mensagem e deixei tudo registrado por aqui. Nossa equipe retoma os atendimentos no próximo dia útil, e programei um acompanhamento para as 9h. Se houver risco à integridade física ou ameaça de morte, escreva URGÊNCIA para seguirmos o protocolo de plantão. Cuide-se!`};
}
export type LeituraSF={
 clientId:string;contentId:string;sentAt:string;openedAt:string|null;
 consent:boolean;optOut:boolean;humanTakeover:boolean;urgent:boolean;
 alreadyReminded:boolean;hasValidTracking:boolean;templateApproved:boolean;windowOpen:boolean;
};
export function lembreteLeitura(input:LeituraSF,agora:Date):{eligible:boolean;key:string;texto:string}{
 const key=`read-reminder:${input.clientId}:${input.contentId}`;
 const elapsed=agora.getTime()-new Date(input.sentAt).getTime();
 const eligible=!!input.clientId&&!!input.contentId&&input.consent&&!input.optOut&&!input.humanTakeover&&!input.urgent
  &&!input.alreadyReminded&&input.hasValidTracking&&!input.openedAt&&Number.isFinite(elapsed)&&elapsed>=86400000
  &&(input.windowOpen||input.templateApproved)&&!foraDoExpediente(agora);
 return {eligible,key,texto:`Oi! 🐾 A Guardiã passou para lembrar que o conteúdo do seu processo continua disponível no aplicativo. Quando puder, acesse para conferir as orientações. Se já viu por outro dispositivo, pode desconsiderar este recado.`};
}
// Executor: somente Meta, validação de opt-in/opt-out no envio, idempotência persistente,
// limites de frequência e consentimento para rastreamento; jamais afirmar visualização sem evento.

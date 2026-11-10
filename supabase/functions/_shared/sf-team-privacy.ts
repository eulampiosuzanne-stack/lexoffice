// Projeção pública de eventos internos, sem revelar identidade da equipe.
// Não alterar autoria nem trilha de auditoria interna.
export type EventoInternoSF={
 id:string;kind:"deadline_review"|"document_attached"|"case_review"|"other";
 verified:boolean;clientVisible:boolean;processId:string;occurredAt:string;
 actorId:string;actorName?:string;actorEmail?:string;internalNotes?:string;
 documentName?:string;details?:string;
};
export type EventoClienteSF={eventId:string;processId:string;occurredAt:string;sender:"Helena"|"Equipe jurídica";message:string};
export function projetarEventoCliente(e:EventoInternoSF):EventoClienteSF|null{
 if(!e.verified||!e.clientVisible)return null;
 const mensagens:Record<EventoInternoSF["kind"],string>={
 deadline_review:"Nossa equipe jurídica concluiu a conferência interna relacionada ao acompanhamento do seu processo.",
 document_attached:"Nossa equipe jurídica registrou um documento no acompanhamento do seu processo.",
 case_review:"Nossa equipe jurídica concluiu uma etapa de revisão interna do seu processo.",
 other:"Uma atualização interna foi registrada no acompanhamento do seu processo."
 };
 return {eventId:e.id,processId:e.processId,occurredAt:e.occurredAt,sender:"Equipe jurídica",message:mensagens[e.kind]};
}
// Os campos actorId, actorName, actorEmail, internalNotes e documentName jamais
// entram no payload público. Auditoria interna preserva autoria real e permissões.

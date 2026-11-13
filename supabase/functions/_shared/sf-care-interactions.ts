// SF Care: propostas de cards e enquetes. Não transmite mensagens.
export type CardSF={id:string;process_id:string|null;category:"processual"|"acolhimento"|"escritorio"|"bastidores";title:string;body:string;source_id:string|null;requires_approval:true};
export type EnqueteSF={id:string;question:string;options:{id:string;label:string}[];requires_approval:true};
export type RespostaSF={client_id:string;poll_id:string;option_id:string;inbound_event_id:string;verified_identity:boolean};
export type EncaminhamentoSF={route:"helena"|"revisao_humana";intent:string;dedupe_key:string;context:string};
export function cardSF(input:Omit<CardSF,"requires_approval">):CardSF {
 if(!input.title.trim()||!input.body.trim())throw new Error("Conteúdo obrigatório");
 if((input.category==="processual"||input.category==="bastidores")&&(!input.process_id||!input.source_id))
  throw new Error("Card factual exige processo e fonte verificada");
 return {...input,requires_approval:true};
}
export const enquetesSF:EnqueteSF[]=[
 {id:"experiencia",question:"Como está sua experiência com nosso atendimento?",options:[{id:"satisfeito",label:"Estou satisfeito(a)"},{id:"duvida",label:"Tenho uma dúvida"},{id:"conversar",label:"Gostaria de conversar"},{id:"ajuda",label:"Preciso de ajuda"}],requires_approval:true},
 {id:"orientacoes",question:"Qual orientação seria mais útil agora?",options:[{id:"etapas",label:"Etapas do processo"},{id:"prazos",label:"Prazos judiciais"},{id:"aplicativo",label:"Como usar o aplicativo"},{id:"documentos",label:"Como enviar documentos"}],requires_approval:true}
];
export function encaminharRespostaSF(resposta:RespostaSF,seen:Set<string>):EncaminhamentoSF|null {
 if(!resposta.verified_identity||!resposta.client_id||!resposta.inbound_event_id)return null;
 const poll=enquetesSF.find(p=>p.id===resposta.poll_id);
 const option=poll?.options.find(o=>o.id===resposta.option_id);
 if(!poll||!option||seen.has(resposta.inbound_event_id))return null;
 const humana=resposta.poll_id==="experiencia"&&["conversar","ajuda"].includes(resposta.option_id);
 return {route:humana?"revisao_humana":"helena",intent:resposta.option_id,dedupe_key:"sf-poll:"+resposta.inbound_event_id,context:`Enquete: ${poll.question} | Resposta: ${option.label}`};
}

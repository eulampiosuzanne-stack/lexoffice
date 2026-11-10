/** SF Private Care: educational content only; never individual legal advice. */
export type SfPill = {id:string;area:string;title:string;body:string;videoUrl?:string};
export const sfPills:SfPill[] = [
{id:"familia-alimentos",area:"familia",title:"Como o juiz avalia os alimentos?",body:"A análise considera as necessidades de quem recebe e as possibilidades de quem paga, conforme as circunstâncias e as provas do processo."},
{id:"familia-acordo",area:"familia",title:"Uma proposta de acordo precisa ser aceita?",body:"Não. Uma proposta pode ser analisada com orientação jurídica. Responder a uma enquete não significa aceitar ou recusar um acordo."},
{id:"sucessoes-inventario",area:"sucessoes",title:"Por que o inventário exige documentos?",body:"A identificação de herdeiros, bens, dívidas e informações fiscais ajuda a definir os próximos passos do procedimento."},
{id:"civel-andamento",area:"civel",title:"O que significa aguardar decisão?",body:"Pode significar que uma questão está submetida à apreciação judicial. O prazo depende do procedimento e das circunstâncias do processo."}
];
export type SfPoll={id:string;area:string;question:string;options:{id:string;label:string}[]};
export const sfPolls:SfPoll[]=[
{id:"acordo-expectativa",area:"familia",question:"Se surgir uma proposta de acordo, como prefere conversar sobre ela?",options:[{id:"avaliar",label:"Quero avaliar com a Dra. Suzanne."},{id:"duvidas",label:"Tenho dúvidas e gostaria de orientação."},{id:"aguardar",label:"Neste momento, prefiro aguardar."}]},
{id:"audiencia-preparo",area:"geral",question:"Qual tema gostaria de entender melhor antes da audiência?",options:[{id:"etapas",label:"Como a audiência funciona."},{id:"documentos",label:"Quais documentos preparar."},{id:"orientacao",label:"Como esclarecer minhas dúvidas."}]}
];
export function chooseSfPill(area:string,usedIds:Set<string>):SfPill|null {
 return sfPills.find(p=>p.area===area&&!usedIds.has(p.id))||null;
}
export function chooseSfPoll(area:string,usedIds:Set<string>):SfPoll|null {
 return sfPolls.find(p=>(p.area===area||p.area==="geral")&&!usedIds.has(p.id))||null;
}
export function shouldOfferSfContent({consent,unsubscribed,humanTakeover,minutesSinceHuman,urgent,alreadyContactedToday}:{consent:boolean;unsubscribed:boolean;humanTakeover:boolean;minutesSinceHuman:number;urgent:boolean;alreadyContactedToday:boolean}) {
 return consent&&!unsubscribed&&!urgent&&!alreadyContactedToday&&(!humanTakeover||minutesSinceHuman>=20);
}

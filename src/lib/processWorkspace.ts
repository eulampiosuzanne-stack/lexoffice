export type ProcessRow=Record<string,any>;
export const movementDate=(value:unknown)=>{if(!value)return 'Não informada';const date=new Date(String(value));return Number.isFinite(date.getTime())?date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informada';};
export function movementPriority(title=''){const text=title.toLowerCase();if(/pris[aã]o|liminar|tutela|senten[cç]a|extin[cç][aã]o|tr[aâ]nsito|penhora|bloqueio|leil[aã]o|audi[eê]ncia|per[ií]cia|prazo|medida protetiva/.test(text))return 'Destaque';if(/conclus|decis[aã]o|despacho|intima[cç][aã]o|cita[cç][aã]o|expedi[cç][aã]o/.test(text))return 'Atenção';return 'Rotina';}
export function movementDelivery(movement:ProcessRow|null,queue:ProcessRow|null){
 if(queue?.read_at)return{kind:'confirmed',label:'Lido pelo cliente',detail:`Leitura confirmada em ${movementDate(queue.read_at)}.`};
 if(queue?.delivered_at||queue?.status==='delivered')return{kind:'confirmed',label:'Entrega confirmada',detail:queue.delivered_at?`Entrega confirmada em ${movementDate(queue.delivered_at)}.`:'O serviço registrou a entrega; horário não informado.'};
 if(queue?.status==='sent')return{kind:'sent',label:'Enviado · entrega não confirmada',detail:queue.sent_at?`Disparo registrado em ${movementDate(queue.sent_at)}. Sem confirmação de entrega.`:'O serviço registrou o disparo, sem confirmação de entrega.'};
 if(['failed','error'].includes(queue?.status))return{kind:'error',label:'Falha no envio',detail:queue?.last_error||'O envio não foi confirmado.'};
 if(queue?.status==='cancelled')return{kind:'muted',label:'Envio cancelado',detail:queue.last_error||'Esta comunicação não está liberada para envio.'};
 if(queue?.status==='awaiting_review')return{kind:'review',label:'Aguardando aprovação',detail:'A comunicação depende de uma decisão do escritório.'};
 if(['pending','processing'].includes(queue?.status))return{kind:'pending',label:queue?.status==='processing'?'Em processamento':'Autorizado · aguardando envio',detail:'Autorização não significa disparo nem entrega ao cliente.'};
 if(queue)return{kind:'muted',label:'Situação não reconhecida',detail:'Consulte o registro antes de considerar a mensagem enviada.'};
 if(movement?.sent_to_client_at)return{kind:'sent',label:'Registro de envio',detail:`Registro em ${movementDate(movement.sent_to_client_at)}; sem confirmação de entrega.`};
 if(movement?.approved_for_client===false)return{kind:'muted',label:'Não autorizado',detail:'A movimentação não está liberada para comunicação.'};
 if(movement?.approved_for_client===true)return{kind:'pending',label:'Autorização registrada',detail:'Não há confirmação de disparo ou entrega nesta consulta.'};
 return{kind:'muted',label:'Sem comunicação registrada',detail:'A movimentação está registrada; não há confirmação de envio ao cliente.'};
}
export function captureBounds(period:string,now=new Date()){const days=period==='48h'?2:period==='7d'?7:period==='30d'?30:0;return days?new Date(now.getTime()-days*86400000).toISOString():null;}
export function nextProcessEvents(deadlines:ProcessRow[],hearings:ProcessRow[],now=new Date()){
 const tasks=deadlines.filter(row=>!['completed','cancelled','canceled'].includes(row.status)).map(row=>({id:'deadline:'+row.id,title:row.title||'Prazo',date:row.due_at,type:'Prazo',overdue:new Date(row.due_at).getTime()<now.getTime()}));
 const events=hearings.filter(row=>!['completed','cancelled','canceled'].includes(row.status)&&new Date(row.starts_at).getTime()>=now.getTime()).map(row=>({id:'hearing:'+row.id,title:row.title||'Audiência',date:row.starts_at,type:'Audiência',overdue:false}));
 return [...tasks,...events].filter(row=>row.date&&Number.isFinite(new Date(row.date).getTime())).sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()).slice(0,5);
}
/** Keep the two existing records consistent where possible and report partial changes explicitly. */
export async function decideProcessNotice(db:any,item:ProcessRow,approved:boolean,orgId:string){
 const current=await db.from('process_notification_queue').select('id,process_id,client_id,movement_id,message_text,send_to_client_app,status').eq('id',item.id).eq('org_id',orgId).maybeSingle();
 if(current.error)throw new Error(current.error.message);if(!current.data||current.data.status!=='awaiting_review')throw new Error('Esta comunicação já mudou. Atualize a lista antes de decidir.');
 if(current.data.message_text!==item.message_text||Boolean(current.data.send_to_client_app)!==Boolean(item.send_to_client_app)||current.data.movement_id!==item.movement_id)throw new Error('O conteúdo ou destino mudou. Reabra e revise a comunicação.');
 if(approved&&(!current.data.process_id||!current.data.client_id))throw new Error('Processo ou cliente não vinculado. A comunicação não pode ser autorizada.');
 if(approved&&!String(current.data.message_text||'').trim())throw new Error('A mensagem está vazia. A comunicação não foi autorizada.');
 let movementChanged=false;
 if(current.data.movement_id){const movement=await db.from('process_movements').update({approved_for_client:approved}).eq('id',current.data.movement_id).eq('org_id',orgId).select('id');if(movement.error||!movement.data?.length)throw new Error(movement.error?.message||'A movimentação não foi confirmada. Nenhuma alteração foi aplicada à fila.');movementChanged=true;}
 try{const queue=await db.from('process_notification_queue').update(approved?{status:'pending',scheduled_at:new Date().toISOString(),last_error:null}:{status:'cancelled',last_error:'Não autorizado pelo escritório'}).eq('id',item.id).eq('org_id',orgId).eq('status','awaiting_review').select('id');if(queue.error||!queue.data?.length)throw new Error(queue.error?.message||'A fila mudou durante a decisão.');}
 catch(error){throw new Error((movementChanged?'A movimentação foi atualizada, mas a alteração na fila não foi confirmada. Confira o aplicativo e atualize antes de tentar novamente. ':'')+(error instanceof Error?error.message:'Falha ao atualizar a fila.'));}
}

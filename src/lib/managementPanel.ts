export type PanelEntry={amount:number|string|null;status:string;category:string;type:string};
export type PanelLead={id:string;stage_key:string|null;potential_value?:number|null};
export type PanelContract={id:string;client_id:string|null;total_amount:number|string|null;status:string};
export type PanelProcess={process_id:string;client_id:string|null;cnj_number:string|null;internal_number:string|null;subject:string|null;status:string|null;updated_at:string|null;latest_movement_at:string|null};
export const managementStages=[['novo_lead','Novo lead'],['contato_iniciado','Contato iniciado'],['qualificacao','Qualificação'],['consultoria','Consultoria'],['proposta','Proposta'],['negociacao','Negociação'],['contratado','Contratado'],['cliente','Cliente'],['perdido','Perdido']] as const;
const closed=new Set(['completed','concluido','concluída','concluida','encerrado','closed','archived','arquivado','cancelled','canceled','cancelado']);
export function leadDistribution(leads:PanelLead[]){
 const counts=new Map<string,number>();for(const lead of leads){const key=lead.stage_key||'sem_etapa';counts.set(key,(counts.get(key)||0)+1);}
 const known=managementStages.map(([key,label])=>({key,label,count:counts.get(key)||0}));
 const extra=[...counts].filter(([key])=>!managementStages.some(([k])=>k===key)).map(([key,count])=>({key,label:key==='sem_etapa'?'Sem etapa':key.replace(/_/g,' '),count}));
 return [...known,...extra];
}
export function contractRanking(contracts:PanelContract[],clients:Record<string,string>){
 const sums=new Map<string,{total:number;count:number}>();
 for(const contract of contracts){if(!contract.client_id)continue;const row=sums.get(contract.client_id)||{total:0,count:0};row.total+=Number(contract.total_amount)||0;row.count++;sums.set(contract.client_id,row);}
 return [...sums].map(([id,values])=>({id,...values,name:clients[id]||'Cliente sem nome carregado'})).sort((a,b)=>b.total-a.total).slice(0,5);
}
export function inactiveProcesses(processes:PanelProcess[],days=30,now=Date.now()){
 return processes.filter(item=>!closed.has(String(item.status||'').trim().toLowerCase())).map(item=>{
  const movement=item.latest_movement_at?Date.parse(item.latest_movement_at):NaN;
  const updated=item.updated_at?Date.parse(item.updated_at):NaN;
  const stamp=Number.isFinite(movement)?movement:Number.isFinite(updated)?updated:null;
  return {...item,last:stamp===null?null:new Date(stamp).toISOString(),basis:Number.isFinite(movement)?'movement':'updated',days:stamp===null?null:Math.max(0,Math.floor((now-stamp)/86400000))};
 }).filter(item=>item.days===null||item.days>=days).sort((a,b)=>a.last===null?(b.last===null?0:-1):b.last===null?1:Date.parse(a.last)-Date.parse(b.last));
}
export const panelSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();

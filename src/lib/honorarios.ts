export type FeePlan={total:number;entry:number;months:number;rate:number;entryRate:number;tax:number;cost:number;share:number;shareBase:'recebido'|'liquido'|'exito';successBase:number;successRate:number};
export function simulate(p:FeePlan){
 if(![p.total,p.entry,p.months,p.rate,p.entryRate,p.tax,p.cost,p.share,p.successBase,p.successRate].every(Number.isFinite)||p.total<=0||p.entry<0||p.entry>p.total||p.cost<0||p.successBase<0||!Number.isInteger(p.months)||p.months<1||p.months>24||[p.rate,p.entryRate,p.tax,p.share,p.successRate].some(x=>x<0||x>100))throw Error('Confira os valores, percentuais de 0 a 100 e parcelas inteiras de 1 a 24.');
 const total=Math.round(p.total*100),entry=Math.round(p.entry*100),balance=total-entry;
 const installment=Math.floor(balance/p.months),last=balance-installment*(p.months-1);
 const fees=Math.round(balance*p.rate/100)+Math.round(entry*p.entryRate/100),taxes=Math.round(total*p.tax/100),cost=Math.round(p.cost*100),success=Math.round(p.successBase*p.successRate);
 const shareBase=p.shareBase==='exito'?success:p.shareBase==='liquido'?Math.max(0,total-fees-taxes-cost):total;
 const transfer=Math.round(shareBase*p.share/100),fixedTransfer=p.shareBase==='exito'?0:transfer;
 return {installment:installment/100,last:last/100,balance:balance/100,fees:fees/100,taxes:taxes/100,transfer:transfer/100,success:success/100,net:(total-fees-taxes-cost-fixedTransfer)/100};
}
export const commercialStages=['Contato novo','Triagem concluída','Consulta oferecida','Pagamento pendente','Consulta realizada','Proposta enviada','Contrato assinado','Entrada recebida','Recorrência autorizada'];
export function allocateReceived(received:number,share:number,base:string){return base==='recebido'?Math.round(received*share)/100:0}
export function referenceAmount(value:string){const found=value.match(/R\$\s*([\d.]+,\d{2})/);return found?Number(found[1].replace(/\./g,'').replace(',','.')):null}
/** The top of an explicit range is a commercial reference, never an inferred OAB ceiling. */
export function upperRange(value:string,percentage:string){
 const amounts=[...value.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map(m=>Number(m[1].replace(/\./g,'').replace(',','.')));
 const rates=[...percentage.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(m=>Number(m[1].replace(',','.')));
 const explicitRange=rates.length>1&&/\s+a\s+/i.test(percentage)||/at[eé]\s+\d/i.test(percentage);
 return {amount:amounts.length>1&&/\s+a\s+|at[eé]/i.test(value)?Math.max(...amounts):null,percentage:explicitRange&&rates.length?Math.max(...rates):null};
}
export function preferredOfficeAmount(item:string,value:string){return item==='11.12'?7000:referenceAmount(value)}

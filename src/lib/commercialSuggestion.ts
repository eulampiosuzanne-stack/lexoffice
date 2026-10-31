export function suggestCommercialPlan(total:number,income:number){
 if(!Number.isFinite(total)||total<=0)throw new Error('É necessário revisar o valor dos honorários.');
 const cents=Math.round(total*100),cap=Number.isFinite(income)&&income>0?Math.floor(income*100*.15):null;
 const initial=Math.ceil(cents*.3/5000)*5000;
 const required=cap===null?0:Math.ceil(Math.max(0,cents-cap*10)/5000)*5000;
 const entry=Math.min(cents,Math.max(initial,required)),balance=cents-entry;
 const months=balance===0?0:cap===null?10:Math.max(1,Math.min(10,Math.ceil(balance/Math.max(1,cap))));
 const installment=months?Math.floor(balance/months):0,last=months?balance-installment*(months-1):0;
 return {total:cents/100,entry:entry/100,months,installment:installment/100,last:last/100,capacity:cap===null?null:cap/100,reason:cap===null?'Entrada próxima de 30% e saldo em até 10 meses; renda não informada, capacidade mensal pendente.':entry>initial?'Entrada ajustada para limitar o prazo a 10 meses e manter a parcela na referência de 15% da renda declarada.':'Entrada próxima de 30% e prazo de até 10 meses, com parcela na referência de 15% da renda declarada.'};
}

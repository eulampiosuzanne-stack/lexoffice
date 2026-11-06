export const ROI_CALCULATOR = 'ROI Judiciário e Acordos';
export const ROI_FIELDS = [
  {key:'claimValue',label:'Valor potencial a recuperar (R$)',type:'number' as const},
  {key:'successPercent',label:'Hipótese de êxito definida pela advogada (%)',type:'number' as const},
  {key:'recoveryPercent',label:'Percentual recuperável em caso de êxito (%)',type:'number' as const},
  {key:'durationYears',label:'Tempo estimado para recebimento (anos)',type:'number' as const},
  {key:'annualDiscountPercent',label:'Taxa anual de desconto informada (%)',type:'number' as const},
  {key:'costNow',label:'Custos do processo a pagar agora (R$)',type:'number' as const},
  {key:'costAtEnd',label:'Custos do processo a pagar no final (R$)',type:'number' as const},
  {key:'settlementValue',label:'Proposta de acordo (R$) — deixe em branco se não houver',type:'number' as const},
  {key:'settlementYears',label:'Tempo para receber o acordo (anos; 0 = imediato)',type:'number' as const},
  {key:'settlementCost',label:'Custos imediatos para celebrar o acordo (R$)',type:'number' as const},
];
type Values = Record<string, unknown>;
const cash = (value:number) => value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function required(data:Values,key:string,label:string,max=Number.MAX_SAFE_INTEGER) {
  const raw=data[key];
  if(raw===undefined||raw===null||raw===''||typeof raw==='boolean')throw new Error('Informe '+label+'.');
  const text=String(raw).trim().replace(/\s|R\$/g,'');
  if(!text)throw new Error('Informe '+label+'.');
  const parsed=typeof raw==='number'?raw:Number(text.includes(',')?text.replace(/\./g,'').replace(',','.'):text);
  if(!Number.isFinite(parsed)||parsed<0||parsed>max)throw new Error(label+': informe um número entre 0 e '+max+'.');
  return parsed;
}
export function calculateLitigationRoi(data:Values) {
  const claim=required(data,'claimValue','o valor potencial a recuperar');
  const probability=required(data,'successPercent','a hipótese de êxito',100)/100;
  const recovery=required(data,'recoveryPercent','o percentual recuperável',100)/100;
  const years=required(data,'durationYears','o tempo de recebimento',100);
  const rate=required(data,'annualDiscountPercent','a taxa anual de desconto',1000)/100;
  const now=required(data,'costNow','os custos imediatos');
  const later=required(data,'costAtEnd','os custos finais');
  const present=(amount:number,time:number) => amount/Math.pow(1+rate,time);
  const scenario=(p:number,t:number) => present(claim*p*recovery-later,t)-now;
  const litigation=scenario(probability,years);
  const hasOffer=data.settlementValue!==undefined&&data.settlementValue!==null&&String(data.settlementValue).trim()!=='';
  const offer=hasOffer?required(data,'settlementValue','a proposta de acordo'):null;
  const offerYears=hasOffer?required(data,'settlementYears','o prazo de recebimento do acordo',100):null;
  const offerCost=hasOffer?required(data,'settlementCost','os custos do acordo'):null;
  const settlement=offer===null?null:present(offer,offerYears!)-offerCost!;
  const difference=settlement===null?null:settlement-litigation;
  const comparison=difference===null?'Sem proposta para comparar':Math.abs(difference)<.005?'Valores esperados equivalentes':difference>0?'Acordo com maior valor presente líquido':'Processo com maior valor esperado líquido';
  const scenarios=[
    {label:'Hipótese de êxito reduzida em 10 pontos percentuais',probability:Math.max(0,probability-.1),years},
    {label:'Premissas informadas',probability,years},
    {label:'Recebimento do processo após mais 1 ano',probability,years:years+1},
    {label:'Hipótese de êxito aumentada em 10 pontos percentuais',probability:Math.min(1,probability+.1),years},
  ].map(s=>({...s,value:scenario(s.probability,s.years)}));
  const warning='Simulação condicionada às premissas informadas pela advogada. Não estima automaticamente a chance de êxito nem autoriza aceitar acordo. Não inclui riscos, tributos, recursos ou parcelas não informados.';
  const lines=[
    'SIMULAÇÃO DE ACORDO E PROCESSO',
    'Valor potencial a recuperar: '+cash(claim),
    'Hipótese de êxito informada: '+(probability*100).toFixed(2)+'%',
    'Percentual recuperável em caso de êxito: '+(recovery*100).toFixed(2)+'%',
    'Prazo estimado de recebimento: '+years+' ano(s)',
    'Taxa anual de desconto informada: '+(rate*100).toFixed(2)+'%',
    'Custos imediatos do processo: '+cash(now),
    'Custos finais do processo: '+cash(later),
    'Valor esperado líquido do processo hoje: '+cash(litigation),
    ...(settlement===null?[]:[
      'Proposta bruta de acordo: '+cash(offer!),
      'Prazo de recebimento do acordo: '+offerYears+' ano(s)',
      'Custos imediatos do acordo: '+cash(offerCost!),
      'Valor presente líquido do acordo: '+cash(settlement),
      'Diferença do acordo em relação ao processo: '+cash(difference!),
    ]),
    'Comparação matemática: '+comparison,
    ...scenarios.map(s=>s.label+': '+cash(s.value)),
    'Fórmula do processo: (valor × hipótese de êxito × percentual recuperável − custos finais) / (1 + taxa anual)^anos − custos imediatos',
    'Critérios: custos finais pagos independentemente do êxito; recebimento em parcela única; valores na mesma data-base. Sem correção adicional além da taxa explicitada.',
    'Conferência profissional: '+warning,
  ];
  return {ok:true,calculator:ROI_CALCULATOR,result:lines.join('\n'),lines,warnings:[warning],meta:{litigation,settlement,difference,comparison,scenarios,legalOpinion:warning,assumptions:{claim,probability,recovery,years,rate,costNow:now,costAtEnd:later,offer,offerYears,offerCost}},generated_at:new Date().toISOString()};
}

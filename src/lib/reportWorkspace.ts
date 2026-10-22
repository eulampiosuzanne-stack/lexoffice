export type ReportPeriod='mes'|'mes_passado'|'90d'|'ano';
export const reportPeriods:Record<ReportPeriod,string>={mes:'Este mês',mes_passado:'Mês passado','90d':'Últimos 90 dias',ano:'Este ano'};
export function reportDay(value:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);}
export function intervalo(period:ReportPeriod,now=new Date()):{de:Date;ate:Date}{
 const [year,month]=reportDay(now).split('-').map(Number);
 const midnight=(y:number,m:number)=>new Date(Date.UTC(y,m,1,3));
 if(period==='mes')return {de:midnight(year,month-1),ate:midnight(year,month)};
 if(period==='mes_passado')return {de:midnight(year,month-2),ate:midnight(year,month-1)};
 if(period==='ano')return {de:midnight(year,0),ate:midnight(year+1,0)};
 return {de:new Date(now.getTime()-90*86400000),ate:new Date(now.getTime()+1)};
}
export function reportDateBounds(period:ReportPeriod,now=new Date()){
 const range=intervalo(period,now);
 return {from:reportDay(range.de),until:period==='90d'?reportDay(new Date(now.getTime()+86400000)):reportDay(range.ate),today:reportDay(now)};
}
export type ReportResult={data:Record<string,any>[]|null;error:unknown;count?:number|null};
export const reportSources={leads:'leads e origens',pagamentos:'recebimentos',aReceber:'parcelas do período',vencidas:'parcelas em atraso',andamentos:'andamentos',audiencias:'audiências',prazos:'prazos',prazosOk:'prazos concluídos',processosNovos:'processos novos',msgIn:'mensagens recebidas',msgOut:'mensagens enviadas',alertas:'alertas',clientesProc:'contatos dos clientes'} as const;
export type ReportSource=keyof typeof reportSources;
export type ReportResults=Record<ReportSource,ReportResult>;
export function buildReport(results:ReportResults){
 const failed=new Set<ReportSource>();const limited=new Set<ReportSource>();
 function rows(key:ReportSource){const result=results[key];if(result.error||!Array.isArray(result.data)){failed.add(key);return null;}if((result.count!=null&&result.count>result.data.length)||result.data.length>=(key==='clientesProc'?3000:5000))limited.add(key);return result.data;}
 function count(key:ReportSource){const result=results[key];if(result.error||result.count==null||!Number.isFinite(result.count)){failed.add(key);return null;}return result.count;}
 function sum(key:ReportSource){const data=rows(key);if(data===null)return null;let total=0;for(const row of data){if(row.amount===null||row.amount===undefined||!Number.isFinite(Number(row.amount))){failed.add(key);return null;}total+=Number(row.amount);}return total;}
 const leads=rows('leads');
 const origins=leads?Object.entries(leads.reduce<Record<string,number>>((acc,row)=>{const key=String(row.origin||'').trim().toLocaleLowerCase('pt-BR')||'Não informada';acc[key]=(acc[key]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5):null;
 const due=rows('vencidas');
 const clientRows=rows('clientesProc');const withoutContact=new Set<string>();
 for(const row of clientRows||[]){const client=Array.isArray(row.clients)?row.clients[0]:row.clients;if(client?.id&&!String(client.whatsapp||'').trim()&&!String(client.phone||'').trim())withoutContact.add(client.id);}
 const data={
  leadsNovos:leads?.length??null,leadsContratados:leads?.filter(row=>['contratado','cliente'].includes(String(row.stage_key))).length??null,origens:origins,
  recebido:sum('pagamentos'),aReceberPeriodo:sum('aReceber'),vencidoAberto:sum('vencidas'),qtdVencidas:due?.length??null,
  andamentos:count('andamentos'),audiencias:count('audiencias'),prazos:count('prazos'),prazosConcluidos:count('prazosOk'),processosNovos:count('processosNovos'),
  msgRecebidas:count('msgIn'),msgEnviadas:count('msgOut'),alertas:count('alertas'),semWhatsApp:clientRows===null?null:withoutContact.size,
 };
 return {data,failed:[...failed].map(key=>reportSources[key]),limited:[...limited].map(key=>reportSources[key])};
}
export type ReportData=ReturnType<typeof buildReport>['data'];

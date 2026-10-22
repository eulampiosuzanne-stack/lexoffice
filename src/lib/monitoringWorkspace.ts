export type MonitoringSource='DataJud'|'DJEN';
export type Consultation={id:string;source:MonitoringSource;at:string;status:string;checked:number|null;inserted:number|null;failed:number|null;message:string};
export function consultationResult(source:MonitoringSource,data:any):Omit<Consultation,'id'|'at'>{
 if(data?.ok!==true)throw new Error(data?.error||'A fonte não confirmou a consulta.');
 const counter=(value:any)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
 const checked=counter(data.checked),inserted=counter(source==='DJEN'?data.new_movements:data.inserted),failed=counter(data.failed);
 if(checked===null||inserted===null||failed===null)throw new Error('Resposta incompleta: não foi possível confirmar os resultados da fonte.');
 const status=failed>0||Number(data.retry||0)>0||Number(data.unsupported||0)>0||Number(data.not_found||0)>0?'Com falhas':checked===0?'Nenhum item consultado':inserted===0?'Sem novidades':'Concluída';
 return {source,checked,inserted,failed,status,message:`${checked} item(ns) consultado(s), ${inserted} nova(s) movimentação(ões), ${failed} falha(s).${source==='DataJud'?' Lote de até 2 processos do escritório.':''}${data.not_found?` ${data.not_found} não localizado(s).`:''}${data.unsupported?` ${data.unsupported} não suportado(s).`:''}${data.retry?` ${data.retry} aguardando nova tentativa.`:''}`};
}
export function journalKey(org:string,user:string){return `lexoffice:monitoring:${encodeURIComponent(org)}:${encodeURIComponent(user)}`;}
export function readJournal(key:string):Consultation[]{const raw=localStorage.getItem(key);if(!raw)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows))throw new Error('Histórico local inválido.');return rows.filter(row=>row&&typeof row.id==='string'&&typeof row.at==='string'&&['DataJud','DJEN'].includes(row.source)).slice(0,60);}
export function appendJournal(key:string,entry:Consultation){localStorage.setItem(key,JSON.stringify([entry,...readJournal(key)].slice(0,60)));}

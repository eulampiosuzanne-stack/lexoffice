import type {ImportReview,ImportType} from './importWorkspace';
export type ImportOutcome={line:number;label:string;status:string;notes:string;id?:string};
/** Persist only the reviewed operations; every successful write requires a returned id. */
export async function executeImportRows(db:any,review:ImportReview[],context:{type:ImportType;orgId:string;userId:string;jobId:string},onProgress:(rows:ImportOutcome[])=>void){
 const outcomes:ImportOutcome[]=[];let logFailure=false;
 for(const row of review){
  const outcome:ImportOutcome={line:row.line,label:String(row.normalized.name||row.normalized.cnj_number||row.normalized.description||Object.values(row.raw)[0]||''),status:row.status,notes:row.notes.join(' '),id:row.recordId?.startsWith('file:')?undefined:row.recordId};
  try{
   if(row.recordId?.startsWith('file:')){const prior=outcomes[Number(row.recordId.slice(5))];if(!prior?.id||prior.status==='error')throw new Error('O registro anterior no arquivo não foi criado; corrija-o antes de repetir a importação.');outcome.id=prior.id;}
   if(row.status==='ready'){
    const payload={...row.normalized};delete payload.link_existing;
    const table=context.type==='clients'?'clients':context.type==='processes'?'processes':'financial_entries';
    if(context.type==='clients')payload.status='active';
    if(context.type==='processes')payload.source='import';
    if(context.type==='financial'){payload.created_by=context.userId;payload.paid_at=payload.status==='paid'?new Date().toISOString():null;}
    const created=await db.from(table).insert({org_id:context.orgId,...payload}).select('id').single();
    if(created.error||!created.data?.id)throw new Error(created.error?.message||'Gravação não confirmada.');
    outcome.status='imported';outcome.id=created.data.id;outcome.notes='Registro criado. '+row.notes.join(' ');
   }else if(row.status==='duplicate'&&row.normalized.link_existing){
    if(!outcome.id)throw new Error('O processo anterior não foi criado; vínculo não aplicado.');
    const linked=await db.from('processes').update({client_id:row.normalized.client_id,updated_at:new Date().toISOString()}).eq('id',outcome.id).eq('org_id',context.orgId).is('client_id',null).select('id');
    if(linked.error||!linked.data?.length)throw new Error(linked.error?.message||'O vínculo mudou; revise o processo.');
    outcome.status='linked';outcome.notes='Vínculo com o cliente preenchido.';
   }
  }catch(error){outcome.status='error';outcome.notes=error instanceof Error?error.message:'Falha ao gravar registro.';delete outcome.id;}
  outcomes.push(outcome);onProgress([...outcomes]);
  try{const audit=await db.from('import_rows').insert({org_id:context.orgId,import_job_id:context.jobId,row_number:row.line,raw_data:row.raw,normalized_data:row.normalized,status:outcome.status==='linked'?'duplicate':outcome.status,validation_errors:outcome.status==='error'?[outcome.notes]:[],imported_record_id:outcome.id||null});if(audit.error)logFailure=true;}catch{logFailure=true;}
 }
 return {outcomes,logFailure};
}

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { rodarPipelineCompleto } from './PipelineInvestigacao.js';

const url=process.env.SUPABASE_URL||'';
const service=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
if(!url||!service)throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
const supabase=createClient(url,service,{auth:{persistSession:false}});

async function tick(){
  const {data,error}=await supabase.from('investigations').select('id,subject_document,status').eq('status','pending').order('created_at',{ascending:true}).limit(5);
  if(error){console.error('[investigation-worker]',error.message);return}
  for(const job of data||[]){
    try{await rodarPipelineCompleto(job.subject_document,job.id);console.log(`[investigation-worker] ${job.id} concluído`)}
    catch(e){const message=e instanceof Error?e.message:String(e);console.error(`[investigation-worker] ${job.id}: ${message}`);await supabase.from('investigations').update({status:'error',pipeline_errors:{pipeline:message},completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id)}
  }
}

console.log('[investigation-worker] iniciado');
await tick();
setInterval(()=>void tick(),5000);

import { createClient } from '@supabase/supabase-js';
import { CadastroService } from './services/CadastroService.js';
import { TelefoneService } from './services/TelefoneService.js';
import { SociosService } from './services/SociosService.js';
import { ProfissionalService } from './services/ProfissionalService.js';
import { RestricoesService } from './services/RestricoesService.js';
import { ProcessosService } from './services/ProcessosService.js';

const url=process.env.SUPABASE_URL||'';
const service=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
if(!url||!service)throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
const supabase=createClient(url,service,{auth:{persistSession:false}});

export async function rodarPipelineCompleto(documento:string,uuidInvestigacao:string){
  const doc=documento.replace(/\D/g,'');
  if(![11,14].includes(doc.length))throw new Error('Informe CPF ou CNPJ válido.');
  await supabase.from('investigations').update({status:'running',started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',uuidInvestigacao);

  const results=await Promise.allSettled([
    CadastroService.consultar(doc),TelefoneService.consultar(doc),SociosService.consultar(doc),ProfissionalService.consultar(doc),RestricoesService.consultar(doc),ProcessosService.consultar(doc)
  ]);
  const value=(i:number,fallback:any)=>results[i].status==='fulfilled'?(results[i] as PromiseFulfilledResult<any>).value:fallback;
  const errors:any={};
  ['cadastro','contatos','socios','profissional','restricoes','processos'].forEach((k,i)=>{const r=results[i];if(r.status==='rejected')errors[k]=r.reason instanceof Error?r.reason.message:String(r.reason)});
  const hasErrors=Object.keys(errors).length>0;
  const {error}=await supabase.from('investigations').update({
    card_registration_data:value(0,{}),card_contact_data:value(1,{}),card_relationships:value(2,{socios:[],grupo_economico:[]}),card_professional_data:value(3,{}),card_credit_restrictions:value(4,{}),card_processes:value(5,[]),pipeline_errors:errors,status:hasErrors?'partial':'completed',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq('id',uuidInvestigacao);
  if(error)throw error;
  return {mode:'live',status:hasErrors?'partial':'completed',errors};
}

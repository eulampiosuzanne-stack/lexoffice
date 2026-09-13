import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const digits=(v:any)=>String(v||'').replace(/\D/g,'');
const env=(k:string)=>String(Deno.env.get(k)||'').trim();

async function jsonFetch(url:string,init:RequestInit={}){const r=await fetch(url,init);const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||d?.error||`Fonte respondeu ${r.status}`);return d}

async function cadastro(doc:string){
 if(doc.length===14){const d=await jsonFetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`,{headers:{Accept:'application/json'}});return{documento:doc,nome:d?.razao_social||null,nome_fantasia:d?.nome_fantasia||null,situacao:d?.descricao_situacao_cadastral||null,data_abertura:d?.data_inicio_atividade||null,endereco:{logradouro:[d?.descricao_tipo_de_logradouro,d?.logradouro].filter(Boolean).join(' '),numero:d?.numero||null,bairro:d?.bairro||null,cep:d?.cep||null,municipio:d?.municipio||null,uf:d?.uf||null},telefones:[d?.ddd_telefone_1,d?.ddd_telefone_2].filter(Boolean),email:d?.email||null,fonte:'BrasilAPI / Receita Federal'}}
 const base=env('ASSERTIVA_CPF_URL'),token=env('ASSERTIVA_TOKEN');if(!base||!token)throw new Error('Provedor de CPF ainda não configurado no motor.');const d=await jsonFetch(base.replace('{documento}',encodeURIComponent(doc)),{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});return{documento:doc,nome:d?.nome||d?.name||null,situacao:d?.situacaoCpf||d?.situacao||null,data_nascimento:d?.dataNascimento||d?.birthDate||null,endereco:d?.enderecoPrincipal||d?.address||null,fonte:'bureau_contratado'}
}

async function contatos(doc:string){
 if(doc.length===14){const d=await jsonFetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`,{headers:{Accept:'application/json'}});return{telefones:[d?.ddd_telefone_1,d?.ddd_telefone_2].filter(Boolean),emails:[d?.email].filter(Boolean),fonte:'BrasilAPI / Receita Federal'}}
 const base=env('BIGDATACORP_CONTACT_URL'),token=env('BIGDATACORP_TOKEN');if(!base||!token)throw new Error('Provedor de contatos ainda não configurado no motor.');const d=await jsonFetch(base.replace('{documento}',encodeURIComponent(doc)),{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});return{telefones:(d?.Telefones||d?.telefones||[]).map((t:any)=>({numero:t?.numero||[t?.DDD,t?.Numero].filter(Boolean).join(' '),tipo:t?.Tipo||t?.tipo||'CELULAR',whatsapp:Boolean(t?.HasWhatsApp??t?.whatsapp)})),emails:(d?.Emails||d?.emails||[]).map((e:any)=>e?.Email||e?.email||e).filter(Boolean),fonte:'bureau_contratado'}
}

async function profissional(doc:string){const base=env('BIGDATACORP_PROFESSIONAL_URL'),token=env('BIGDATACORP_TOKEN');if(!base||!token)throw new Error('Provedor profissional ainda não configurado no motor.');const d=await jsonFetch(base.replace('{documento}',encodeURIComponent(doc)),{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});return{dados:d,fonte:'bureau_contratado'}}
async function restricoes(doc:string){const base=env('CREDIT_BUREAU_URL')||env('SERASA_API_URL'),token=env('SERASA_API_KEY');if(!base||!token)throw new Error('Provedor de crédito ainda não configurado no motor.');const d=await jsonFetch(base.replace('{documento}',encodeURIComponent(doc)),{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});return{score_credito:d?.Score??d?.score??null,total_protestos:d?.ResumoProtestos?.Quantidade??d?.protestos??0,total_negativacoes:d?.ResumoNegativacoes?.Quantidade??d?.negativacoes??0,fonte:'bureau_contratado'}}
async function socios(doc:string){if(doc.length!==14)return{socios:[],grupo_economico:[],fonte:'não_aplicável_para_cpf'};const d=await jsonFetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`,{headers:{Accept:'application/json'}});return{socios:(d?.qsa||[]).map((s:any)=>({nome:s?.nome_socio||null,documento:s?.cnpj_cpf_do_socio||null,vinculo:s?.qualificacao_socio||null,tipo:s?.identificador_de_socio===1?'Pessoa jurídica':s?.identificador_de_socio===2?'Pessoa física':s?.identificador_de_socio===3?'Estrangeiro':null,data_entrada:s?.data_entrada_sociedade||null})),grupo_economico:[],fonte:'BrasilAPI / Receita Federal'}}
async function processos(doc:string){const key=env('DATAJUD_API_KEY'),endpoint=env('DATAJUD_SEARCH_URL');if(!key||!endpoint)throw new Error('DataJud por documento ainda não configurado no motor.');const d=await jsonFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`APIKey ${key}`},body:JSON.stringify({query:{match:{id_documento_pesquisa:doc}},size:20})});return{matches:(d?.hits?.hits||[]).map((h:any)=>({numero:h?._source?.numeroProcesso||null,tribunal:h?._source?.tribunal||null,classe:h?._source?.classe?.nome||'Indefinida',fonte:'DataJud'})),fonte:'DataJud'}}

Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return J({error:'method_not_allowed'},405);try{
 const service=env('SUPABASE_SERVICE_ROLE_KEY'),auth=req.headers.get('authorization')||'';if(!service||auth!==`Bearer ${service}`)return J({error:'Não autorizado'},401);
 const body=await req.json().catch(()=>({})),slug=String(body.slug||''),query=String(body.query||''),doc=digits(query);if(![11,14].includes(doc.length))return J({status:'not_applicable',source:'Motor de investigação',result:{message:'O motor completo exige CPF ou CNPJ para esta consulta.'}});
 let result:any,source='Motor de investigação LEXOFFICE';
 if(slug==='person-location'){const [cad,ct]=await Promise.allSettled([cadastro(doc),contatos(doc)]);result={cadastro:cad.status==='fulfilled'?cad.value:null,contatos:ct.status==='fulfilled'?ct.value:null,avisos:[cad.status==='rejected'?String(cad.reason?.message||cad.reason):null,ct.status==='rejected'?String(ct.reason?.message||ct.reason):null].filter(Boolean)};if(!result.cadastro&&!result.contatos)throw new Error(result.avisos.join(' | ')||'Nenhuma fonte disponível no motor.');}
 else if(slug==='professional-data')result=await profissional(doc);
 else if(slug==='credit-restrictions')result=await restricoes(doc);
 else if(slug==='relationships')result=await socios(doc);
 else if(slug==='processes')result=await processos(doc);
 else if(slug==='company-data'||slug==='registration-status'||slug==='economic-group'||slug==='shareholdings'){result=slug==='economic-group'||slug==='shareholdings'?await socios(doc):await cadastro(doc)}
 else return J({status:'provider_required',source,result:{message:'Este cartão ainda não possui adaptador compatível no motor.'}});
 return J({ok:true,status:'completed',source,result,checked_at:new Date().toISOString()});
 }catch(e){const message=e instanceof Error?e.message:String(e);return J({ok:true,status:'provider_required',source:'Motor de investigação LEXOFFICE',result:{message}},200)}});

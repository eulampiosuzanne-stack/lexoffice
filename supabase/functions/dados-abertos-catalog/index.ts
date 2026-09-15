import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const safe=(v:any)=>String(v||'').replace(/[<>]/g,' ').trim().slice(0,180);
const BASE='https://dados.gov.br';

async function searchPortal(query:string){
  const q=safe(query); if(!q) return {status:'not_applicable',source:'Portal Brasileiro de Dados Abertos',result:{message:'Informe um tema, órgão, base ou palavra-chave.'}};
  // O portal atual é um catálogo federado. Esta integração usa a busca pública/indexada e não inventa rotas REST não confirmadas.
  const candidates=[
    `${BASE}/dados/conjuntos-dados?search=${encodeURIComponent(q)}`,
    `${BASE}/dados/conjuntos-dados?q=${encodeURIComponent(q)}`
  ];
  const checked:any[]=[];
  for(const url of candidates){
    try{const r=await fetch(url,{headers:{accept:'text/html,application/json'}});checked.push({url,status:r.status,content_type:r.headers.get('content-type')});if(r.ok&&String(r.headers.get('content-type')||'').includes('application/json')){const data=await r.json();return{status:'completed',source:'Portal Brasileiro de Dados Abertos / dados.gov.br',result:{query:q,data,endpoint:url,official:true}}}}catch{}
  }
  return{status:'completed',source:'Portal Brasileiro de Dados Abertos / catálogo oficial',result:{query:q,portal_search:`${BASE}/dados/conjuntos-dados`,swagger:`${BASE}/swagger-ui/index.html`,checked,mode:'catalog_navigation',message:'O catálogo oficial está integrado para descoberta de fontes. A rota REST de produção será habilitada quando o contrato OpenAPI efetivo estiver disponível de forma estável.',aviso:'O Portal cataloga metadados e links para recursos publicados pelos órgãos responsáveis; não deve ser usado como fonte de dados pessoais restritos.'}};
}

Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return J({error:'method_not_allowed'},405);try{
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,auth=req.headers.get('Authorization')||'';
 const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await uc.auth.getUser();if(!user)return J({error:'Sessão inválida.'},401);
 const db=createClient(url,service,{auth:{persistSession:false}}),pr=await db.from('profiles').select('org_id').eq('id',user.id).maybeSingle();if(!pr.data?.org_id)return J({error:'Organização não encontrada.'},403);
 const body=await req.json().catch(()=>({})),query=safe(body.query),out=await searchPortal(query);
 await db.from('investigation_searches').insert({org_id:pr.data.org_id,user_id:user.id,search_type:'Portal Brasileiro de Dados Abertos',search_slug:'dados-abertos-catalog',query_text:query,status:out.status,source:out.source,result:out.result});
 return J({ok:true,...out,checked_at:new Date().toISOString()});
}catch(e){console.error(e);return J({error:e instanceof Error?e.message:String(e)},500)}});

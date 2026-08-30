import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json; charset=utf-8"}});
const digits=(v:string)=>v.replace(/\D/g,'');
const safeTerm=(v:string)=>v.replace(/[%(),]/g,' ').replace(/[^0-9A-Za-zÀ-ÿ@._+\- /]/g,'').trim();

type SearchDef={slug:string;title:string;provider_mode:string;input_kind:string};
type InputType='cpf'|'cnpj'|'phone'|'plate'|'cnj'|'name'|'unknown';

function detectInput(query:string):InputType{
  const raw=query.trim();
  const only=digits(raw);
  if(/^\d{20}$/.test(only)) return 'cnj';
  if(/^\d{14}$/.test(only)) return 'cnpj';
  if(/^\d{11}$/.test(only)) return 'cpf';
  if(/^\d{10,13}$/.test(only)) return 'phone';
  if(/^[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}$/.test(raw.replace(/[^A-Za-z0-9]/g,''))) return 'plate';
  if(/[A-Za-zÀ-ÿ]{2,}/.test(raw)) return 'name';
  return 'unknown';
}

function accepts(kind:string,input:InputType){
  const map:Record<string,InputType[]>={
    phone:['phone'],cpf:['cpf'],cnpj:['cnpj'],cpf_cnpj:['cpf','cnpj'],plate:['plate'],
    name_or_cpf:['name','cpf'],name_or_document:['name','cpf','cnpj'],document_or_name:['name','cpf','cnpj']
  };
  return (map[kind]||['unknown','name','cpf','cnpj','phone','plate','cnj']).includes(input);
}

async function cnpjSearch(query:string,title:string){
  const cnpj=digits(query);
  if(cnpj.length!==14) throw Object.assign(new Error('Para esta consulta informe um CNPJ com 14 dígitos.'),{status:400});
  const r=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  const d=await r.json().catch(()=>null);
  if(!r.ok) throw Object.assign(new Error(d?.message||'CNPJ não encontrado na fonte pública.'),{status:r.status===404?404:502});
  const base={cnpj:d.cnpj,razao_social:d.razao_social,nome_fantasia:d.nome_fantasia,descricao_situacao_cadastral:d.descricao_situacao_cadastral,data_situacao_cadastral:d.data_situacao_cadastral,cnae_fiscal_descricao:d.cnae_fiscal_descricao,logradouro:d.logradouro,numero:d.numero,bairro:d.bairro,municipio:d.municipio,uf:d.uf,cep:d.cep,ddd_telefone_1:d.ddd_telefone_1,ddd_telefone_2:d.ddd_telefone_2,email:d.email,capital_social:d.capital_social,qsa:d.qsa||[],cnaes_secundarios:d.cnaes_secundarios||[]};
  if(title==='Grupo econômico') return {status:'completed',source:'BrasilAPI / dados públicos da Receita Federal',result:{company:base,relationships:d.qsa||[],warning:'Quadro societário e vínculos cadastrais não comprovam, isoladamente, a existência jurídica de grupo econômico.'}};
  if(title==='Participações societárias') return {status:'completed',source:'BrasilAPI / dados públicos da Receita Federal',result:{company:{cnpj:base.cnpj,razao_social:base.razao_social,nome_fantasia:base.nome_fantasia},qsa:d.qsa||[]}};
  if(title==='Situação cadastral') return {status:'completed',source:'BrasilAPI / dados públicos da Receita Federal',result:{cnpj:base.cnpj,razao_social:base.razao_social,nome_fantasia:base.nome_fantasia,situacao:base.descricao_situacao_cadastral,data_situacao:base.data_situacao_cadastral,endereco:{logradouro:base.logradouro,numero:base.numero,bairro:base.bairro,municipio:base.municipio,uf:base.uf,cep:base.cep}}};
  return {status:'completed',source:'BrasilAPI / dados públicos da Receita Federal',result:base};
}

async function processSearch(admin:any,orgId:string,query:string){
  const raw=query.trim(), only=digits(raw), term=safeTerm(raw), input=detectInput(raw);
  const matches:any[]=[]; const seen=new Set<string>();
  const add=(rows:any[]|null)=>{for(const x of rows||[]){if(!seen.has(x.id)){seen.add(x.id);matches.push(x)}}};

  if(input==='cpf'||input==='cnpj'||input==='name'){
    let cq=admin.from('clients').select('id').eq('org_id',orgId).limit(50);
    if(input==='cpf'||input==='cnpj') cq=cq.ilike('cpf_cnpj',`%${only}%`); else cq=cq.ilike('name',`%${term}%`);
    const {data:clients,error:ce}=await cq; if(ce) throw ce;
    const ids=(clients||[]).map((x:any)=>x.id);
    if(ids.length){
      const {data,error}=await admin.from('processes').select('id,cnj_number,internal_number,subject,class_name,status,court,vara,comarca,opposing_party,source,last_synced_at,clients(name,cpf_cnpj)').eq('org_id',orgId).in('client_id',ids).limit(50);
      if(error) throw error; add(data);
    }
  }

  if(term){
    const processTerm=input==='cnj'?only:term;
    const {data,error}=await admin.from('processes').select('id,cnj_number,internal_number,subject,class_name,status,court,vara,comarca,opposing_party,source,last_synced_at,clients(name,cpf_cnpj)').eq('org_id',orgId).or(`cnj_number.ilike.%${processTerm}%,internal_number.ilike.%${processTerm}%,subject.ilike.%${term}%,opposing_party.ilike.%${term}%`).limit(50);
    if(error) throw error; add(data);
  }
  return {status:'completed',source:'Base processual LEXOFFICE / sincronizações judiciais',result:{matches,count:matches.length,input_type:input}};
}

async function internalSearch(admin:any,orgId:string,def:SearchDef,query:string){
  if(def.slug==='processes') return await processSearch(admin,orgId,query);
  const raw=query.trim(); const only=digits(raw); const term=safeTerm(raw);
  let q=admin.from('clients').select('id,name,cpf_cnpj,rg,birth_date,profession,address,phone,whatsapp,email,status').eq('org_id',orgId).limit(50);
  if(only.length>=6) q=q.ilike('cpf_cnpj',`%${only}%`); else q=q.ilike('name',`%${term}%`);
  const {data,error}=await q; if(error) throw error;
  const rows=data||[];
  if(def.slug==='professional-data') return {status:'completed',source:'Cadastro interno autorizado do LEXOFFICE',result:{matches:rows.map((x:any)=>({id:x.id,name:x.name,cpf_cnpj:x.cpf_cnpj,profession:x.profession,status:x.status})),count:rows.length}};
  if(def.slug==='person-location') return {status:'completed',source:'Cadastro interno autorizado do LEXOFFICE',result:{matches:rows.map((x:any)=>({id:x.id,name:x.name,cpf_cnpj:x.cpf_cnpj,address:x.address,phone:x.phone,whatsapp:x.whatsapp,email:x.email})),count:rows.length}};
  return {status:'completed',source:'Cadastro interno autorizado do LEXOFFICE',result:{matches:rows,count:rows.length}};
}

async function runOne(admin:any,orgId:string,def:SearchDef,query:string){
  const input=detectInput(query);
  if(!accepts(def.input_kind,input)) return {status:'not_applicable',source:'Formato incompatível com esta categoria',result:{message:`Esta consulta exige ${def.input_kind}; o dado informado foi identificado como ${input}.`,input_type:input}};
  if(def.provider_mode==='public_cnpj') return await cnpjSearch(query,def.title);
  if(def.provider_mode==='internal') return await internalSearch(admin,orgId,def,query);
  return {status:'provider_required',source:'Provedor oficial/autorizado necessário',result:{message:`A consulta “${def.title}” depende de fonte oficial ou provedor autorizado que ainda não está conectado ao LEXOFFICE.`,recommended_action:'Conectar uma integração autorizada para esta categoria. Nenhum dado foi fabricado ou estimado.',input_type:input}};
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return json({error:'method_not_allowed'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth=req.headers.get('Authorization')||'';
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user) return json({error:'Sessão inválida.'},401);
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const {data:p,error:profileError}=await admin.from('profiles').select('org_id').eq('id',user.id).maybeSingle();
    if(profileError) throw profileError;
    if(!p?.org_id) return json({error:'Organização não encontrada.'},403);
    const orgId=p.org_id;
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||'single');
    const {data:catalog,error:catError}=await admin.from('investigation_catalog').select('slug,title,description,category,input_kind,provider_mode,novelty,sort_order').eq('enabled',true).order('sort_order');
    if(catError) throw catError;
    if(action==='catalog') return json({ok:true,catalog:catalog||[]});
    const query=String(body.query||'').trim();
    if(!query) return json({error:'Informe o dado que deseja consultar.'},400);
    const inputType=detectInput(query);
    const defs=(catalog||[]) as SearchDef[];

    if(action==='batch'){
      const requested=Array.isArray(body.slugs)&&body.slugs.length?body.slugs.map(String):defs.map(x=>x.slug);
      const selected=defs.filter(x=>requested.includes(x.slug));
      if(!selected.length) return json({error:'Nenhuma categoria válida selecionada.'},400);
      const {data:batch,error:batchError}=await admin.from('investigation_batches').insert({org_id:orgId,user_id:user.id,query_text:query,status:'processing',total_items:selected.length}).select('id').single();
      if(batchError) throw batchError;
      const outputs:any[]=[]; let completed=0,failed=0,providerRequired=0,skipped=0;
      for(const def of selected){
        try{
          const out=await runOne(admin,orgId,def,query);
          await admin.from('investigation_searches').insert({org_id:orgId,user_id:user.id,search_type:def.title,search_slug:def.slug,query_text:query,status:out.status,source:out.source,result:out.result,batch_id:batch.id});
          await admin.from('investigation_batch_items').insert({batch_id:batch.id,org_id:orgId,search_type:def.title,search_slug:def.slug,status:out.status,source:out.source,result:out.result});
          outputs.push({slug:def.slug,title:def.title,...out});
          if(out.status==='completed') completed++; else if(out.status==='provider_required') providerRequired++; else if(out.status==='not_applicable') skipped++;
        }catch(e:any){
          const message=e instanceof Error?e.message:String(e);
          await admin.from('investigation_batch_items').insert({batch_id:batch.id,org_id:orgId,search_type:def.title,search_slug:def.slug,status:'failed',source:'Erro',result:{},error_message:message});
          outputs.push({slug:def.slug,title:def.title,status:'failed',source:'Erro',error:message}); failed++;
        }
      }
      const status=failed>0?(completed+providerRequired+skipped>0?'partial':'failed'):'completed';
      await admin.from('investigation_batches').update({status,completed_items:completed+providerRequired+skipped,completed_at:new Date().toISOString()}).eq('id',batch.id);
      return json({ok:true,batch_id:batch.id,status,input_type:inputType,summary:{completed,provider_required:providerRequired,not_applicable:skipped,failed},results:outputs,checked_at:new Date().toISOString()});
    }

    const slug=String(body.slug||'').trim(); const def=defs.find(x=>x.slug===slug);
    if(!def) return json({error:'Categoria de investigação inválida.'},400);
    try{
      const out=await runOne(admin,orgId,def,query);
      const {data:saved,error:saveError}=await admin.from('investigation_searches').insert({org_id:orgId,user_id:user.id,search_type:def.title,search_slug:def.slug,query_text:query,status:out.status,source:out.source,result:out.result}).select('id').single();
      if(saveError) throw saveError;
      return json({ok:true,search_id:saved.id,slug:def.slug,title:def.title,input_type:inputType,...out,checked_at:new Date().toISOString()});
    }catch(e:any){const status=Number(e?.status)||500;return json({error:e instanceof Error?e.message:String(e)},status)}
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:String(e)},500)}
});
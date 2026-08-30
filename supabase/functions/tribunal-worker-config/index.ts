import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:any)=>String(v??'').trim();

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Método não permitido.'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth=req.headers.get('Authorization')||'';
    const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:userError}=await uc.auth.getUser();
    if(userError||!user)return json({error:'Sessão inválida. Faça login novamente.'},401);
    const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:profile}=await db.from('profiles').select('org_id').eq('id',user.id).maybeSingle();
    if(!profile?.org_id)return json({error:'Organização não encontrada.'},403);
    const orgId=profile.org_id;
    const body=await req.json().catch(()=>({}));
    const action=clean(body.action||'status');

    if(action==='status'){
      const [{data:jobs,error:je},{data:interventions,error:ie}]=await Promise.all([
        db.from('tribunal_sync_jobs').select('id,connection_id,job_type,status,attempts,max_attempts,run_at,started_at,completed_at,error_message,result,created_at,updated_at').eq('org_id',orgId).order('created_at',{ascending:false}).limit(100),
        db.from('tribunal_worker_interventions').select('id,connection_id,tribunal_code,judicial_system,job_id,kind,status,title,message,action_url,screenshot_path,metadata,created_at,acknowledged_at,resolved_at,updated_at').eq('org_id',orgId).order('created_at',{ascending:false}).limit(100)
      ]);
      if(je)throw je;if(ie)throw ie;
      return json({ok:true,jobs:jobs||[],interventions:interventions||[]});
    }

    if(action==='save_credentials'){
      const tribunalCode=clean(body.tribunal_code).toUpperCase();
      const judicialSystem=clean(body.judicial_system);
      const username=clean(body.username||body.login);
      const password=String(body.password||'');
      const oabNumber=clean(body.oab_number);
      const oabUf=clean(body.oab_uf).toUpperCase();
      if(!tribunalCode||!judicialSystem||!username||!password)return json({error:'Informe tribunal, sistema, login e senha.'},400);
      let {data:conn}=await db.from('tribunal_connections').select('*').eq('org_id',orgId).eq('tribunal_code',tribunalCode).eq('judicial_system',judicialSystem).order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(!conn){
        const tribunalName=clean(body.tribunal_name)||tribunalCode;
        const ins=await db.from('tribunal_connections').insert({org_id:orgId,user_id:user.id,tribunal_code:tribunalCode,tribunal_name:tribunalName,judicial_system:judicialSystem,oab_number:oabNumber||null,oab_uf:oabUf||null,status:'requires_auth',requires_2fa:Boolean(body.requires_2fa),updated_at:new Date().toISOString()}).select('*').single();
        if(ins.error)throw ins.error;conn=ins.data;
      }else{
        const up=await db.from('tribunal_connections').update({user_id:user.id,oab_number:oabNumber||conn.oab_number||null,oab_uf:oabUf||conn.oab_uf||null,requires_2fa:Boolean(body.requires_2fa??conn.requires_2fa),status:'requires_auth',error_message:null,updated_at:new Date().toISOString()}).eq('id',conn.id).select('*').single();
        if(up.error)throw up.error;conn=up.data;
      }
      const secret=JSON.stringify({username,password,tribunal_code:tribunalCode,judicial_system:judicialSystem});
      const {error:se}=await db.rpc('store_tribunal_connection_secret',{p_org_id:orgId,p_connection_id:conn.id,p_secret_value:secret});
      if(se)throw se;
      const requires2fa=Boolean(body.requires_2fa ?? conn.requires_2fa);
      await db.from('tribunal_connections').update({status:Boolean(body.two_factor_code)?'connected':(requires2fa?'requires_2fa':'connected'),last_authenticated_at:Boolean(body.two_factor_code)||!requires2fa?new Date().toISOString():conn.last_authenticated_at,error_message:null,updated_at:new Date().toISOString()}).eq('id',conn.id);
      return json({ok:true,connection_id:conn.id,credentials_saved:true,two_factor_stored:false,message:'Credenciais guardadas com segurança. O código 2FA não foi armazenado.'});
    }

    if(action==='enqueue'){
      const connectionId=clean(body.connection_id);
      if(!connectionId)return json({error:'Conexão do tribunal não informada.'},400);
      const {data:conn,error:ce}=await db.from('tribunal_connections').select('*').eq('id',connectionId).eq('org_id',orgId).maybeSingle();
      if(ce)throw ce;if(!conn)return json({error:'Conexão do tribunal não encontrada.'},404);
      const {data:existing}=await db.from('tribunal_sync_jobs').select('id,status').eq('org_id',orgId).eq('connection_id',connectionId).in('status',['queued','processing']).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(existing)return json({ok:true,job_id:existing.id,status:existing.status,message:'Já existe uma atualização deste tribunal na fila.'});
      const {data:job,error}=await db.from('tribunal_sync_jobs').insert({org_id:orgId,connection_id:connectionId,job_type:clean(body.job_type)||'sync',status:'queued',search_payload:{requested_by:user.id,tribunal_code:conn.tribunal_code,judicial_system:conn.judicial_system},attempts:0,max_attempts:3,run_at:new Date().toISOString()}).select('*').single();
      if(error)throw error;
      return json({ok:true,job_id:job.id,status:job.status,message:'Atualização processual colocada na fila.'});
    }

    return json({error:'Ação inválida.'},400);
  }catch(e){console.error('tribunal-worker-config',e);return json({error:e instanceof Error?e.message:'Erro inesperado.'},500)}
});

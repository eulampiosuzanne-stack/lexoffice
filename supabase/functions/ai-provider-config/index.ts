import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth=req.headers.get('Authorization')||'';
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user)return json({error:'Sessão inválida'},401);
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const {data:p}=await admin.from('profiles').select('org_id').eq('id',user.id).maybeSingle();
    if(!p?.org_id)return json({error:'Organização não encontrada'},403);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||'status');
    if(action==='save'){
      const value=String(body.gemini_api_key||'').trim();
      if(!value)return json({error:'Informe a credencial do Google Gemini.'},400);
      const {error}=await admin.rpc('store_integration_secret',{p_org_id:p.org_id,p_provider:'gemini_api',p_secret_value:value,p_account_email:null});
      if(error)throw error;
      return json({ok:true,message:'Credencial Gemini salva com segurança no cofre.'});
    }
    if(action==='status'){
      const {data}=await admin.rpc('read_integration_secret',{p_org_id:p.org_id,p_provider:'gemini_api'});
      const configured=Boolean(data||Deno.env.get('GEMINI_API_KEY')||Deno.env.get('GOOGLE_GEMINI_API_KEY'));
      return json({ok:true,mode:'gemini_only',gemini_configured:configured});
    }
    return json({error:'Ação inválida'},400);
  }catch(e){
    console.error(e);
    return json({error:e instanceof Error?e.message:String(e)},500);
  }
});

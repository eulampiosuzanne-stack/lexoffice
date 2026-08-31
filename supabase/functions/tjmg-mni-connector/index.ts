import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

function required(name:string){const v=(Deno.env.get(name)||"").trim();if(!v)throw new Error(`${name} não configurado`);return v;}
function admin(){return createClient(required("SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}})}
async function authenticatedUser(req:Request){
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) throw new Error("Não autenticado");
  const db=admin();
  const {data,error}=await db.auth.getUser(auth.slice(7));
  if(error||!data.user)throw new Error("Não autenticado");
  const {data:profile,error:pe}=await db.from("profiles").select("org_id").eq("id",data.user.id).maybeSingle();
  if(pe||!profile?.org_id)throw new Error("Organização não identificada");
  return {db,user:data.user,orgId:String(profile.org_id)};
}

function config(){
  return {
    environment:(Deno.env.get("TJMG_MNI_ENV")||"homologation").trim(),
    wsdl:(Deno.env.get("TJMG_MNI_WSDL_URL")||"").trim(),
    endpoint:(Deno.env.get("TJMG_MNI_ENDPOINT")||"").trim(),
    authMode:(Deno.env.get("TJMG_MNI_AUTH_MODE")||"").trim(),
  };
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return respond({ok:false,error:"Método inválido"},405);
  try{
    const {orgId}=await authenticatedUser(req);
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"status");
    const cfg=config();
    if(action==="status"){
      const ready=Boolean(cfg.wsdl&&cfg.endpoint&&cfg.authMode);
      return respond({ok:true,provider:"tjmg_mni",org_id:orgId,state:ready?"homologation_configured":"awaiting_homologation_credentials",environment:cfg.environment,configured:{wsdl:Boolean(cfg.wsdl),endpoint:Boolean(cfg.endpoint),auth_mode:Boolean(cfg.authMode)},production_active:false});
    }
    if(action==="test"||action==="consultarProcesso"){
      if(!cfg.wsdl||!cfg.endpoint||!cfg.authMode)return respond({ok:false,state:"awaiting_homologation_credentials",error:"O TJMG ainda não forneceu/configurou os parâmetros oficiais de homologação. Nenhuma chamada externa foi executada."},409);
      return respond({ok:false,state:"contract_pending",error:"Transporte MNI bloqueado até validação do WSDL, autenticação e contrato de homologação fornecidos oficialmente pelo TJMG."},409);
    }
    return respond({ok:false,error:"Ação não suportada"},400);
  }catch(e){return respond({ok:false,error:e instanceof Error?e.message:"Erro inesperado"},401)}
});

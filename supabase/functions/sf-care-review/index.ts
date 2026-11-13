import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, x-client-info, content-type","access-control-allow-methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
 try{
  const bearer=req.headers.get("authorization")||"";
  if(!bearer.startsWith("Bearer "))return json({ok:false,error:"unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const a=createClient(url,service,{auth:{persistSession:false}});
  const {data:{user},error:ue}=await a.auth.getUser(bearer.slice(7));
  if(ue||!user)return json({ok:false,error:"invalid_session"},401);
  const {data:profile}=await a.from("profiles").select("org_id,role_key,status").eq("id",user.id).maybeSingle();
  if(!profile||!["owner","lawyer"].includes(profile.role_key)||!["active","ativo"].includes(String(profile.status||"").toLowerCase()))return json({ok:false,error:"not_authorized_to_review"},403);
  const body=await req.json();
  if(body.action==="list"){
   const [queue,audit]=await Promise.all([
    a.from("sf_care_outbox").select("id,event_kind,status,message,source_verified,created_at,process_id,client_id").eq("org_id",profile.org_id).eq("status","pending_review").order("created_at").limit(50),
    a.from("whatsapp_outbound_gate_log").select("id,agent_key,allowed,reason,created_at").eq("org_id",profile.org_id).order("created_at",{ascending:false}).limit(30)
   ]);
   if(queue.error||audit.error)throw queue.error||audit.error;
   return json({ok:true,queue:queue.data,audit:audit.data});
  }
  const id=String(body.id||""),decision=String(body.decision||"");
  if(!uuid.test(id)||!["approve","reject"].includes(decision))return json({ok:false,error:"invalid_request"},422);
  const {data:row}=await a.from("sf_care_outbox").select("id,org_id,status,source_verified,metadata").eq("id",id).eq("org_id",profile.org_id).maybeSingle();
  if(!row||row.status!=="pending_review")return json({ok:false,error:"not_pending_or_not_found"},409);
  if(decision==="approve"&&!row.source_verified)return json({ok:false,error:"source_not_verified"},422);
  const edited=body.message;
  if(edited!==undefined&&(decision!=="approve"||typeof edited!=="string"||!edited.trim()||edited.trim().length>2000))return json({ok:false,error:"invalid_message"},422);
  const reviewedAt=new Date().toISOString();
  const {data,error}=await a.from("sf_care_outbox").update({...(edited===undefined?{}:{message:edited.trim()}),metadata:{...row.metadata,review:{reviewer_id:user.id,decision,at:reviewedAt}},status:decision==="approve"?"approved":"rejected",lawyer_approved:decision==="approve",updated_at:new Date().toISOString()}).eq("id",id).eq("org_id",profile.org_id).eq("status","pending_review").select("id,status").maybeSingle();
  if(error)throw error;
  if(!data)return json({ok:false,error:"concurrent_review"},409);
  return json({ok:true,id:data.id,status:data.status,reviewer:user.id,queued:false});
 }catch(e){console.error("sf-care-review",e);return json({ok:false,error:"internal_error"},500);}
});

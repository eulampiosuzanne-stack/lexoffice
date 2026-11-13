import { prepareDistribution } from './distribution.mjs';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds=new Set(["favorable_decision","agreement_poll","case_closed_nps","verified_movement","process_distributed","hearing_preparation","document_checklist"]);
Deno.serve(async(req)=>{
 if(req.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!service||req.headers.get("authorization")!=="Bearer "+service)return reply({ok:false,error:"unauthorized"},401);
 try{
  const b=await req.json();
  const {org_id,client_id,process_id,event_kind,source_id,verified,lawyer_approved}=b;
  if(![org_id,client_id,process_id].every((v)=>typeof v==="string"&&uuid.test(v))||!kinds.has(event_kind)||typeof source_id!=="string"||source_id.length<3||source_id.length>120||verified!==true)return reply({ok:false,error:"invalid_or_unverified_event"},422);
  if(["favorable_decision","case_closed_nps"].includes(event_kind)&&lawyer_approved!==true)return reply({ok:false,error:"lawyer_verification_required"},422);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,service,{auth:{persistSession:false}});
  const {data:c,error:ce}=await db.from("clients").select("id,name,status,is_demo").eq("id",client_id).eq("org_id",org_id).maybeSingle();
  const {data:p,error:pe}=await db.from("processes").select(event_kind==="process_distributed"?"id,client_id,is_demo,cnj_number,court,tribunal_name,tribunal_code":"id,client_id,is_demo").eq("id",process_id).eq("org_id",org_id).maybeSingle();
  if(ce||pe||!c||!p||p.client_id!==client_id||c.is_demo||p.is_demo)return reply({ok:false,error:"client_process_link_invalid"},422);
  const {data:pref}=await db.from("client_notification_preferences").select("whatsapp_enabled,proactive_process_updates").eq("org_id",org_id).eq("client_id",client_id).maybeSingle();
  if(!pref?.whatsapp_enabled||!pref?.proactive_process_updates)return reply({ok:false,error:"consent_missing"},422);
  const distribution=event_kind==="process_distributed"?prepareDistribution(p,client_id):null;
  if(event_kind==="process_distributed"&&!distribution)return reply({ok:false,error:"distribution_details_unverified"},422);
  const first=String(c.name||"cliente").trim().split(/\s+/)[0].replace(/[<>]/g,"").slice(0,60);
  const summary=String(b.summary||"").replace(/[<>]/g,"").trim().slice(0,400);
  const templates={
   favorable_decision:`🌷 Olá, ${first}! Há uma decisão favorável verificada no seu processo. ${summary} A decisão pode estar sujeita a recurso. Confira os detalhes com a equipe.`,
   agreement_poll:`Olá, ${first}! Se houver proposta de acordo, prefere avaliar com a Dra. Suzanne antes de responder? Esta consulta não autoriza nenhum acordo.`,
   case_closed_nps:`🌷 Olá, ${first}! Seu acompanhamento foi encerrado. De 0 a 10, como avalia nosso atendimento? Sua resposta é opcional.`,
   verified_movement:`Olá, ${first}! Há uma movimentação verificada no seu processo. ${summary} Confira o acompanhamento no portal.`,
   process_distributed:distribution?.message,
   hearing_preparation:`Olá, ${first}! Sua audiência se aproxima. ${summary} Consulte as orientações da equipe.`,
   document_checklist:`Olá, ${first}! Temos orientações sobre documentos do seu processo. ${summary} Consulte o portal seguro.`
  };
  if(["favorable_decision","verified_movement","hearing_preparation","document_checklist"].includes(event_kind)&&summary.length<8)return reply({ok:false,error:"verified_summary_required"},422);
  const eventSource=distribution?.sourceId||source_id;
  const key=`sf:${event_kind}:${process_id}:${eventSource}`;
  const {data,error}=await db.from("sf_care_outbox").upsert({org_id,client_id,process_id,event_kind,dedupe_key:key,message:templates[event_kind as keyof typeof templates],media_kind:"text",status:"pending_review",source_verified:true,lawyer_approved:lawyer_approved===true,metadata:{source_id:eventSource,proposed_at:new Date().toISOString()}},{onConflict:"org_id,dedupe_key",ignoreDuplicates:true}).select("id,status").maybeSingle();
  if(error)throw error;
  return reply({ok:true,created:!!data,id:data?.id||null,status:data?.status||"already_exists",sent:false});
 }catch(e){console.error("sf-care-ingest",e);return reply({ok:false,error:"internal_error"},500);}
});

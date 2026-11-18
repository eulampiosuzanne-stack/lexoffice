import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
import {greeting, maskPhone} from "./greeting.ts";
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, x-client-info, content-type","access-control-allow-methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE=["ativo","active","cliente","cliente_ativo","cliente_private"];
const DAILY_PROPOSAL_CAP=20;
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const hasDest=(c:any)=>{const d=digits(c?.whatsapp)||digits(c?.phone);return d.length>=10&&d.length<=15;};
const WEEKLY_BODY="Como você está? Gostaríamos de saber como está sendo seu acompanhamento com nosso escritório. Caso tenha alguma dúvida ou queira conversar, estamos à disposição. Se preferir não receber este tipo de contato, é só nos avisar por aqui.";
async function eligibleClients(a:any,orgId:string,limit:number){
  const {data:clients,error}=await a.from("clients").select("id,name,status,is_demo,whatsapp,phone").eq("org_id",orgId).eq("is_demo",false).order("name").limit(limit);
  if(error)throw error;
  const {data:prefs,error:pe}=await a.from("client_notification_preferences").select("client_id,whatsapp_enabled,proactive_process_updates").eq("org_id",orgId);
  if(pe)throw pe;
  const blocked=new Set((prefs||[]).filter((p:any)=>p.whatsapp_enabled===false||p.proactive_process_updates===false).map((p:any)=>p.client_id));
  const checked=clients||[];
  const eligible=checked.filter((c:any)=>ACTIVE.includes(String(c.status||"").toLowerCase())&&hasDest(c)&&!blocked.has(c.id));
  return {checked,eligible,blocked:blocked.size};
}
const CNJ=/^(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\d{20})$/;
// Clientes com ação já ajuizada: processo com número CNJ válido, fora de rascunho/cancelado, sem parceria e sem demo.
async function filedClientIds(a:any,orgId:string){
  const {data,error}=await a.from("processes").select("client_id,cnj_number,status,is_partnership,is_demo").eq("org_id",orgId).not("client_id","is",null).limit(5000);
  if(error)throw error;
  return new Set((data||[]).filter((p:any)=>typeof p.cnj_number==="string"&&CNJ.test(p.cnj_number)&&!["rascunho","draft","cancelado"].includes(String(p.status||"").toLowerCase())&&p.is_partnership!==true&&p.is_demo!==true).map((p:any)=>p.client_id));
}
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
  if(body.action==="metrics"){
   const days=Number(body.days??7);
   if(![1,7,30].includes(days))return json({ok:false,error:"invalid_period"},422);
   const since=new Date(Date.now()-days*86400000).toISOString();
   const {data,error}=await a.rpc("communication_metrics",{p_org:profile.org_id,p_since:since});
   if(error)throw error;
   return json({ok:true,metrics:data});
  }
  if(body.action==="list"){
   const [queue,audit]=await Promise.all([
    a.from("sf_care_outbox").select("id,event_kind,status,message,source_verified,created_at,process_id,client_id").eq("org_id",profile.org_id).eq("status","pending_review").order("created_at").limit(50),
    a.from("whatsapp_outbound_gate_log").select("id,agent_key,allowed,reason,created_at").eq("org_id",profile.org_id).order("created_at",{ascending:false}).limit(30)
   ]);
   if(queue.error||audit.error)throw queue.error||audit.error;
   const ids=[...new Set((queue.data||[]).map((q:any)=>q.client_id).filter(Boolean))];
   const procIds=[...new Set((queue.data||[]).map((q:any)=>q.process_id).filter(Boolean))];
   const [cl,pr]=await Promise.all([
    ids.length?a.from("clients").select("id,name,whatsapp,phone").eq("org_id",profile.org_id).in("id",ids):Promise.resolve({data:[],error:null}),
    procIds.length?a.from("processes").select("id,cnj_number").eq("org_id",profile.org_id).in("id",procIds):Promise.resolve({data:[],error:null})
   ]);
   if(cl.error||pr.error)throw cl.error||pr.error;
   const cmap=new Map((cl.data||[]).map((c:any)=>[c.id,c]));
   const pmap=new Map((pr.data||[]).map((p:any)=>[p.id,p.cnj_number]));
   const items=(queue.data||[]).map((q:any)=>{const c:any=cmap.get(q.client_id);return {...q,client_name:c?.name||null,client_phone:maskPhone(c),process_cnj:q.process_id?pmap.get(q.process_id)||null:null};});
   return json({ok:true,queue:items,audit:audit.data});
  }
  if(body.action==="create_care_draft"){
    const clientId=String(body.client_id||""),kind=String(body.kind||"");
    const templates:Record<string,string>={
      post_filing_checkin:"Como estão as coisas desde o ajuizamento da sua ação? Você está conseguindo acompanhar as informações pelo aplicativo? Nossa equipe está à disposição.",
      office_card:"O escritório Suzanne Figueiredo Advocacia e Soluções Jurídicas oferece acompanhamento digital. Consulte seu processo pelo aplicativo.",
      educational_card:"Cada processo tem etapas e prazos próprios. Para informações sobre o seu caso, consulte nossa equipe.",
      satisfaction_poll:"Como você avalia nosso atendimento? 1. Muito bom; 2. Bom; 3. Preciso de esclarecimentos; 4. Quero conversar.",
      interest_poll:"Qual conteúdo gostaria de receber? 1. Etapas do processo; 2. Aplicativo; 3. Documentos; 4. Audiências."
    };
    if(!uuid.test(clientId)||!Object.hasOwn(templates,kind))return json({ok:false,error:"invalid_draft"},422);
    const {data:client}=await a.from("clients").select("id,name,status,is_demo,whatsapp,phone").eq("org_id",profile.org_id).eq("id",clientId).maybeSingle();
    const {data:pref}=await a.from("client_notification_preferences").select("whatsapp_enabled,proactive_process_updates").eq("org_id",profile.org_id).eq("client_id",clientId).maybeSingle();
    if(!client||client.is_demo||!ACTIVE.includes(String(client.status||"").toLowerCase())||!hasDest(client)||(pref&&(pref.whatsapp_enabled===false||pref.proactive_process_updates===false)))return json({ok:false,error:"client_not_eligible"},422);
    if(kind==="post_filing_checkin"){
      const {data:processes,error:processError}=await a.from("processes").select("id,cnj_number,status").eq("org_id",profile.org_id).eq("client_id",clientId).limit(30);
      if(processError)throw processError;
      const validProcessIds=(processes||[]).filter(p=>typeof p.cnj_number==="string"&&/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(p.cnj_number)&&!["rascunho","draft","cancelado"].includes(String(p.status||"").toLowerCase())).map(p=>p.id);
      const {data:distributionEvents,error:distributionError}=validProcessIds.length?await a.from("sf_care_outbox").select("id").eq("org_id",profile.org_id).eq("client_id",clientId).eq("event_kind","process_distributed").eq("source_verified",true).in("process_id",validProcessIds).limit(1):{data:[],error:null};
      if(distributionError)throw distributionError;
      const verified=(distributionEvents||[]).length>0;
      if(!verified)return json({ok:false,error:"filing_not_verified"},422);
    }
    const message=greeting(client.name)+" "+templates[kind];
    const dedupe=["sf","care",kind,clientId,new Date().toISOString().slice(0,10)].join(":");
    const {data,error}=await a.from("sf_care_outbox").upsert({org_id:profile.org_id,client_id:clientId,process_id:null,event_kind:kind,dedupe_key:dedupe,message,media_kind:"text",status:"pending_review",source_verified:true,lawyer_approved:false,metadata:{origin:"sf_care_editorial",created_by:user.id,format:kind.includes("card")?"card":kind.includes("poll")?"poll":"text"}},{onConflict:"org_id,dedupe_key",ignoreDuplicates:true}).select("id").maybeSingle();
    if(error)throw error;
    return json({ok:true,created:!!data,id:data?.id||null,sent:false});
  }
  if(body.action==="eligible_clients"){
    const {checked,eligible,blocked}=await eligibleClients(a,profile.org_id,250);
    return json({ok:true,clients:eligible.map((c:any)=>({id:c.id,name:c.name})),diagnostics:{clients_checked:checked.length,opted_out_clients:blocked,eligible_clients:eligible.length,policy:"active_with_whatsapp_unless_opted_out",limited_to_first_250:true}});
  }
  if(body.action==="prepare_weekly_care"){
    const {eligible:allEligible}=await eligibleClients(a,profile.org_id,1000);
    const filed=await filedClientIds(a,profile.org_id);
    const eligible=allEligible.filter((c:any)=>filed.has(c.id));
    const week=new Date().toISOString().slice(0,10);
    const brt=new Date(Date.now()-3*3600000);
    const dayStart=new Date(Date.UTC(brt.getUTCFullYear(),brt.getUTCMonth(),brt.getUTCDate(),3)).toISOString();
    const {count:createdToday,error:ce2}=await a.from("sf_care_outbox").select("id",{count:"exact",head:true}).eq("org_id",profile.org_id).gte("created_at",dayStart).contains("metadata",{origin:"sf_care_weekly"});
    if(ce2)throw ce2;
    const room=Math.max(0,DAILY_PROPOSAL_CAP-(createdToday||0));
    if(room===0)return json({ok:true,created:0,sent:false,reason:"daily_cap_reached",daily_cap:DAILY_PROPOSAL_CAP});
    const {data:recent,error:re}=await a.from("sf_care_outbox").select("client_id").eq("org_id",profile.org_id).gte("created_at",new Date(Date.now()-7*86400000).toISOString()).limit(2000);
    if(re)throw re;
    const contacted=new Set((recent||[]).map((r:any)=>r.client_id));
    const candidates=eligible.filter((c:any)=>!contacted.has(c.id)).slice(0,room);
    const drafts=candidates.map((c:any)=>({
      org_id:profile.org_id,client_id:c.id,process_id:null,event_kind:"relationship_checkin",
      dedupe_key:["sf","weekly-care",c.id,week].join(":"),
      message:greeting(c.name)+" "+WEEKLY_BODY,
      media_kind:"text",status:"pending_review",source_verified:true,lawyer_approved:false,
      metadata:{origin:"sf_care_weekly",created_by:user.id,requires_review:true}
    }));
    if(!drafts.length)return json({ok:true,created:0,sent:false,reason:"no_eligible_clients"});
    const {data,error}=await a.from("sf_care_outbox").upsert(drafts,{onConflict:"org_id,dedupe_key",ignoreDuplicates:true}).select("id");
    if(error)throw error;
    return json({ok:true,created:(data||[]).length,sent:false,requires_review:true,daily_cap:DAILY_PROPOSAL_CAP});
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

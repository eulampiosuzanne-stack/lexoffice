import { isProcessFollowup, processFollowupDecision } from '../_shared/process-followup-policy.mjs';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
// v31 (11/11/2026): trava de segurança — aviso genérico "Consulte a LexOffice" (ponte antiga, desligada em 11/11) nunca é enviado ao cliente.
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const digits=(v:any)=>String(v??"").replace(/\D/g,"");
const isGenericMovementNotice=(m:any)=>/Consulte a LexOffice para detalhes/i.test(String(m||""));
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({ok:false,error:"Método inválido"},405);
 const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const a=createClient(url,service,{auth:{persistSession:false}});
 try{
  const supplied=req.headers.get("x-sync-token")||"";
  const {data:sec}=await a.from("system_runtime_secrets").select("secret").eq("key","datajud_sync_token").maybeSingle();
  if(!sec?.secret||supplied!==sec.secret)return json({ok:false,error:"Não autorizado"},401);
  const now=new Date().toISOString();
  await a.from("notification_queue").update({status:"pending",last_error:"Recuperado após processamento interrompido",updated_at:now})
    .eq("status","processing").lt("updated_at",new Date(Date.now()-15*60000).toISOString());
  const {data:items,error}=await a.from("notification_queue").select("*").eq("status","pending").eq("channel","whatsapp")
    .lte("scheduled_at",now).order("scheduled_at",{ascending:true}).limit(50);
  if(error)throw error;
  const results:any[]=[];
  for(const item of items||[]){
   if(isGenericMovementNotice(item.message)){await a.from("notification_queue").update({status:"cancelled",last_error:"Bloqueado: aviso genérico \"Consulte a LexOffice\". O andamento é enviado pelo agente de andamentos com explicação.",updated_at:new Date().toISOString()}).eq("id",item.id).eq("status","pending");results.push({id:item.id,ok:false,blocked:"generic_notice"});continue;}
   const claim=await a.from("notification_queue").update({status:"processing",updated_at:now}).eq("id",item.id).eq("status","pending").select("id").maybeSingle();
   if(!claim.data)continue;
   try{
    const phone=digits(item.destination);
    if(phone.length<10||phone.length>15)throw new Error("Número de WhatsApp inválido");
    const text=String(item.message||"").trim();
    if(!text)throw new Error("Mensagem vazia");
    const payload=item.payload&&typeof item.payload==="object"?item.payload:{};
    const agent=String(payload.agent_key||(/cobran|pagamento|parcela|honor/i.test(String(item.template_key||"")+" "+text)?"billing":"system"));
    if(isProcessFollowup(item)){
     const process=await a.from("processes").select("status,client_id")
       .eq("org_id",item.org_id).eq("id",item.process_id).maybeSingle();
     if(process.error)throw process.error;
     const decision=!process.data||!item.client_id||process.data.client_id!==item.client_id
       ? "process_recipient_unverified" : processFollowupDecision(process.data.status);
     if(decision){
      const result=await a.from("notification_queue").update({
       status:"cancelled",last_error:decision,updated_at:new Date().toISOString(),
      }).eq("org_id",item.org_id).eq("id",item.id).eq("status","processing");
      if(result.error)throw result.error;
      results.push({id:item.id,ok:false,blocked:decision});
      continue;
     }
    }
    const r=await fetch(url+"/functions/v1/whatsapp-outbound-gate",{method:"POST",headers:{Authorization:"Bearer "+service,apikey:service,"Content-Type":"application/json"},body:JSON.stringify({
      org_id:item.org_id,conversation_id:payload.conversation_id||null,phone,message:text,agent_key:agent,
      format_agent_reply:false,idempotency_key:"notification:"+item.id
    })});
    const d=await r.json().catch(()=>null);
    if(d?.reason==="outside_business_hours"&&d?.retryable===true){await a.from("notification_queue").update({status:"pending",scheduled_at:new Date(Date.now()+60*60000).toISOString(),last_error:"Aguardando horário comercial",updated_at:new Date().toISOString()}).eq("id",item.id).eq("status","processing");results.push({id:item.id,ok:false,deferred:true});continue;} if(!r.ok||d?.ok!==true||d?.allowed!==true)throw new Error(d?.error||d?.reason||"Envio não confirmado");
    await a.from("notification_queue").update({status:"sent",sent_at:new Date().toISOString(),last_error:null,provider_message_id:String(d?.provider_response?.messages?.[0]?.id||d?.provider_response?.messageId||d?.provider_response?.id||"")||null,attempts:Number(item.attempts||0)+1,updated_at:new Date().toISOString()}).eq("id",item.id);
    results.push({id:item.id,ok:true,provider:d.provider});
   }catch(e){
    const reason=e instanceof Error?e.message:String(e);
    const attempts = Number(item.attempts || 0) + 1;
    const retryAfter = /Rate limit exceeded[^.]*\.\s*Retry after\s+(\d+)ms/i.exec(reason);
    if (retryAfter && attempts < 4) {
      const delay = Math.max(3 * 60000, Number(retryAfter[1]));
      const { error: retryError } = await a.from("notification_queue")
        .update({
          status: "pending",
          scheduled_at: new Date(Date.now() + delay).toISOString(),
          last_error: reason.slice(0, 500),
          attempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("status", "processing");
      if (retryError) throw retryError;
      results.push({ id: item.id, ok: false, deferred: true });
      continue;
    }
    await a.from("notification_queue").update({status:"failed",last_error:reason.slice(0,500),attempts:Number(item.attempts||0)+1,updated_at:new Date().toISOString()}).eq("id",item.id);
    results.push({id:item.id,ok:false,error:reason});
   }
  }
  return json({ok:true,processed:results.length,sent:results.filter(x=>x.ok).length,deferred:results.filter(x=>x.deferred).length,failed:results.filter(x=>!x.ok&&!x.deferred&&!x.blocked).length,blocked:results.filter(x=>x.blocked).length,results});
 }catch(e){console.error("notification-queue-worker",e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});

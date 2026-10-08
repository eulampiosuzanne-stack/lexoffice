import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function admin(){
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)throw new Error("Configuração interna indisponível");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function clean(value:unknown,max=80){return String(value??"").replace(/[\r\n\t]+/g," ").replace(/\s{2,}/g," ").trim().slice(0,max);}
function digits(value:unknown){return String(value??"").replace(/\D/g,"");}

export async function handleVipInboundMessage(req:Request){
  if(req.method==="OPTIONS")return new Response("ok",{headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-vip-token","Access-Control-Allow-Methods":"POST,OPTIONS"}});
  if(req.method!=="POST")return json({ok:false,error:"Método inválido"},405);
  const a=admin();
  const supplied=String(req.headers.get("x-vip-token")||"");
  const {data:secret}=await a.from("vip_internal_secrets").select("token").eq("id",true).maybeSingle();
  if(!secret?.token||!supplied||supplied!==secret.token)return json({ok:false,error:"Não autorizado"},401);
  const b=await req.json().catch(()=>({}));
  const messageId=String(b.message_id||"").trim();
  if(!messageId)return json({ok:false,error:"Mensagem não informada"},400);
  try{
    const {data:message,error:messageError}=await a.from("whatsapp_messages").select("id,org_id,conversation_id,direction").eq("id",messageId).maybeSingle();
    if(messageError)throw messageError;
    if(!message||message.direction!=="inbound"||!message.conversation_id)return json({ok:false,error:"Mensagem não elegível"},404);
    const {data:conversation,error:conversationError}=await a.from("whatsapp_conversations").select("id,org_id,client_id,contact_id").eq("id",message.conversation_id).eq("org_id",message.org_id).maybeSingle();
    if(conversationError)throw conversationError;
    if(!conversation)return json({ok:false,error:"Conversa não encontrada"},404);
    let clientId=conversation.client_id||null;
    let contact:any=null;
    if(conversation.contact_id){
      const {data,error}=await a.from("whatsapp_contacts").select("id,phone,name,client_id").eq("id",conversation.contact_id).maybeSingle();
      if(error)throw error;contact=data;if(!clientId)clientId=contact?.client_id||null;
    }
    if(!clientId)return json({ok:true,ignored:true,reason:"no_client"});
    const {data:client,error:clientError}=await a.from("clients").select("id,org_id,name,is_vip").eq("id",clientId).eq("org_id",message.org_id).maybeSingle();
    if(clientError)throw clientError;
    if(!client?.is_vip)return json({ok:true,ignored:true,reason:"not_vip"});
    const now=new Date().toISOString();
    let {data:delivery,error:deliveryError}=await a.from("vip_greeting_deliveries").select("status").eq("conversation_id",conversation.id).maybeSingle();
    if(deliveryError)throw deliveryError;
    if(!delivery){
      const inserted=await a.from("vip_greeting_deliveries").insert({conversation_id:conversation.id,org_id:message.org_id,client_id:clientId,status:"sending"}).select("status").maybeSingle();
      if(inserted.error){
        if(inserted.error.code==="23505")return json({ok:true,duplicate:true});
        throw inserted.error;
      }
      delivery=inserted.data;
    }else if(delivery.status==="sent"||delivery.status==="sending"||delivery.status==="pending"){
      return json({ok:true,duplicate:true,status:delivery.status});
    }else{
      const retry=await a.from("vip_greeting_deliveries").update({status:"sending",last_error:null}).eq("conversation_id",conversation.id).eq("status","failed").select("status").maybeSingle();
      if(retry.error)throw retry.error;
      if(!retry.data)return json({ok:true,duplicate:true,status:"sending"});
      delivery=retry.data;
    }
    const firstName=clean(client.name).split(" ")[0]||"";
    const greeting=(firstName?"Olá, "+firstName+"!":"Olá!")+" Aqui é a Helena, assistente da Dra. Suzanne. Recebemos sua mensagem e encaminhei a conversa para a Dra. Suzanne, que seguirá com seu atendimento por aqui.";
    const phone=digits(contact?.phone);
    if(!phone)throw new Error("O contato VIP não possui telefone válido.");
    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gate=await fetch(url+"/functions/v1/whatsapp-outbound-gate",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+service},body:JSON.stringify({org_id:message.org_id,conversation_id:conversation.id,phone,agent_key:"system",message:greeting,format_agent_reply:false,idempotency_key:"vip-greeting:"+conversation.id,human_silence_minutes:0})});
    const sent=await gate.json().catch(()=>({}));
    if(!gate.ok||sent?.ok!==true||sent?.allowed!==true)throw new Error(clean(sent?.error||sent?.reason||"Falha no envio da saudação.",240));
    const sentAt=new Date().toISOString();
    const {error:historyError}=await a.from("whatsapp_messages").insert({org_id:message.org_id,conversation_id:conversation.id,direction:"outbound",message_type:"text",body:greeting,status:"sent",sent_at:sentAt,external_message_id:String(sent?.provider_response?.zaapId||sent?.provider_response?.messageId||sent?.provider_response?.id||"")||null,metadata:{source:"vip_personalized_greeting",agent_key:"helena_vip_greeting"}});
    if(historyError)throw historyError;
    await a.from("whatsapp_conversations").update({last_message_at:sentAt,last_message_preview:greeting.slice(0,120),priority:"urgent",bot_ativo:false,conversation_owner:"HUMAN",human_takeover_at:now,human_takeover_reason:"vip_auto_handoff",updated_at:sentAt}).eq("id",conversation.id).eq("org_id",message.org_id);
    await a.from("vip_greeting_deliveries").update({status:"sent",sent_at:sentAt,last_error:null}).eq("conversation_id",conversation.id);
    return json({ok:true,sent:true});
  }catch(error){
    const reason=clean(error instanceof Error?error.message:error,240);
    try{await a.from("vip_greeting_deliveries").update({status:"failed",last_error:reason}).eq("conversation_id",String((await req.clone().json().catch(()=>({}))).conversation_id||""))}catch{}
    return json({ok:false,error:reason},502);
  }
}

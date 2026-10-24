import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2";
const h={"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:h});
const DEFAULT_INSTANCE="suzanne-lexoffice";
async function runtimeSecret(db:any,key:string){const {data}=await db.from("system_runtime_secrets").select("secret").eq("key",key).maybeSingle();return String(data?.secret||"").trim()}
async function configuredInstance(db:any){return (await runtimeSecret(db,"evolution_instance_name"))||DEFAULT_INSTANCE}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:h});
 if(req.method!=="POST")return J({error:"method_not_allowed"},405);
 if(new URL(req.url).searchParams.get("evolution_webhook")==="1"){
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const {data:config}=await db.from("system_runtime_secrets").select("secret").eq("key","evolution_webhook_token").maybeSingle();
 const token=String(new URL(req.url).searchParams.get("token")||"");const expected=String(config?.secret||"");
 let diff=0;if(token.length===expected.length)for(let i=0;i<token.length;i++)diff|=token.charCodeAt(i)^expected.charCodeAt(i);
 if(!expected||token.length!==expected.length||diff!==0)return J({error:"webhook_forbidden"},403);
 const event=await req.json().catch(()=>null);if(!event)return J({error:"invalid_json"},400);
 const expectedInstance=await configuredInstance(db);
 const inst=String(event.instance||event.instanceName||event.data?.instance||"");
 if(inst!==expectedInstance)return J({ok:true,ignored:"other_instance"});
 const kind=String(event.event||"").replace(/_/g,".").toLowerCase();
 if(kind==="connection.update")return J({ok:true,event:kind});
 if(kind!=="messages.upsert")return J({ok:true,ignored:"event"});
 const data=event.data||{},key=data.key||{},msg=data.message||{};
 const jid=String(key.remoteJidAlt||key.remoteJid||data.remoteJid||"");
 if(jid.includes("@g.us")||jid.includes("@broadcast")||jid.includes("@newsletter"))return J({ok:true,ignored:"non_inbound"});
 if(key.fromMe===true){
   const phone=jid.replace(/@.*/,"").replace(/\D/g,"");
   if(!/^55\d{10,11}$/.test(phone))return J({ok:true,ignored:"outbound_invalid_phone"});
   const msgId=String(key.id||"");
   if(msgId){const {data:automated}=await db.from("whatsapp_messages").select("id").eq("external_message_id",msgId).eq("direction","outbound").limit(1).maybeSingle();if(automated)return J({ok:true,ignored:"outbound_logged"});}
   const content=String(msg.conversation||msg.extendedTextMessage?.text||"").trim();
   const {data:contacts}=await db.from("whatsapp_contacts").select("id").eq("org_id","b3dd3ed0-2a05-4087-8220-307a44352cec").eq("phone",phone).limit(1);
   for(const ct of contacts||[]){
     const {data:cv}=await db.from("whatsapp_conversations").select("id").eq("org_id","b3dd3ed0-2a05-4087-8220-307a44352cec").eq("contact_id",ct.id).neq("status","closed").order("updated_at",{ascending:false}).limit(1).maybeSingle();
     if(!cv)continue;
     if(content){const {data:existing}=await db.from("whatsapp_messages").select("id").eq("conversation_id",cv.id).eq("direction","outbound").eq("body",content).gt("created_at",new Date(Date.now()-120000).toISOString()).limit(1).maybeSingle();if(existing)return J({ok:true,ignored:"outbound_matched_agent"});}
     const now=new Date().toISOString();
     await db.from("whatsapp_conversations").update({last_human_outbound_at:now,human_takeover_reason:"manual_operator_message",updated_at:now}).eq("id",cv.id);
     if(msgId)await db.from("whatsapp_messages").insert({org_id:"b3dd3ed0-2a05-4087-8220-307a44352cec",conversation_id:cv.id,direction:"outbound",message_type:"text",body:content||"[mensagem pelo WhatsApp]",external_message_id:msgId,status:"sent",sent_at:now,metadata:{source:"whatsapp_native_operator"}}).then(()=>{});
   }
   return J({ok:true,ignored:"human_outbound_paused"});
 }
 const phone=jid.replace(/@.*/,"").replace(/\D/g,"");
 if(!/^55\d{10,11}$/.test(phone))return J({ok:true,ignored:"invalid_phone"});
 const body=String(msg.conversation||msg.extendedTextMessage?.text||msg.imageMessage?.caption||msg.videoMessage?.caption||msg.documentMessage?.caption||msg.buttonsResponseMessage?.selectedDisplayText||msg.listResponseMessage?.title||"").trim();
 if(!body)return J({ok:true,ignored:"unsupported_media"});
 const sk=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const transformed={phone,senderName:String(data.pushName||""),messageId:String(key.id||""),fromMe:false,fromApi:false,text:{message:body},source:"evolution"};
 const up=await fetch(Deno.env.get("SUPABASE_URL")!+"/functions/v1/zapi-message-webhook",{method:"POST",headers:{"Authorization":"Bearer "+sk,"x-evolution-bridge":"suzanne-lexoffice","Content-Type":"application/json"},body:JSON.stringify(transformed),signal:AbortSignal.timeout(55000)});
 const result=await up.json().catch(()=>({}));
 if(!up.ok)return J({ok:false,error:"inbound_bridge_failed",status:up.status},502);
 return J({ok:true,delivered:true,processing:result?.event||result?.ignored||"accepted"});
 }
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return J({error:"unauthorized"},401);
 const u=Deno.env.get("SUPABASE_URL")!,a=Deno.env.get("SUPABASE_ANON_KEY")!,s=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const auth=createClient(u,a,{global:{headers:{Authorization:bearer}}});
 const {data:{user},error}=await auth.auth.getUser();
 if(error||!user)return J({error:"unauthorized"},401);
 const db=createClient(u,s,{auth:{persistSession:false}});
 const {data:p}=await db.from("profiles").select("org_id,role_key,status").eq("id",user.id).maybeSingle();
 if(!p?.org_id||p.status==="inactive"||!["owner","admin","super_admin","master"].includes(String(p.role_key||"").toLowerCase()))return J({error:"administrator_required"},403);
 const instanceName=await configuredInstance(db);
 const {data:instance}=await db.from("whatsapp_evolution_instances").select("id,instance_name,status").eq("org_id",p.org_id).eq("instance_name",instanceName).maybeSingle();
 if(!instance)return J({error:"office_instance_missing"},404);
 const body=await req.json().catch(()=>({}));
 const aliases:Record<string,string>={check:"status",verify:"status",check_connection:"status",create_connection:"create",qrcode:"qr",generate_qr:"qr",generate_pairing_code:"pair",pairing_code:"pair",reconnect:"status",reconnect_webhook:"status",enable_webhook:"status"};
 const requestedAction=String(body.action||"status").toLowerCase();
 const action=aliases[requestedAction]||requestedAction;
 const {data:secrets}=await db.from("system_runtime_secrets").select("key,secret").in("key",["whatsapp_provider","uazapi_base_url","uazapi_instance_token","uazapi_instance_name","evolution_api_url","evolution_api_key"]);
 const cfg=Object.fromEntries((secrets||[]).map((x:any)=>[x.key,String(x.secret||"").trim()]));
 if(String(cfg.whatsapp_provider||"").toLowerCase()==="uazapi"){
   const uazaBase=String(cfg.uazapi_base_url||"").replace(/\/+$/g,"");
   const uazaToken=String(cfg.uazapi_instance_token||"");
   if(!/^https:\/\//i.test(uazaBase)||!uazaToken)return J({error:"uazapi_server_configuration_invalid"},503);
   const uaza=async(path:string,method="GET",payload?:unknown)=>{
     const res=await fetch(uazaBase+path,{method,headers:{token:uazaToken,"Content-Type":"application/json"},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
     const data=await res.json().catch(()=>({}));
     return {ok:res.ok,status:res.status,data};
   };
   try{
     if(action==="status"||action==="create"){
       const r=await uaza("/instance/status");
       const connected=Boolean(r.data?.status?.connected||r.data?.status?.loggedIn||r.data?.instance?.connected);
       const resetting=Boolean(r.data?.status?.resetting);
       const newStatus=connected?"connected":resetting?"connecting":"disconnected";
       if(r.ok)await db.from("whatsapp_evolution_instances").update({status:newStatus,is_active:connected,settings:{provider:"uazapi",instance_name:String(cfg.uazapi_instance_name||"lexoffice-suzanne")},updated_at:new Date().toISOString()}).eq("id",instance.id);
       return J({ok:r.ok,http_status:r.status,state:newStatus,instance_status:newStatus,instance_name:String(cfg.uazapi_instance_name||instance.instance_name),connected});
     }
     if(action==="pair"||action==="qr"){
       const number=String(body.number||"").replace(/\D/g,"");
       if(action==="pair"&&number!=="5531992984141")return J({error:"phone_not_authorized"},400);
       const r=await uaza("/instance/connect","POST",action==="pair"?{phone:number}:{});
       const source=r.data?.data||r.data?.instance||r.data||{};
       const pairingCode=source.pairingCode||source.pairing_code||source.paircode||source.code;
       const qrCode=source.qrcode||source.qr_code||source.qrCode||source.base64;
       if(!r.ok)return J({ok:false,error:action==="pair"?"pairing_code_unavailable":"qr_code_unavailable",http_status:r.status},502);
       if(action==="pair"&&!pairingCode)return J({ok:false,error:"pairing_code_unavailable",http_status:r.status},502);
       if(action==="qr"&&!qrCode)return J({ok:false,error:"qr_code_unavailable",http_status:r.status},502);
       await db.from("whatsapp_evolution_instances").update({status:"qr_pending",is_active:false,updated_at:new Date().toISOString()}).eq("id",instance.id);
       return J(action==="pair"?{ok:true,pairing_code:String(pairingCode),instance_name:String(cfg.uazapi_instance_name||instance.instance_name)}:{ok:true,qr_code:String(qrCode),instance_name:String(cfg.uazapi_instance_name||instance.instance_name)});
     }
     return J({error:"invalid_action"},400);
   }catch{return J({error:"uazapi_request_failed"},502)}
 }
 const base=String(cfg.evolution_api_url||"").replace(/\/+$/,"");
 if(!/^https:\/\//i.test(base)||!cfg.evolution_api_key)return J({error:"evolution_server_configuration_invalid"},503);
 const api=async(path:string,method="GET",payload?:unknown)=>{
 const res=await fetch(base+path,{method,headers:{apikey:String(cfg.evolution_api_key),"Content-Type":"application/json"},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(12000)});
 const data=await res.json().catch(()=>({}));
 return {ok:res.ok,status:res.status,data};
 };
 try{
 if(action==="status"){
 const r=await api("/instance/connectionState/"+encodeURIComponent(instance.instance_name));
 const state=String(r.data?.instance?.state||r.data?.state||"").toLowerCase();
 let instanceStatus=instance.status;
 if(r.ok&&state){
   const newStatus=state==="open"?"connected":state==="connecting"?"connecting":"disconnected";
   if(newStatus!==instance.status){
     const {error:updateError}=await db.from("whatsapp_evolution_instances").update({status:newStatus,is_active:newStatus==="connected",updated_at:new Date().toISOString()}).eq("id",instance.id);
     if(updateError)return J({ok:false,error:"state_sync_failed",http_status:r.status,state,details:updateError.code},500);
   }
   instanceStatus=newStatus;
 }
 return J({ok:r.ok,http_status:r.status,state:state||null,instance_status:instanceStatus,instance_name:instance.instance_name,connected:state==="open"});
}
 if(action==="create"){
 if(instance.status!=="not_provisioned")return J({error:"instance_already_registered",status:instance.status},409);
 const r=await api("/instance/create","POST",{instanceName:instance.instance_name,integration:"WHATSAPP-BAILEYS",qrcode:false});
 if(!r.ok)return J({ok:false,error:"evolution_create_failed",http_status:r.status},502);
 await db.from("whatsapp_evolution_instances").update({status:"disconnected",updated_at:new Date().toISOString()}).eq("id",instance.id);
 return J({ok:true,instance_name:instance.instance_name,status:"created"});
 }
 if(action==="pair"){
 if(instance.status==="not_provisioned")return J({error:"create_instance_first"},409);
 const number=String(body.number||"").replace(/\D/g,"");
 if(number!=="5531992984141")return J({error:"phone_not_authorized"},400);
 const r=await api("/instance/connect/"+encodeURIComponent(instance.instance_name)+"?number="+number);
 const pairingCode=r.data?.pairingCode||r.data?.pairing_code||r.data?.code;
 if(!r.ok||!pairingCode)return J({ok:false,error:"pairing_code_unavailable",http_status:r.status},502);
 await db.from("whatsapp_evolution_instances").update({status:"qr_pending",updated_at:new Date().toISOString()}).eq("id",instance.id);
 return J({ok:true,pairing_code:pairingCode,instance_name:instance.instance_name});
 }
 if(action==="qr"){
 const r=await api("/instance/connect/"+encodeURIComponent(instance.instance_name));
 const source=r.data?.data||r.data?.instance||r.data||{};
 const qrCode=source.qrcode||source.qr_code||source.qrCode||source.base64;
 if(!r.ok||!qrCode)return J({ok:false,error:"qr_code_unavailable",http_status:r.status},502);
 await db.from("whatsapp_evolution_instances").update({status:"qr_pending",is_active:false,updated_at:new Date().toISOString()}).eq("id",instance.id);
 return J({ok:true,qr_code:String(qrCode),instance_name:instance.instance_name});
 }
 return J({error:"invalid_action"},400);
 }catch{return J({error:"evolution_request_failed"},502)}
});

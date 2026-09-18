import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const J=(b:any,s=200,h:Record<string,string>={})=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json",...h}});
const sha=async(v:string)=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")};

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const db=createClient(url,service,{auth:{persistSession:false}});
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)return J({ok:false,error:"authentication_required"},401,{"WWW-Authenticate":'Bearer realm="LexOffice ChatGPT"'});
 const hash=await sha(token);
 const {data:c}=await db.from("chatgpt_connections").select("id,org_id,scopes,status,expires_at").eq("token_hash",hash).maybeSingle();
 if(!c||c.status!=="active"||(c.expires_at&&new Date(c.expires_at)<=new Date()))return J({ok:false,error:"invalid_or_revoked_token"},401);
 await db.from("chatgpt_connections").update({last_used_at:new Date().toISOString()}).eq("id",c.id);
 const u=new URL(req.url),tool=String(u.searchParams.get("tool")||"health");
 const need=(s:string)=>{if(!c.scopes?.includes(s))throw new Error("INSUFFICIENT_SCOPE")};
 let result:any;
 try{
   if(tool==="health"){need("lex.health.read");result={ok:true,service:"lexoffice-chatgpt",connected:true};}
   else if(tool==="calendar"){need("lex.calendar.read");const {data,error}=await db.from("calendar_events").select("id,client_id,process_id,title,description,starts_at,ends_at,status,event_type,meeting_mode,meeting_url").eq("org_id",c.org_id).neq("status","cancelled").order("starts_at").limit(100);if(error)throw error;result={ok:true,events:data||[]};}
   else if(tool==="handoff_queue"){need("lex.conversations.read");const {data,error}=await db.from("whatsapp_conversations").select("id,contact_id,last_message_at,last_message_preview,conversation_owner,human_takeover_at,human_takeover_reason").eq("org_id",c.org_id).in("conversation_owner",["WAITING_HUMAN","HUMAN"]).order("last_message_at",{ascending:false}).limit(100);if(error)throw error;result={ok:true,conversations:data||[]};}
   else return J({ok:false,error:"unknown_tool"},404);
   await db.from("chatgpt_audit_log").insert({org_id:c.org_id,connection_id:c.id,tool_name:tool,outcome:"success",metadata:{method:req.method}});
   return J(result);
 }catch(e){
   const msg=e instanceof Error?e.message:String(e);
   await db.from("chatgpt_audit_log").insert({org_id:c.org_id,connection_id:c.id,tool_name:tool,outcome:"error",metadata:{error:msg.slice(0,300)}});
   if(msg==="INSUFFICIENT_SCOPE")return J({ok:false,error:"insufficient_scope"},403);
   return J({ok:false,error:msg},500);
 }
});

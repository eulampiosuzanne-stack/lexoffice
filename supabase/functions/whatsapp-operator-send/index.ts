import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const digits=(v:any)=>String(v??'').replace(/\D/g,'');
function admin(){return createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})}
async function authContext(req:Request,body:any){
  const auth=req.headers.get('authorization')||'';
  const bearer=auth.replace(/^Bearer\s+/i,'').trim();
  const service=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
  const a=admin();
  if(service && bearer===service){const orgId=String(body?.org_id||'').trim();if(!orgId)throw new Error('INTERNAL_ORG_REQUIRED');return {a,orgId,userId:null,internal:true}}
  const s=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data,error}=await s.auth.getUser();if(error||!data.user)throw new Error('UNAUTHORIZED');
  const {data:p}=await a.from('profiles').select('org_id,status').eq('id',data.user.id).maybeSingle();if(!p?.org_id||p.status!=='active')throw new Error('FORBIDDEN');
  return {a,orgId:String(p.org_id),userId:data.user.id,internal:false};
}
async function sendViaGate(orgId:string,conversationId:string|null,phone:string,message:string,key:string){
 const u=Deno.env.get('SUPABASE_URL')!,sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const r=await fetch(`${u}/functions/v1/whatsapp-outbound-gate`,{method:'POST',headers:{Authorization:`Bearer ${sk}`,apikey:sk,'Content-Type':'application/json'},body:JSON.stringify({org_id:orgId,conversation_id:conversationId,phone,agent_key:'system',idempotency_key:key,message,format_agent_reply:false})});
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok||d?.allowed===false)throw new Error(d?.error||d?.reason||'Falha no envio pela Z-API');return d;
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({ok:false,error:'Método inválido'},405);
  try{
    const b=await req.json().catch(()=>({}));const ctx=await authContext(req,b);const a=ctx.a;
    const message=String(b.message||'').trim();const targets=Array.isArray(b.targets)?b.targets:[];
    if(!message)return json({ok:false,error:'Mensagem obrigatória'},400);if(!targets.length)return json({ok:false,error:'Selecione ao menos um destinatário'},400);if(targets.length>200)return json({ok:false,error:'Limite de 200 destinatários por envio'},400);
    const seen=new Set<string>();const unique=targets.map((x:any)=>({phone:digits(x.phone),conversation_id:x.conversation_id?String(x.conversation_id):null,name:String(x.name||'')})).filter((x:any)=>x.phone&&!seen.has(x.phone)&&(seen.add(x.phone),true));
    const results:any[]=[];
    for(const t of unique){try{
      const d=await sendViaGate(ctx.orgId,t.conversation_id,t.phone,message,`operator:${ctx.orgId}:${t.phone}:${crypto.randomUUID()}`);
      const externalId=String(d?.provider_response?.messageId||d?.provider_response?.id||'')||null;
      if(t.conversation_id){
        await a.from('whatsapp_messages').insert({org_id:ctx.orgId,conversation_id:t.conversation_id,external_message_id:externalId,direction:'outbound',message_type:'text',body:message,status:'sent',sent_at:new Date().toISOString(),metadata:{source:'zapi_operator_send',provider:'zapi',fromMe:true,sender_type:ctx.internal?'system':'human',operator_user_id:ctx.userId}});
        await a.from('whatsapp_conversations').update({last_message_at:new Date().toISOString(),last_message_preview:message,last_human_outbound_at:ctx.internal?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',t.conversation_id).eq('org_id',ctx.orgId);
      }
      results.push({phone:t.phone,name:t.name,ok:true});
    }catch(e){results.push({phone:t.phone,name:t.name,ok:false,error:e instanceof Error?e.message:String(e)})}}
    const sent=results.filter(x=>x.ok).length,failed=results.length-sent;return json({ok:failed===0,provider:'zapi',sent,failed,total:results.length,results});
  }catch(e){const m=e instanceof Error?e.message:String(e);if(m==='UNAUTHORIZED')return json({ok:false,error:'Não autorizado'},401);if(m==='FORBIDDEN')return json({ok:false,error:'Usuário sem acesso ao escritório'},403);if(m==='INTERNAL_ORG_REQUIRED')return json({ok:false,error:'Organização obrigatória para envio interno'},400);return json({ok:false,error:m},500)}
});

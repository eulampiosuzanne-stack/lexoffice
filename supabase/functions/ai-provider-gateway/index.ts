import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const admin=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});

async function resolveOrg(requested:string){
  if(requested)return requested;
  try{
    const {data}=await admin().from('ai_agent_policies').select('org_id').eq('active',true).contains('allowed_channels',['whatsapp']).limit(1).maybeSingle();
    return String(data?.org_id||'');
  }catch{return''}
}
async function vaultKey(orgId:string,provider:string){
  try{
    if(!orgId)return'';
    const {data}=await admin().rpc('read_integration_secret',{p_org_id:orgId,p_provider:provider});
    return String(data||'').trim();
  }catch{return''}
}
async function loadAgentPolicy(orgId:string,agentKey:string){
  if(!orgId||!agentKey)return null;
  try{
    const {data}=await admin().from('ai_agent_policies')
      .select('provider,model,system_prompt,policy,active')
      .eq('org_id',orgId).eq('agent_key',agentKey).maybeSingle();
    return data||null;
  }catch{return null}
}

async function gemini(key:string,sys:string,input:string,model:string,temperature:number,maxTokens:number){
  if(!key)return{ok:false,error:'gemini_key_missing'};
  const preferred=model?.startsWith('gemini-')?model:(Deno.env.get('GEMINI_MODEL')||'gemini-3.7-flash');
  const candidates=[...new Set([preferred,'gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite','gemini-2.5-flash','gemini-2.5-flash-lite'])];
  let last:any={ok:false,error:'gemini_unavailable'};
  for(const chosen of candidates){
    try{
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${chosen}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{role:'user',parts:[{text:input}]}],generationConfig:{temperature,maxOutputTokens:maxTokens}})});
      const d=await r.json().catch(()=>null);
      if(r.ok){const text=String(d?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('')||'').trim();if(text)return{ok:true,provider:'gemini',model:chosen,text};last={ok:false,error:'gemini_empty',model:chosen};continue}
      last={ok:false,error:`gemini_${r.status}`,detail:d?.error?.message||null,model:chosen};
      if(![429,500,502,503,504].includes(r.status))break;
    }catch(e){last={ok:false,error:'gemini_network',detail:e instanceof Error?e.message:String(e),model:chosen}}
  }
  return last;
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);

  const body=await req.json().catch(()=>({}));
  const orgId=await resolveOrg(String(body.org_id||'').trim());
  const agentKey=String(body.agent_key||'').trim();
  const policyRow=await loadAgentPolicy(orgId,agentKey);
  if(policyRow&&policyRow.active===false)return json({ok:false,error:'agent_inactive'},403);
  const geminiKey=await vaultKey(orgId,'gemini_api')||(Deno.env.get('GEMINI_API_KEY')||Deno.env.get('GOOGLE_GEMINI_API_KEY')||'').trim();
  if(body.action==='health')return json({ok:Boolean(geminiKey),mode:'gemini_only',gemini_configured:Boolean(geminiKey),providers_ready:Number(Boolean(geminiKey))});
  const p=policyRow?.policy||{};
  const model=String(policyRow?.model||body.model||'');
  const temperature=Math.max(0,Math.min(1,Number(p.temperature ?? body.temperature ?? .25)));
  const maxTokens=Math.max(200,Math.min(4000,Number(p.max_output_tokens ?? body.max_output_tokens ?? 1400)));
  const sys=String(policyRow?.system_prompt||body.instructions||'Você é um agente do LEXOFFICE. Responda em português do Brasil, com clareza e sem inventar informações jurídicas.');
  const input=String(body.input||'');
  if(!input.trim())return json({error:'input_required'},400);
  const result=await gemini(geminiKey,sys,input,model,temperature,maxTokens);
  if(result.ok)return json({ok:true,...result,agent_key:agentKey||null,policy_provider:'gemini',fallback_used:false});
  return json({ok:false,error:'gemini_unavailable',providers:[{error:result.error,detail:result.detail||null}]},503);
});

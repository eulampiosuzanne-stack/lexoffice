import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateGemini, resolveGatewayPrompt } from "./model-request.ts";

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


type Provider = 'gemini'|'anthropic'|'maritaca';
const normalizeProvider=(value:unknown):Provider|null=>{
  const p=String(value||'').toLowerCase().trim();
  if(['anthropic','claude'].includes(p))return 'anthropic';
  if(['maritaca','s5','sabia'].includes(p))return 'maritaca';
  if(['google','gemini'].includes(p))return 'gemini';
  return null;
};
const legalTask=(body:any,agentKey:string)=>/petition|legal|juridic|process_conduction|draft|minuta|peca|revisao/i.test(
  [agentKey,body.task_type,body.purpose].join(' ')
);
async function generateAnthropic(key:string,sys:string,input:string,model:string,temperature:number,maxTokens:number){
  if(!key)return {ok:false,error:'anthropic_key_missing'};
  if(!model||!/^claude-/i.test(model))return {ok:false,error:'anthropic_model_not_configured'};
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',signal:AbortSignal.timeout(42000),
      headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model,max_tokens:maxTokens,temperature,system:sys,messages:[{role:'user',content:input}]})
    });
    const data:any=await res.json().catch(()=>({}));
    if(!res.ok)return {ok:false,error:'anthropic_'+res.status};
    if(data.stop_reason==='max_tokens')return {ok:false,error:'incomplete_output'};
    const text=String((data.content||[]).filter((v:any)=>v.type==='text').map((v:any)=>v.text).join('')).trim();
    return text?{ok:true,provider:'anthropic',model,text,fallback_used:false}:{ok:false,error:'empty_output'};
  }catch{return {ok:false,error:'anthropic_network'};}
}
async function generateMaritaca(key:string,sys:string,input:string,model:string,temperature:number,maxTokens:number){
  if(!key)return {ok:false,error:'maritaca_key_missing'};
  if(!model)return {ok:false,error:'maritaca_model_not_configured'};
  try{
    const res=await fetch('https://chat.maritaca.ai/api/chat/completions',{
      method:'POST',signal:AbortSignal.timeout(42000),
      headers:{'content-type':'application/json','authorization':'Key '+key},
      body:JSON.stringify({model,temperature,max_tokens:maxTokens,messages:[{role:'system',content:sys},{role:'user',content:input}]})
    });
    const data:any=await res.json().catch(()=>({}));
    if(!res.ok)return {ok:false,error:'maritaca_'+res.status};
    const choice=data.choices?.[0];
    if(choice?.finish_reason==='length')return {ok:false,error:'incomplete_output'};
    const text=String(choice?.message?.content||'').trim();
    return text?{ok:true,provider:'maritaca',model,text,fallback_used:false}:{ok:false,error:'empty_output'};
  }catch{return {ok:false,error:'maritaca_network'};}
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
  const anthropicKey=await vaultKey(orgId,'anthropic_api')||(Deno.env.get('ANTHROPIC_API_KEY')||'').trim();
  const maritacaKey=await vaultKey(orgId,'maritaca_api')||(Deno.env.get('MARITACA_API_KEY')||'').trim();
  if(body.action==='health')return json({ok:Boolean(geminiKey||anthropicKey||maritacaKey),mode:'policy_routing',gemini_configured:Boolean(geminiKey),anthropic_configured:Boolean(anthropicKey),maritaca_configured:Boolean(maritacaKey),providers_ready:[geminiKey,anthropicKey,maritacaKey].filter(Boolean).length});
  const p=policyRow?.policy||{};
  const model=String(policyRow?.model||body.model||'');
  const temperature=Math.max(0,Math.min(1,Number(p.temperature ?? body.temperature ?? .25)));
  const maxTokens=Math.max(200,Math.min(4000,Number(p.max_output_tokens ?? body.max_output_tokens ?? 1400)));
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const trustedInternal=!!serviceKey&&((req.headers.get('authorization')||'')==='Bearer '+serviceKey||req.headers.get('apikey')===serviceKey);
  const sys=resolveGatewayPrompt(policyRow?.system_prompt,body.instructions,trustedInternal);
  const input=String(body.input||'');
  if(!input.trim())return json({error:'input_required'},400);
  // A política persistida define o provedor. Chamadas externas não podem sobrescrevê-la.
  // Minutas e tarefas jurídicas jamais recebem fallback silencioso de provedor.
  const legal=legalTask(body,agentKey);
  const configured=normalizeProvider(policyRow?.provider);
  const provider:Provider=configured||(legal?'anthropic':'gemini');
  if(legal&&provider!=='anthropic')return json({ok:false,error:'legal_provider_requires_review',review_required:true},422);
  const chosenModel=provider==='gemini'?model:configured?String(policyRow?.model||''):'';
  const result=provider==='anthropic'
    ?await generateAnthropic(anthropicKey,sys,input,chosenModel,temperature,maxTokens)
    :provider==='maritaca'
      ?await generateMaritaca(maritacaKey,sys,input,chosenModel,temperature,maxTokens)
      :await generateGemini(geminiKey,sys,input,chosenModel,temperature,maxTokens);
  if(result.ok)return json({ok:true,...result,agent_key:agentKey||null,policy_provider:provider,review_required:legal,approved_for_filing:false});
  return json({ok:false,error:'provider_unavailable',provider,review_required:legal,approved_for_filing:false,providers:[{error:result.error}]},503);
});

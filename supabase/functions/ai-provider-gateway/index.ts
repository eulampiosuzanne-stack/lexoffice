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

async function openai(key:string,sys:string,input:string,model:string,temperature:number,maxTokens:number){
  if(!key)return{ok:false,error:'openai_key_missing'};
  const chosen=model?.startsWith('gpt-')?model:(Deno.env.get('OPENAI_MODEL')||'gpt-5-mini');
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:chosen,instructions:sys,input,max_output_tokens:maxTokens,temperature})});
    const d=await r.json().catch(()=>null);
    if(!r.ok)return{ok:false,error:`openai_${r.status}`,detail:d?.error?.message||null};
    const text=String(d?.output_text||d?.output?.flatMap((x:any)=>x.content||[]).map((x:any)=>x.text||'').join('')||'').trim();
    return text?{ok:true,provider:'openai',model:chosen,text}:{ok:false,error:'openai_empty'};
  }catch(e){return{ok:false,error:'openai_network',detail:e instanceof Error?e.message:String(e)}}
}
async function gemini(key:string,sys:string,input:string,model:string,temperature:number,maxTokens:number){
  if(!key)return{ok:false,error:'gemini_key_missing'};
  const chosen=model?.startsWith('gemini-')?model:(Deno.env.get('GEMINI_MODEL')||'gemini-2.5-flash');
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${chosen}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{role:'user',parts:[{text:input}]}],generationConfig:{temperature,maxOutputTokens:maxTokens}})});
    const d=await r.json().catch(()=>null);
    if(!r.ok)return{ok:false,error:`gemini_${r.status}`,detail:d?.error?.message||null};
    const text=String(d?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('')||'').trim();
    return text?{ok:true,provider:'gemini',model:chosen,text}:{ok:false,error:'gemini_empty'};
  }catch(e){return{ok:false,error:'gemini_network',detail:e instanceof Error?e.message:String(e)}}
}
async function compat(name:string,key:string,url:string,model:string,sys:string,input:string,temperature:number,maxTokens:number){
  if(!key)return{ok:false,error:`${name}_key_missing`};
  try{
    const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(name==='openrouter'?{'HTTP-Referer':'https://lexoffice-ashy.vercel.app','X-Title':'LEXOFFICE'}:{})},body:JSON.stringify({model,messages:[{role:'system',content:sys},{role:'user',content:input}],temperature,max_tokens:maxTokens})});
    const d=await r.json().catch(()=>null);
    if(!r.ok)return{ok:false,error:`${name}_${r.status}`,detail:d?.error?.message||null};
    const text=String(d?.choices?.[0]?.message?.content||'').trim();
    return text?{ok:true,provider:name,model,text}:{ok:false,error:`${name}_empty`};
  }catch(e){return{ok:false,error:`${name}_network`,detail:e instanceof Error?e.message:String(e)}}
}
async function ollama(base:string,sys:string,input:string,model:string,temperature:number){
  if(!base)return{ok:false,error:'ollama_url_missing'};
  const chosen=model||Deno.env.get('OLLAMA_MODEL')||'llama3.2:3b';
  try{
    const r=await fetch(`${base.replace(/\/$/,'')}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:chosen,stream:false,options:{temperature},messages:[{role:'system',content:sys},{role:'user',content:input}]})});
    const d=await r.json().catch(()=>null);
    if(!r.ok)return{ok:false,error:`ollama_${r.status}`};
    const text=String(d?.message?.content||'').trim();
    return text?{ok:true,provider:'ollama',model:chosen,text}:{ok:false,error:'ollama_empty'};
  }catch(e){return{ok:false,error:'ollama_network',detail:e instanceof Error?e.message:String(e)}}
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);

  const body=await req.json().catch(()=>({}));
  const orgId=await resolveOrg(String(body.org_id||'').trim());
  const agentKey=String(body.agent_key||'').trim();
  const policyRow=await loadAgentPolicy(orgId,agentKey);
  if(policyRow&&policyRow.active===false)return json({ok:false,error:'agent_inactive'},403);

  const [voai,vge,vg,vor,vol]=await Promise.all([
    vaultKey(orgId,'openai_api'),vaultKey(orgId,'gemini_api'),vaultKey(orgId,'groq_api'),vaultKey(orgId,'openrouter_api'),vaultKey(orgId,'ollama_base_url')
  ]);
  const keys={
    openai:voai||(Deno.env.get('OPENAI_API_KEY')||'').trim(),
    gemini:vge||(Deno.env.get('GEMINI_API_KEY')||Deno.env.get('GOOGLE_GEMINI_API_KEY')||'').trim(),
    groq:(Deno.env.get('GROQ_API_KEY')||'').trim()||vg,
    openrouter:vor||(Deno.env.get('OPENROUTER_API_KEY')||'').trim(),
    ollama:vol||(Deno.env.get('OLLAMA_BASE_URL')||'').trim()
  };

  if(body.action==='health')return json({ok:Object.values(keys).some(Boolean),mode:'policy_driven',groq_configured:Boolean(keys.groq),gemini_configured:Boolean(keys.gemini),openrouter_configured:Boolean(keys.openrouter),ollama_configured:Boolean(keys.ollama),openai_configured:Boolean(keys.openai),providers_ready:Object.values(keys).filter(Boolean).length});

  const p=policyRow?.policy||{};
  const provider=String(policyRow?.provider||body.provider||'auto').toLowerCase();
  const model=String(policyRow?.model||body.model||'');
  const temperature=Math.max(0,Math.min(1,Number(p.temperature ?? body.temperature ?? .25)));
  const maxTokens=Math.max(200,Math.min(4000,Number(p.max_output_tokens ?? body.max_output_tokens ?? 1400)));
  const fallbackEnabled=Boolean(p.fallback_enabled ?? (provider==='auto'));
  const fallbackProvider=String(p.fallback_provider||'').toLowerCase();
  const sys=String(policyRow?.system_prompt||body.instructions||'Você é um agente do LEXOFFICE. Responda em português do Brasil, com clareza, cordialidade e objetividade. Nunca invente dados jurídicos, prazos, processos, valores ou compromissos. Se faltar informação essencial, peça-a ou encaminhe para atendimento humano.');
  const input=String(body.input||'');
  if(!input.trim())return json({error:'input_required'},400);

  const valid=['groq','gemini','openrouter','ollama','openai'];
  let order:string[]=[];
  if(provider==='auto')order=['groq','gemini','openrouter','ollama','openai'];
  else if(valid.includes(provider)){
    order=[provider];
    if(fallbackEnabled&&fallbackProvider&&valid.includes(fallbackProvider)&&fallbackProvider!==provider)order.push(fallbackProvider);
  }else return json({ok:false,error:'invalid_provider_policy',provider},400);

  const errors:any[]=[];
  for(const selected of order){
    let r:any;
    if(selected==='groq')r=await compat('groq',keys.groq,'https://api.groq.com/openai/v1/chat/completions',model||Deno.env.get('GROQ_MODEL')||'openai/gpt-oss-20b',sys,input,temperature,maxTokens);
    else if(selected==='gemini')r=await gemini(keys.gemini,sys,input,model,temperature,maxTokens);
    else if(selected==='openrouter')r=await compat('openrouter',keys.openrouter,'https://openrouter.ai/api/v1/chat/completions',model||Deno.env.get('OPENROUTER_MODEL')||'openrouter/free',sys,input,temperature,maxTokens);
    else if(selected==='ollama')r=await ollama(keys.ollama,sys,input,model,temperature);
    else r=await openai(keys.openai,sys,input,model,temperature,maxTokens);
    if(r.ok)return json({ok:true,...r,agent_key:agentKey||null,policy_provider:provider,policy_model:model||null,temperature,max_output_tokens:maxTokens,fallback_used:selected!==provider&&provider!=='auto'});
    errors.push(r);
  }

  return json({ok:false,error:'all_allowed_providers_failed',agent_key:agentKey||null,policy_provider:provider,fallback_enabled:fallbackEnabled,providers:errors.map(x=>({error:x.error,detail:x.detail||null}))},503);
});

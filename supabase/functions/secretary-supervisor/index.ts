import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import { handleDonnaDailyBrief } from "./donna-daily-brief.ts";
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{
  if(req.method!=='POST') return J({ok:false},405);
  // Rota aditiva do briefing da Donna. O fluxo existente de supervisão permanece abaixo.
  if(req.headers.has("x-donna-token")) return handleDonnaDailyBrief(req);
  try{
    const sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if((req.headers.get('authorization')||'')!==`Bearer ${sk}`) return J({ok:false},401);
    const b=await req.json().catch(()=>({})),org=String(b.org_id||'');
    if(!org) return J({ok:false,error:'org_id obrigatório'},400);
    const db=createClient(Deno.env.get('SUPABASE_URL')!,sk,{auth:{persistSession:false}});
    const {data:run}=await db.from('secretary_supervision_runs').insert({org_id:org,status:'running'}).select('id').single();
    const issues:any[]=[];const actions:any[]=[];const now=Date.now();
    const {data:convs}=await db.from('whatsapp_conversations').select('id,conversation_owner,bot_ativo,last_human_outbound_at,human_takeover_at,updated_at').eq('org_id',org).neq('status','closed').limit(1000);
    for(const v of convs||[]){if(v.conversation_owner==='HUMAN'&&v.bot_ativo===true)issues.push({type:'human_bot_conflict',conversation_id:v.id});}
    const {data:controls}=await db.from('ai_conversation_controls').select('id,contact_key,human_takeover,ai_enabled,resume_at').eq('org_id',org).limit(1000);
    for(const c of controls||[]){if(c.human_takeover&&c.ai_enabled)issues.push({type:'takeover_ai_conflict',contact_key:c.contact_key});if(c.human_takeover&&c.resume_at&&new Date(c.resume_at).getTime()<=now){await db.from('ai_conversation_controls').update({human_takeover:false,ai_enabled:true,resume_at:null,updated_at:new Date().toISOString()}).eq('id',c.id);actions.push({type:'resume_ai',contact_key:c.contact_key});}}
    const {data:cfg}=await db.from('whatsapp_chatbot_flow_config').select('enabled,version').eq('org_id',org).maybeSingle();
    const checks={open_conversations:(convs||[]).length,controls:(controls||[]).length,chatbot_enabled:cfg?.enabled??null,chatbot_version:cfg?.version??null};
    if(run?.id) await db.from('secretary_supervision_runs').update({finished_at:new Date().toISOString(),status:issues.length?'attention':'ok',checks,issues,actions,requires_human_approval:issues.some(x=>x.type==='human_bot_conflict')}).eq('id',run.id);
    return J({ok:true,run_id:run?.id,checks,issues,actions});
  }catch(e){return J({ok:false,error:e instanceof Error?e.message:String(e)},500);}
});

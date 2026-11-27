import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { EVENT_TYPES, eligible, hoursFor, dueHours, phoneFromDescription, reminderText } from "./reminder.mjs";
// v10 (27/11/2026): lembra também as reuniões marcadas pela Helena (inclusive de quem ainda não é cliente), com link;
// envia os lembretes "pending" criados pelo app; fora do horário comercial o aviso espera em vez de ser descartado.
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
function admin(){return createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})}
async function orgIds(a:any){const forced=(Deno.env.get('LEXOFFICE_ORG_ID')||'').trim();if(forced)return[forced];const ids=new Set<string>();const {data}=await a.from('integration_connections').select('org_id').eq('provider','whatsapp').eq('status','connected');for(const r of data||[])ids.add(r.org_id);const {data:evo}=await a.from('whatsapp_evolution_instances').select('org_id').eq('status','connected').eq('is_active',true);for(const r of evo||[])ids.add(r.org_id);return [...ids]}
async function sendViaGate(o:string,cvId:string|null,raw:string,agentKey:string,key:string,message:string){const u=Deno.env.get('SUPABASE_URL')!,sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const r=await fetch(u+'/functions/v1/whatsapp-outbound-gate',{method:'POST',headers:{Authorization:'Bearer '+sk,apikey:sk,'Content-Type':'application/json'},body:JSON.stringify({org_id:o,conversation_id:cvId,chat_id:raw,agent_key:agentKey,idempotency_key:key,message})});const d=await r.json().catch(()=>null);if(!r.ok&&!d?.retryable)throw new Error(d?.error||'gate_failed');return d}
Deno.serve(async(req)=>{
  try{
    const a=admin();
    const {data:secretRow}=await a.from('system_runtime_secrets').select('secret').eq('key','datajud_sync_token').maybeSingle();
    const token=String(secretRow?.secret||'');
    if(!token||req.headers.get('x-sync-token')!==token)return J({error:'unauthorized'},401);
    const ids=await orgIds(a);
    const nowMs=Date.now();
    let processedEvents=0,sent=0,deferred=0;const errors:any[]=[];
    for(const o of ids){
      const {data:settings}=await a.from('whatsapp_settings').select('agenda_reminder_hours,agenda_enabled').eq('org_id',o).maybeSingle();
      if(settings?.agenda_enabled===false)continue;
      const rawHours=(Array.isArray(settings?.agenda_reminder_hours)&&settings.agenda_reminder_hours.length)?settings.agenda_reminder_hours:[24,3];
      const hoursList=rawHours.map((h:any)=>Number(h)).filter((h:number)=>Number.isFinite(h)&&h>0);
      if(!hoursList.length)continue;
      const horizonIso=new Date(nowMs+Math.max(...hoursList,168)*3600000).toISOString();
      const {data:events,error:evErr}=await a.from('calendar_events').select('id,org_id,client_id,starts_at,created_at,status,event_type,title,description,meeting_url,owner_user_id,ai_agent_policy_id').eq('org_id',o).eq('status','scheduled').in('event_type',EVENT_TYPES).gt('starts_at',new Date(nowMs).toISOString()).lt('starts_at',horizonIso);
      if(evErr)errors.push({org_id:o,error:evErr.message});
      const {data:agentRows}=await a.from('ai_agent_policies').select('id,agent_key,policy').eq('org_id',o).eq('active',true);
      const agents=new Map((agentRows||[]).map((p:any)=>[p.id,p]));
      for(const ev of (events||[])){
        if(!eligible(ev))continue;
        processedEvents++;
        const agent:any=ev.ai_agent_policy_id?agents.get(ev.ai_agent_policy_id):null;
        const minutes=Number(agent?.policy?.appointment_alerts?.minutes_before??NaN);
        const configured=Number.isFinite(minutes)&&minutes>0&&minutes<=10080?[minutes/60]:hoursList;
        const due=dueHours(ev,hoursFor(ev,configured),nowMs);
        for(const h of due){
          const {data:existing}=await a.from('appointment_reminders').select('id,status').eq('event_id',ev.id).eq('hours_before',h).maybeSingle();
          if(existing&&!['blocked','pending'].includes(existing.status))continue;
          const base={org_id:o,event_id:ev.id,client_id:ev.client_id,hours_before:h,scheduled_at:new Date().toISOString(),owner_user_id:ev.owner_user_id};
          // só o aviso mais próximo é enviado (evita mandar o da véspera junto com o de 1 hora)
          if(h!==due[0]){const skip={status:'skipped',error_message:'substituído por lembrete mais próximo do horário'};if(existing)await a.from('appointment_reminders').update(skip).eq('id',existing.id);else await a.from('appointment_reminders').insert({...base,...skip});continue}
          let phoneRaw=phoneFromDescription(ev);
          if(!phoneRaw&&ev.client_id){const {data:client}=await a.from('clients').select('whatsapp,phone').eq('id',ev.client_id).eq('org_id',o).maybeSingle();phoneRaw=String(client?.whatsapp||client?.phone||'').replace(/\D/g,'')}
          if(!phoneRaw){
            const fail={status:'failed',error_message:'sem whatsapp para o lembrete'};
            if(existing)await a.from('appointment_reminders').update(fail).eq('id',existing.id);else await a.from('appointment_reminders').insert({...base,...fail});
            continue;
          }
          const {data:wc}=await a.from('whatsapp_contacts').select('id').eq('org_id',o).eq('phone',phoneRaw).limit(1).maybeSingle();
          let conversationId:string|null=null;
          if(wc?.id){const {data:conv}=await a.from('whatsapp_conversations').select('id').eq('org_id',o).eq('contact_id',wc.id).neq('status','closed').order('updated_at',{ascending:false}).limit(1).maybeSingle();conversationId=conv?.id||null}
          const msg=reminderText(ev,nowMs);
          let rowId=existing?.id;
          if(!rowId){const {data:inserted,error:insErr}=await a.from('appointment_reminders').insert({...base,message:msg,status:'pending'}).select('id').single();if(insErr){errors.push({event_id:ev.id,hours_before:h,error:insErr.message});continue}rowId=inserted!.id}
          else await a.from('appointment_reminders').update({message:msg}).eq('id',rowId);
          try{
            const d=await sendViaGate(o,conversationId,phoneRaw,'appointment_reminder','reminder:'+ev.id+':'+h,msg);
            if(d?.allowed===true||d?.duplicate===true){await a.from('appointment_reminders').update({status:'sent',sent_at:new Date().toISOString(),error_message:null}).eq('id',rowId);sent++}
            else{await a.from('appointment_reminders').update({status:'blocked',error_message:'bloqueado pelo gateway: '+String(d?.reason||'')}).eq('id',rowId);deferred++}
          }catch(e){
            const msgErr=e instanceof Error?e.message:String(e);
            await a.from('appointment_reminders').update({status:'failed',error_message:msgErr}).eq('id',rowId);
            errors.push({event_id:ev.id,hours_before:h,error:msgErr});
          }
        }
      }
    }
    return J({ok:true,version:10,orgs:ids.length,events_checked:processedEvents,sent,deferred,errors});
  }catch(e){
    console.error('appointment-reminder-worker',e);
    return J({error:e instanceof Error?e.message:String(e)},500);
  }
});

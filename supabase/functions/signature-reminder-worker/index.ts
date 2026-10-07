import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json'}});
function db(){return createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})}
async function secretVal(a:any,key:string){const {data}=await a.from('system_runtime_secrets').select('secret').eq('key',key).maybeSingle();return String(data?.secret||'').trim()}

// Cadência de cobrança automática de assinatura, em horas desde o envio (sent_at).
// reminder_count 0 -> dispara o 1º lembrete quando passarem THRESHOLDS[0] horas; e assim por diante.
// Depois de THRESHOLDS.length lembretes, para de cobrar (nunca cobra infinitamente).
const THRESHOLDS_HOURS=[24,48,72];
const MIN_HOURS_BETWEEN_REMINDERS=20; // trava de segurança contra duplicidade

async function send(orgId:string,phone:string,text:string,idempotencyKey:string,agentKey='billing'){
  const u=Deno.env.get('SUPABASE_URL')!,sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r=await fetch(u+'/functions/v1/whatsapp-outbound-gate',{method:'POST',headers:{Authorization:'Bearer '+sk,apikey:sk,'Content-Type':'application/json'},body:JSON.stringify({org_id:orgId,phone,message:text,idempotency_key:idempotencyKey,agent_key:agentKey})});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(d?.error||'Outbound gate indisponível');
  if(!d?.allowed&&!d?.duplicate)throw new Error('OUTBOUND_BLOCKED:'+String(d?.reason||'blocked'));
  return d;
}

function reminderMessage(clientFirstName:string,signUrl:string){
  return `Olá${clientFirstName?', '+clientFirstName:''}! Seu documento ainda está aguardando assinatura. Segue novamente o link: ${signUrl}`;
}

// ===== Lembrete de preenchimento da ficha cadastral (client_intake_links) =====
// Só cobra links enviados pelo WhatsApp, não preenchidos, não revogados e no prazo. Para sozinho quando o cliente preenche.
const INTAKE_THRESHOLDS_HOURS=[24,72];
function inBusinessHours(now:Date){const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',hour12:false}).formatToParts(now);const wd=p.find(x=>x.type==='weekday')?.value||'';const h=Number(p.find(x=>x.type==='hour')?.value||'0')%24;return !['Sat','Sun'].includes(wd)&&h>=9&&h<18}
const dataBR=(iso:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'}).format(new Date(iso));
function intakeMessage(first:string,url:string,expiresAt:string,last:boolean){return [`Olá${first?', '+first:''}!`,last?'Sua ficha cadastral ainda não foi preenchida e o link vence em breve.':'Passando para lembrar de preencher sua ficha cadastral.',`É rápido e pode ser feito pelo celular: ${url}`,`O link é individual e vale até ${dataBR(expiresAt)}.`].join('\n\n')}
async function intakeReminders(a:any,now:Date,force=false){
  const nowIso=now.toISOString();const out={sent:0,skipped:0,errors:0,checked:0,details:[] as unknown[]};
  if(!force&&!inBusinessHours(now))return {...out,reason:'fora_do_horario'};
  const {data:rows,error}=await a.from('client_intake_links').select('id,org_id,client_id,recipient_phone,recipient_name,link_url,sent_at,expires_at,reminder_count,last_reminder_at').is('used_at',null).is('revoked_at',null).eq('reminders_enabled',true).not('sent_at','is',null).not('recipient_phone','is',null).not('link_url','is',null).gt('expires_at',nowIso).lt('reminder_count',INTAKE_THRESHOLDS_HOURS.length).limit(200);
  if(error)throw error;out.checked=rows?.length||0;
  for(const r of rows||[]){try{
    const count=r.reminder_count||0;const hSent=(now.getTime()-new Date(r.sent_at).getTime())/3600000;const hLeft=(new Date(r.expires_at).getTime()-now.getTime())/3600000;
    if(hSent<INTAKE_THRESHOLDS_HOURS[count]||hLeft<2){out.skipped++;continue}
    if(r.last_reminder_at&&(now.getTime()-new Date(r.last_reminder_at).getTime())/3600000<20){out.skipped++;continue}
    let name=r.recipient_name||'';if(r.client_id){const {data:c}=await a.from('clients').select('name').eq('id',r.client_id).maybeSingle();if(c?.name)name=c.name}
    const f=(name||'').trim().split(/\s+/)[0]||'';const first=f?f.charAt(0).toUpperCase()+f.slice(1).toLowerCase():'';
    const resp=await send(r.org_id,r.recipient_phone,intakeMessage(first,r.link_url,r.expires_at,count+1===INTAKE_THRESHOLDS_HOURS.length),`client_intake_reminder:${r.id}:${count+1}`,'client_schedule_relationship');
    await a.from('client_intake_links').update({reminder_count:count+1,last_reminder_at:nowIso}).eq('id',r.id).eq('reminder_count',count);
    out.sent++;out.details.push({id:r.id,reminder:count+1,duplicate:!!resp?.duplicate});
  }catch(e){out.errors++;console.error('intake reminder',r.id,e instanceof Error?e.message:e);out.details.push({id:r.id,error:e instanceof Error?e.message:String(e)})}}
  return out;
}

Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({ok:false,error:'Método inválido'},405);
  try{
    const a=db();
    const expected=await secretVal(a,'datajud_sync_token');
    const provided=req.headers.get('x-sync-token')||'';
    if(expected && provided!==expected) return json({ok:false,error:'unauthorized'},401);

    const now=new Date();
    const nowIso=now.toISOString();

    // Expira solicitações vencidas que ainda não foram assinadas (nunca cobra documento expirado/assinado/recusado).
    const {data:toExpire}=await a.from('signature_requests').select('id').in('status',['sent','viewed']).not('expires_at','is',null).lt('expires_at',nowIso).limit(200);
    if(toExpire?.length){
      await a.from('signature_requests').update({status:'expired',updated_at:nowIso}).in('id',toExpire.map((r:any)=>r.id));
    }

    // Candidatos a lembrete: enviados/visualizados, ainda dentro do prazo (ou sem prazo), com sign_url disponível.
    const {data:rows,error}=await a.from('signature_requests')
      .select('id,org_id,client_id,signer_name,signer_phone,signing_url,sent_at,last_reminder_at,reminder_count,expires_at,status')
      .in('status',['sent','viewed'])
      .not('sent_at','is',null)
      .lt('reminder_count',THRESHOLDS_HOURS.length)
      .limit(200);
    if(error)throw error;

    let sent=0, skipped=0, errors=0;
    for(const r of rows||[]){
      try{
        const hoursSinceSent=(now.getTime()-new Date(r.sent_at).getTime())/3600000;
        const threshold=THRESHOLDS_HOURS[r.reminder_count||0];
        if(hoursSinceSent<threshold){skipped++;continue}
        if(r.last_reminder_at){
          const hoursSinceLast=(now.getTime()-new Date(r.last_reminder_at).getTime())/3600000;
          if(hoursSinceLast<MIN_HOURS_BETWEEN_REMINDERS){skipped++;continue}
        }
        let phone=r.signer_phone||'';
        let clientName=r.signer_name||'';
        if(!phone && r.client_id){
          const {data:c}=await a.from('clients').select('name,phone,whatsapp').eq('id',r.client_id).maybeSingle();
          if(c){phone=c.whatsapp||c.phone||'';clientName=c.name||clientName}
        }
        if(!phone){
          const {data:s}=await a.from('signature_signers').select('name,phone').eq('signature_request_id',r.id).order('signing_order').limit(1).maybeSingle();
          if(s){phone=s.phone||'';clientName=s.name||clientName}
        }
        if(!phone || !r.signing_url){
          // Nunca envia mensagem falsa: sem telefone ou sem link real de assinatura, não dispara.
          await a.from('signature_reminders').insert({org_id:r.org_id,signature_request_id:r.id,client_id:r.client_id||null,channel:'whatsapp',message:'',status:'skipped',error:!phone?'sem_telefone':'sem_sign_url',trigger:'automatic'});
          skipped++; continue;
        }
        const first=(clientName||'').trim().split(/\s+/)[0]||'';
        const message=reminderMessage(first,r.signing_url);
        const idempotencyKey=`signature_reminder:${r.id}:${(r.reminder_count||0)+1}`;
        try{
          const resp=await send(r.org_id,phone,message,idempotencyKey);
          await a.from('signature_reminders').insert({org_id:r.org_id,signature_request_id:r.id,client_id:r.client_id||null,channel:'whatsapp',message,sent_at:nowIso,status:resp?.allowed?'sent':'blocked',provider_message_id:String(resp?.provider_response?.id||resp?.provider_response?.key?.id||''),trigger:'automatic'});
          if(resp?.allowed){
            await a.from('signature_requests').update({last_reminder_at:nowIso,reminder_count:(r.reminder_count||0)+1,updated_at:nowIso}).eq('id',r.id);
            sent++;
          } else {
            skipped++;
          }
        }catch(e:any){
          const msg=e instanceof Error?e.message:String(e);
          await a.from('signature_reminders').insert({org_id:r.org_id,signature_request_id:r.id,client_id:r.client_id||null,channel:'whatsapp',message,status:'failed',error:msg,trigger:'automatic'});
          errors++;
        }
      }catch(e){
        errors++;
        console.error('signature-reminder-worker: erro processando',r.id,e instanceof Error?e.message:e);
      }
    }

    const {data:authDocs}=await a.from('client_document_requests').select('id,org_id,client_id,title,created_at,reminder_last_sent_at').eq('requires_authorization',true).eq('authorization_status','pending').eq('reminder_enabled',true).limit(200);
    let authorizationReminders=0;
    for(const d of authDocs||[]){try{const age=(now.getTime()-new Date(d.created_at).getTime())/3600000;if(age<24)continue;if(d.reminder_last_sent_at&&(now.getTime()-new Date(d.reminder_last_sent_at).getTime())/3600000<24)continue;const {data:cl}=await a.from('clients').select('name,phone,whatsapp').eq('id',d.client_id).maybeSingle();const phone=cl?.whatsapp||cl?.phone||'';if(!phone)continue;const first=String(cl?.name||'').trim().split(/\\s+/)[0]||'';const message='Olá'+(first?', '+first:'')+'! Há um documento aguardando sua autorização na Área do Cliente da Suzanne Figueiredo Advocacia: '+d.title+'. Acesse: https://lexoffice.univittagroup.com.br/cliente';const resp=await send(d.org_id,phone,message,'client_doc_authorization:'+d.id+':'+new Date().toISOString().slice(0,10));if(resp?.allowed||resp?.duplicate){await a.from('client_document_requests').update({reminder_last_sent_at:nowIso,updated_at:nowIso}).eq('id',d.id);authorizationReminders++}}catch(e){console.error('authorization reminder',d.id,e)}}
    let intake:any=null;try{intake=await intakeReminders(a,now)}catch(e){console.error('intake reminders',e);intake={error:e instanceof Error?e.message:String(e)}}
    return json({ok:true,sent,skipped,errors,expired:toExpire?.length||0,checked_at:nowIso ,authorization_reminders:authorizationReminders,intake_reminders:intake});
  }catch(e){
    console.error('signature-reminder-worker',e);
    return json({ok:false,error:e instanceof Error?e.message:String(e)},500);
  }
});

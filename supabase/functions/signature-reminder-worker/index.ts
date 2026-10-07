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

// ===== Resumo por IA dos alertas de vendas e financeiro (pedido da Dra. Suzanne, 07/10/2026) =====
// O alerta nasce com status "summarizing" (gatilho no banco), este trecho gera o resumo e libera para envio (status "pending").
const SUMMARY_AGENTS=['sales','billing'];
async function summarizeAlert(a:any,alertId:string){
  const {data:al}=await a.from('ai_agent_alerts').select('id,org_id,agent_key,contact_phone,client_id,reason,context,status').eq('id',alertId).maybeSingle();
  if(!al||al.status!=='summarizing')return {ok:true,skipped:'not_summarizing'};
  let resumo='';
  try{
    const phone=String(al.contact_phone||'').replace(/\D/g,'');
    let historico='';
    if(phone){
      const {data:cts}=await a.from('whatsapp_contacts').select('id').eq('org_id',al.org_id).eq('phone',phone).limit(3);
      const ids=(cts||[]).map((c:any)=>c.id);
      if(ids.length){
        const {data:cv}=await a.from('whatsapp_conversations').select('id').eq('org_id',al.org_id).in('contact_id',ids).order('updated_at',{ascending:false}).limit(1).maybeSingle();
        if(cv){const {data:ms}=await a.from('whatsapp_messages').select('direction,body,created_at').eq('conversation_id',cv.id).order('created_at',{ascending:false}).limit(12);
          historico=(ms||[]).reverse().map((m:any)=>(m.direction==='inbound'?'Contato: ':'Escritório: ')+String(m.body||'').replace(/\s+/g,' ').slice(0,400)).join('\n');}
      }
    }
    let cliente='';if(al.client_id){const {data:c}=await a.from('clients').select('name').eq('id',al.client_id).maybeSingle();cliente=c?.name?`Cliente cadastrado: ${c.name}`:''}
    const instructions=['Você resume alertas para a Dra. Suzanne Figueiredo (advogada) decidir rápido pelo WhatsApp.','Escreva em português, no máximo 3 frases curtas, sem emoji e sem markdown.','Diga do que se trata e o que o contato quer de verdade, com nome e valores quando houver.','Se a mensagem for propaganda ou oferta de serviço de terceiros (não é cliente nem interessado em serviço jurídico), comece com "Parece propaganda de terceiros:" e sugira ignorar.','Termine com "Sugestão:" e a ação recomendada em poucas palavras.','Não invente nada que não esteja no texto.'].join('\n');
    const input=`Tipo de alerta: ${al.agent_key==='billing'?'financeiro':'vendas'}\nMotivo: ${al.reason}\n${cliente}\nContexto do alerta: ${String(al.context||'').slice(0,1500)}\n\nÚltimas mensagens da conversa:\n${historico||'(sem histórico)'}`;
    const u=Deno.env.get('SUPABASE_URL')!,sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ctl=new AbortController();const tm=setTimeout(()=>ctl.abort(),25000);
    const r=await fetch(u+'/functions/v1/ai-provider-gateway',{method:'POST',signal:ctl.signal,headers:{Authorization:'Bearer '+sk,apikey:sk,'Content-Type':'application/json'},body:JSON.stringify({org_id:al.org_id,agent_key:al.agent_key,purpose:'alert_summary',instructions,input})}).finally(()=>clearTimeout(tm));
    const d=await r.json().catch(()=>null);
    resumo=String(r.ok&&d?.ok?d.text||'':'').replace(/[*#`]/g,'').replace(/\n{3,}/g,'\n\n').trim().slice(0,600);
  }catch(e){console.error('summarizeAlert',alertId,e instanceof Error?e.message:e)}
  const context=resumo?`Resumo: ${resumo}\n\nDetalhes: ${String(al.context||'')}`:String(al.context||'');
  await a.from('ai_agent_alerts').update({context,status:'pending',updated_at:new Date().toISOString()}).eq('id',al.id).eq('status','summarizing');
  return {ok:true,summarized:Boolean(resumo)};
}
// Segurança: alerta que ficou preso aguardando resumo (mais de 5 min) é liberado sem resumo, para nunca deixar de avisar.
async function releaseStuckSummaries(a:any){
  const lim=new Date(Date.now()-5*60000).toISOString();
  const {data}=await a.from('ai_agent_alerts').update({status:'pending',updated_at:new Date().toISOString()}).eq('status','summarizing').lt('created_at',lim).select('id');
  return data?.length||0;
}

Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({ok:false,error:'Método inválido'},405);
  try{
    const a=db();
    const expected=await secretVal(a,'datajud_sync_token');
    const provided=req.headers.get('x-sync-token')||'';
    if(expected && provided!==expected) return json({ok:false,error:'unauthorized'},401);

    const reqBody=await req.clone().json().catch(()=>({}));
    if(reqBody?.action==='summarize_alert'&&reqBody?.alert_id)return json(await summarizeAlert(a,String(reqBody.alert_id)));
    const now=new Date();
    const nowIso=now.toISOString();
    let releasedSummaries=0;try{releasedSummaries=await releaseStuckSummaries(a)}catch(e){console.error('releaseStuckSummaries',e)}

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
    return json({ok:true,sent,skipped,errors,expired:toExpire?.length||0,checked_at:nowIso ,authorization_reminders:authorizationReminders,intake_reminders:intake,released_summaries:releasedSummaries});
  }catch(e){
    console.error('signature-reminder-worker',e);
    return json({ok:false,error:e instanceof Error?e.message:String(e)},500);
  }
});

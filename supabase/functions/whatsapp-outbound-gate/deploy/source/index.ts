import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import { panelTakeover } from "../_shared/panel-takeover.ts";
import {
  formatWhatsAppAgentReply,
  previewForLog,
} from "./_shared/whatsapp-reply-format.mjs";
import { buildTemplatePayload, buildTemplatePayloadV2, buildInteractivePayload, interactiveAsText, interactiveAsMenuText } from "./_shared/meta-template.mjs";
// v116 (21/11/2026) — a voz não lê mais o cabeçalho "Helena | Concierge Jurídica" / "Helena | Secretária".
// v115 (21/11/2026) — pausas do "digitando" e da voz voltam ao padrão do v113 (1,2–4s; até 2,5s).
// v114 (21/11/2026) — pausa do "digitando" e da voz mais curtas (0,8–2,2s e até 1,5s).
// v113 (20/11/2026) — voz também nas respostas do agente de andamentos a quem escreveu agora (só números liberados); preferência aprendida mesmo em resposta citada; nunca fala "não consigo enviar áudio".
// v112 (20/11/2026) — pedido "me mande um áudio" também registra a preferência por áudio.
// v111 (20/11/2026) — "digitando…" curto, voz da Helena (Azure) para quem prefere áudio ("gravando…") e preferência aprendida só quando a pessoa pede.
// v110 (20/11/2026) — leitura de áudio/imagem/PDF (whatsapp-media-intake) só para números liberados.
// v109 (20/11/2026) — resposta a mensagem recente não é barrada pelo horário.
// v108 (20/11/2026) — botão da lista até 24 caracteres ("Opções de atendimento").
// v107 (19/11/2026) — lista com bolinha e descrição pela Uazapi; texto livre da Uazapi segue o mesmo coordenador dos botões.
// v106 (19/11/2026) — UAZAPI com BOTÕES reais (/send/menu): menu do atendimento sai em botões pela Uazapi; resposta de botão entra no mesmo atendimento; uazapi/evolution explícitos vencem o WAHA.
// v105 (19/11/2026) — teste de botões reais pela Evolution (sendButtons) só para os números em evolution_buttons_phones.
// v103 (19/11/2026) — canal de RESPOSTA pela API da Meta (meta_reply_channel=true).
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const digits = (v: any) => String(v ?? "").replace(/\D/g, "");
const OFFICE_ORG = "b3dd3ed0-2a05-4087-8220-307a44352cec";
const AGENT_KEYS = new Set([
  "client_service_triage",
  "client_process_updates",
  "client_schedule_relationship",
  "sales",
  "billing",
  "helena_chatbot",
]);
const DEFAULT_COOLDOWN_MIN = 20;
function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
async function runtimeSecret(a: any, key: string) {
  try {
    const { data } = await a.from("system_runtime_secrets").select("secret").eq("key", key).maybeSingle();
    return String(data?.secret || "").trim();
  } catch {
    return "";
  }
}
async function activeProvider(a: any) {
  const p = (await runtimeSecret(a, "whatsapp_provider")).toLowerCase();
  return p === "waha" ? "waha" : p === "meta" ? "meta" : p === "uazapi" ? "uazapi" : "evolution";
}
async function wahaSend(a: any, orgId: string, conversationId: string | null, target: string, text: string, image: string | null, caption: string | null, document: string | null, fileName: string | null, interactive: any = null, typingSeconds = 0) {
  const configuredUrl = (Deno.env.get("WAHA_API_URL") || "https://lexoffice-waha-production.up.railway.app").trim();
  const apiKey = (Deno.env.get("WAHA_API_KEY") || "").trim();
  if (!configuredUrl || !apiKey) throw new Error("WAHA não configurado no servidor");
  const url = new URL(configuredUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("WAHA requer um endereço HTTPS válido");
  }
  const { data, error } = await a.from("integration_connections")
    .select("settings").eq("org_id", orgId).eq("provider", "whatsapp")
    .eq("status", "connected").filter("settings->>provider", "eq", "waha")
    .filter("settings->>channel_enabled", "eq", "true").maybeSingle();
  const session = data?.settings?.waha_session;
  if (error || typeof session !== "string" || !session.trim()) throw new Error("WAHA: sessão ativa do escritório não identificada");
  const base = url.toString().replace(/\/$/, "");
  const headers = { "X-Api-Key": apiKey, "Content-Type": "application/json" };
  const state = await fetch(base + "/api/sessions/" + encodeURIComponent(session), { headers, redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!state.ok || (await state.json()).status !== "WORKING") throw new Error("WAHA: sessão do escritório indisponível");
  const phone = digits(target);
  if (!target.includes("@") && !phone) throw new Error("WAHA: destino inválido");
  let chatId = target.includes("@") ? target : phone + "@c.us";
  let contactId: string | null = null;
  let storedChatId = "";
  if (conversationId && !target.includes("@")) {
    const { data: conversation } = await a.from("whatsapp_conversations")
      .select("contact_id").eq("org_id", orgId).eq("id", conversationId).maybeSingle();
    contactId = typeof conversation?.contact_id === "string" ? conversation.contact_id : null;
    if (contactId) {
      const { data: contact } = await a.from("whatsapp_contacts").select("whatsapp_id")
        .eq("org_id", orgId).eq("id", contactId).maybeSingle();
      storedChatId = String(contact?.whatsapp_id || "").trim();
    }
  }
  if (!target.includes("@") && /^\d+@lid$/.test(storedChatId)) {
    chatId = storedChatId;
  } else if (!target.includes("@")) {
    const lookupUrl = base + "/api/contacts/check-exists?phone=" + encodeURIComponent(phone) + "&session=" + encodeURIComponent(session);
    const lookup = await fetch(lookupUrl, { headers, redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!lookup.ok) throw new Error("WAHA não conseguiu resolver o contato (HTTP " + lookup.status + ")");
    const resolved = await lookup.json();
    if (resolved?.numberExists !== true || typeof resolved?.chatId !== "string" || !/^\d+@(lid|c\.us)$/.test(resolved.chatId)) {
      throw new Error("WAHA não encontrou um chatId válido para o número");
    }
    chatId = resolved.chatId;
    if (contactId) await a.from("whatsapp_contacts").update({ whatsapp_id: chatId }).eq("org_id", orgId).eq("id", contactId);
  }
  const media = document || image;
  const menu = !media && interactive?.style === "menu" && interactive?.type === "list" && Array.isArray(interactive.rows) && interactive.rows.length > 0;
  if (menu && interactive.prefer !== "text") {
    const cutW = (v: any, n: number) => Array.from(String(v ?? "").trim()).slice(0, n).join("");
    const listBody = { session, chatId, message: {
      title: cutW(interactive.header || "Suzanne Figueiredo Advocacia", 60),
      description: cutW(interactive.body || text, 1024),
      footer: cutW(interactive.footer || "", 60),
      button: cutW(interactive.button || "Ver opções", 20),
      sections: [{ title: cutW(interactive.section || "Opções", 24), rows: interactive.rows.slice(0, 10).map((r: any) => ({ title: cutW(r.title, 24), rowId: cutW(r.id, 200), description: r.description ? cutW(r.description, 72) : null })) }],
    } };
    try {
      const lr = await fetch(base + "/api/sendList", { method: "POST", headers, body: JSON.stringify(listBody), redirect: "error", signal: AbortSignal.timeout(20000) });
      if (lr.ok) {
        const lj = await lr.json().catch(() => null);
        const lid = typeof lj?.id === "string" ? lj.id : lj?.id?._serialized || lj?.key?.id || lj?.message?.id || null;
        if (lid) return { id: String(lid), format: "list" };
      }
      console.error("waha sendList recusado", lr.status, (await lr.text().catch(() => "")).slice(0, 300));
    } catch (e) { console.error("waha sendList erro", e instanceof Error ? e.message : String(e)); }
    text = interactiveAsMenuText(interactive.body || text, interactive);
  } else if (menu) text = interactiveAsMenuText(interactive.body || text, interactive);
  if (!media && typingSeconds > 0) {
    try {
      await fetch(base + "/api/startTyping", { method: "POST", headers, body: JSON.stringify({ session, chatId }), redirect: "error", signal: AbortSignal.timeout(8000) });
      await new Promise((r) => setTimeout(r, Math.min(15, typingSeconds) * 1000));
      await fetch(base + "/api/stopTyping", { method: "POST", headers, body: JSON.stringify({ session, chatId }), redirect: "error", signal: AbortSignal.timeout(8000) });
    } catch (e) { console.error("waha typing", e instanceof Error ? e.message : String(e)); }
  }
  const voice = document?.match(/^data:audio\/ogg;base64,([A-Za-z0-9+/]+={0,2})$/);
  const endpoint = voice ? "sendVoice" : document ? "sendFile" : image ? "sendImage" : "sendText";
  const body = voice ? { session, chatId, convert: false,
    file: { mimetype: "audio/ogg; codecs=opus", filename: fileName || "voz.ogg", data: voice[1] },
  } : media ? { session, chatId, caption: caption || text,
    file: { url: media, ...(fileName ? { filename: fileName } : {}) }
  } : { session, chatId, text };
  if (media && !voice && !media.startsWith("https://")) throw new Error("WAHA: mídia exige URL HTTPS");
  const response = await fetch(base + "/api/" + endpoint, {
    method: "POST", headers, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("WAHA recusou o envio (HTTP " + response.status + ")");
  const result = await response.json();
  const id = typeof result?.id === "string" ? result.id : result?.id?._serialized;
  if (!id) throw new Error("WAHA: resposta sem identificador de mensagem");
  return menu ? { id, format: "menu_text" } : { id };
}

async function metaWindow(a: any, orgId: string, conversationId: string | null, target: string) {
  const p = digits(target), since = new Date(Date.now() - 23.5 * 3600000).toISOString();
  let name = "";
  const convIds: string[] = [];
  if (conversationId) convIds.push(conversationId);
  try {
    const variants = [...new Set([p, p.startsWith("55") ? p.slice(2) : "55" + p])];
    const { data: cts } = await a.from("whatsapp_contacts").select("id,name,client_id").eq("org_id", orgId).in("phone", variants).limit(5);
    for (const ct of cts || []) {
      if (!name && ct.name) name = String(ct.name);
      const { data: cvs } = await a.from("whatsapp_conversations").select("id").eq("org_id", orgId).eq("contact_id", ct.id).limit(10);
      for (const cv of cvs || []) convIds.push(cv.id);
      if (!name && ct.client_id) { const { data: cl } = await a.from("clients").select("name").eq("id", ct.client_id).maybeSingle(); if (cl?.name) name = String(cl.name); }
    }
    if (!name) { const { data: cl } = await a.from("clients").select("name").eq("org_id", orgId).or(`whatsapp.ilike.%${p.slice(-8)}%,phone.ilike.%${p.slice(-8)}%`).limit(1).maybeSingle(); if (cl?.name) name = String(cl.name); }
    if (!convIds.length) return { open: false, name };
    const { count } = await a.from("whatsapp_messages").select("id", { count: "exact", head: true }).in("conversation_id", [...new Set(convIds)]).eq("direction", "inbound").gte("created_at", since);
    return { open: (count || 0) > 0, name };
  } catch (e) {
    console.error("metaWindow", e);
    return { open: false, name };
  }
}
const GRAPH = "https://graph.facebook.com/v21.0";
function dataUriParts(v: string) {
  const m = String(v || "").match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s);
  return m ? { mime: m[1], b64: m[2] } : null;
}
async function metaUpload(token: string, phoneId: string, mime: string, b64: string, name: string) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", mime);
  fd.append("file", new Blob([bin], { type: mime }), name);
  const r = await fetch(`${GRAPH}/${phoneId}/media`, { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd, signal: AbortSignal.timeout(30000) });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d?.id) throw new Error("Meta upload " + r.status + ": " + String(d?.error?.message || "falha").slice(0, 200));
  return String(d.id);
}
async function metaSend(a:any,orgId:string,phone:string,message:string,image:string|null=null,caption:string|null=null,document:string|null=null,fileName:string|null=null,template:{name:string}|null=null,interactive:any=null){
  if(orgId!==OFFICE_ORG)throw new Error("Provedor Meta não autorizado nesta organização");
  const token=await runtimeSecret(a,"meta_system_user_token"),phoneId=await runtimeSecret(a,"meta_whatsapp_phone_number_id"),p=digits(phone);
  if(!token||!phoneId||!/^\d{10,15}$/.test(p))throw new Error("Meta não configurada ou número inválido");
  let payload:any,payloadOld:any=null;
  const media=document||image;
  if(template&&!media){
    payloadOld=buildTemplatePayload(p,template.name,message);
    payload=buildTemplatePayloadV2(p,template.name,message)||payloadOld;
  } else if(media){
    const du=dataUriParts(media);
    const isAudio=Boolean(document&&du&&/^audio\//i.test(du.mime));
    const kind=isAudio?"audio":document?"document":"image";
    const ref:any=du?{id:await metaUpload(token,phoneId,du.mime,du.b64,fileName||(isAudio?"audio.ogg":document?"documento.pdf":"imagem.jpg"))}:/^https:\/\//.test(media)?{link:media}:null;
    if(!ref)throw new Error("Mídia inválida para a Meta");
    const cap=String(caption||message||"").slice(0,1024);
    if(cap&&!isAudio)ref.caption=cap;
    if(document&&!isAudio)ref.filename=fileName||"documento.pdf";
    payload={to:p,type:kind,[kind]:ref};
  } else payload=(interactive?buildInteractivePayload(p,message,interactive):null)||{to:p,type:"text",text:{body:String(message).slice(0,4096),preview_url:/https?:\/\//.test(message)}};
  const post=(pl:any)=>fetch(`${GRAPH}/${phoneId}/messages`,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",...pl}),signal:AbortSignal.timeout(30000)});
  let r=await post(payload);
  let d:any=await r.json().catch(()=>({}));
  if(!r.ok&&payloadOld&&payload!==payloadOld&&/^132\d{3}$/.test(String(d?.error?.code||""))){console.error("meta_template_v2_fallback",String(d?.error?.code||""));r=await post(payloadOld);d=await r.json().catch(()=>({}));}
  if(!r.ok){const e:any=new Error("Meta "+r.status+" ("+String(d?.error?.code||"")+"): "+String(d?.error?.error_data?.details||d?.error?.message||"falha").slice(0,240));e.metaCode=Number(d?.error?.code||0);throw e;}
  return {...d,messageid:String(d?.messages?.[0]?.id||""),template_used:Boolean(template&&!media)};
}
async function uazapiSend(a:any,orgId:string,phone:string,message:string,delaySeconds=0,image:string|null=null,caption:string|null=null,document:string|null=null,fileName:string|null=null){
 if(orgId!==OFFICE_ORG)throw new Error("Provedor Uazapi não autorizado nesta organização");
 const base=(await runtimeSecret(a,"uazapi_base_url")).replace(/\/+$/,"");
 const token=await runtimeSecret(a,"uazapi_instance_token");
 const p=digits(phone);
 if(!/^https:\/\//.test(base)||!token||!p)throw new Error("Uazapi não configurada ou número inválido");
 const media=document||image;
 const endpoint=media?"/send/media":"/send/text";
 const payload:any=document
   ?{number:p,type:"document",file:document,docName:fileName||"documento.pdf",text:caption||message||""}
   :image
     ?{number:p,type:"image",file:image,text:caption||message||""}
     :{number:p,text:message};
 const delayMs=Math.max(0,Math.min(15000,Math.round(Number(delaySeconds)||0)*1000));
 if(delayMs>0)payload.delay=delayMs;
 const response=await fetch(base+endpoint,{method:"POST",headers:{token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
 const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{data={raw:raw.slice(0,240)}}
 if(!response.ok)throw new Error("Uazapi "+response.status+": "+String(data?.message||data?.error||raw||"falha").slice(0,280));
 return data;
}
async function uazapiSendMenu(a:any,orgId:string,phone:string,interactive:any,message:string,delaySeconds=0){
 // v106: menu/botões reais pela Uazapi (/send/menu type button). Devolve null se não der (aí sai texto).
 if(orgId!==OFFICE_ORG||!interactive)return null;
 const cutU=(v:any,n:number)=>Array.from(String(v??"").replace(/[|\n]/g," ").trim()).slice(0,n).join("");
 if(interactive.style==="menu"&&interactive.type==="list"&&Array.isArray(interactive.rows)&&interactive.rows.length>0&&interactive.prefer!=="text"){
  const base0=(await runtimeSecret(a,"uazapi_base_url")).replace(/\/+$/,""),token0=await runtimeSecret(a,"uazapi_instance_token");
  const lbody=String(interactive.body||message||"").trim();
  if(/^https:\/\//.test(base0)&&token0&&lbody){
   const lp:any={number:digits(phone),type:"list",text:lbody.slice(0,1024),listButton:cutU(interactive.button||"Ver opções",24),footerText:cutU(interactive.footer||"",60),
    choices:["["+cutU(interactive.section||"Opções",24)+"]",...interactive.rows.slice(0,10).map((r:any)=>cutU(r.title,24)+"|"+String(r.id).slice(0,200).replace(/[|\n]/g,"")+(r.description?"|"+cutU(r.description,72):""))]};
   const dms=Math.max(0,Math.min(15000,Math.round(Number(delaySeconds)||0)*1000));if(dms>0)lp.delay=dms;
   try{const lr=await fetch(base0+"/send/menu",{method:"POST",headers:{token:token0,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(lp),signal:AbortSignal.timeout(30000)});
    const lraw=await lr.text();if(lr.ok){try{return JSON.parse(lraw)}catch{return {}}}
    console.error("uazapi list recusada",lr.status,lraw.slice(0,300));}catch(e){console.error("uazapi list erro",e instanceof Error?e.message:String(e));}
  }
 }
 let body="";let buttons:{id:string,title:string}[]|null=null;
 if(interactive.style==="menu"){const mb=metaButtonsFromMenu(message,interactive);if(mb){body=mb.body;buttons=mb.interactive.buttons}}
 else if(interactive.type==="button"&&Array.isArray(interactive.buttons)){buttons=interactive.buttons.filter((b:any)=>b?.id&&b?.title).slice(0,3).map((b:any)=>({id:String(b.id).slice(0,200),title:shortTitle(b.title)}));body=String(message||"").trim()}
 if(!buttons||!buttons.length||!body)return null;
 const base=(await runtimeSecret(a,"uazapi_base_url")).replace(/\/+$/,""),token=await runtimeSecret(a,"uazapi_instance_token");
 if(!/^https:\/\//.test(base)||!token)return null;
 const payload:any={number:digits(phone),type:"button",text:body,choices:buttons.map((b)=>b.title.replace(/[|\n]/g," ")+"|"+b.id)};
 const delayMs=Math.max(0,Math.min(15000,Math.round(Number(delaySeconds)||0)*1000));if(delayMs>0)payload.delay=delayMs;
 try{
  const r=await fetch(base+"/send/menu",{method:"POST",headers:{token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  const raw=await r.text();
  if(!r.ok){console.error("uazapi menu recusado",r.status,raw.slice(0,300));return null}
  try{return JSON.parse(raw)}catch{return {}}
 }catch(e){console.error("uazapi menu erro",e instanceof Error?e.message:String(e));return null}
}
const sleepMs=(ms:number)=>new Promise((r)=>setTimeout(r,ms));
// v111: indicador "digitando…"/"gravando…" pela Uazapi (falha nunca bloqueia o envio).
async function uazapiPresence(a:any,phone:string,presence:"composing"|"recording",ms:number){
 try{
  const base=(await runtimeSecret(a,"uazapi_base_url")).replace(/\/+$/,""),token=await runtimeSecret(a,"uazapi_instance_token");
  if(!/^https:\/\//.test(base)||!token)return false;
  const r=await fetch(base+"/message/presence",{method:"POST",headers:{token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({number:digits(phone),presence,delay:ms}),signal:AbortSignal.timeout(6000)});
  if(!r.ok)console.error("uazapi presence recusada",r.status,(await r.text().catch(()=>"")).slice(0,160));
  return r.ok;
 }catch(e){console.error("uazapi presence erro",e instanceof Error?e.message:String(e));return false}
}
async function contactPreference(a:any,orgId:string,phone:string){
 try{
  const p=digits(phone);
  const {data}=await a.from("whatsapp_contacts").select("communication_preference").eq("org_id",orgId).in("phone",[p,p.startsWith("55")?p.slice(2):"55"+p]).limit(1).maybeSingle();
  const v=String(data?.communication_preference||"");
  return v==="audio"||v==="ambos"?v:"";
 }catch{return ""}
}
function speakable(text:string){
 // Não lê links, códigos longos nem chave Pix em voz alta; se houver, a resposta segue só em texto.
 if(/https?:\/\/|www\.|\bpix\b|\d{6,}|@\w+\.\w+/i.test(text))return "";
 const t=String(text||"").replace(/^\s*\*{0,2}Helena\*{0,2}\s*\|\s*(?:Concierge Jur[ií]dica|Secret[aá]ria)\*{0,2}\s*[:\-–—]?\s*/i,"").replace(/[*_~`]/g,"").replace(/\p{Extended_Pictographic}/gu,"").replace(/\s*\n+\s*/g,". ").replace(/\s{2,}/g," ").trim();
 return t.length>=2&&t.length<=900?t:"";
}
// v111: resposta em áudio com a voz já escolhida (Azure pt-BR Francisca) só para quem prefere áudio. Devolve null se não der.
async function uazapiVoice(a:any,orgId:string,phone:string,text:string){
 try{
  const say=speakable(text);if(!say||orgId!==OFFICE_ORG)return null;
  const base=(await runtimeSecret(a,"uazapi_base_url")).replace(/\/+$/,""),token=await runtimeSecret(a,"uazapi_instance_token"),sync=await runtimeSecret(a,"datajud_sync_token");
  if(!/^https:\/\//.test(base)||!token||!sync)return null;
  const rec=uazapiPresence(a,phone,"recording",6000);
  const tr=await fetch(Deno.env.get("SUPABASE_URL")!+"/functions/v1/azure-tts",{method:"POST",headers:{"x-sync-token":sync,"Content-Type":"application/json"},body:JSON.stringify({text:say,format:"ogg"}),signal:AbortSignal.timeout(20000)});
  if(!tr.ok||!/audio\/ogg/.test(tr.headers.get("content-type")||"")){console.error("tts falhou",tr.status);return null}
  const bytes=new Uint8Array(await tr.arrayBuffer());
  if(bytes.length<500||bytes.length>2_500_000)return null;
  let bin="";for(let i=0;i<bytes.length;i+=32768)bin+=String.fromCharCode(...bytes.subarray(i,i+32768));
  await rec;await sleepMs(Math.min(2500,600+say.length*12));
  const r=await fetch(base+"/send/media",{method:"POST",headers:{token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({number:digits(phone),type:"ptt",file:btoa(bin)}),signal:AbortSignal.timeout(30000)});
  const raw=await r.text();if(!r.ok){console.error("uazapi voz recusada",r.status,raw.slice(0,200));return null}
  try{return JSON.parse(raw)}catch{return {}}
 }catch(e){console.error("uazapi voz erro",e instanceof Error?e.message:String(e));return null}
}
async function evolutionSend(a:any,orgId:string,phone:string,message:string,delaySeconds=0,typing=false,image:string|null=null,caption:string|null=null,document:string|null=null,fileName:string|null=null){
 const base=(await runtimeSecret(a,"evolution_api_url")).replace(/\/+$/,"");
 const key=await runtimeSecret(a,"evolution_api_key");
 const instance=(await runtimeSecret(a,"evolution_instance_name"))||"suzanne-lexoffice",p=digits(phone);
 if(orgId!==OFFICE_ORG)throw new Error("Provedor Evolution não autorizado nesta organização");
 if(!/^https:\/\//.test(base)||!key||!p)throw new Error("Evolution não configurada ou número inválido");
 const {data:instanceRow,error:instanceError}=await a.from("whatsapp_evolution_instances").select("status,is_active").eq("org_id",orgId).eq("instance_name",instance).maybeSingle();
 if(instanceError||instanceRow?.status!=="connected"||instanceRow?.is_active!==true)throw new Error("Instância Evolution não está ativa");
 const media=document||image;
 const endpoint=media?"message/sendMedia":"message/sendText";
 const payload=document
   ?{number:p,mediatype:"document",media:document,fileName:fileName||"documento.pdf",caption:caption||message||""}
   :image
     ?{number:p,mediatype:"image",media:image,caption:caption||message||""}
     :{number:p,text:message,delay:Math.max(0,Math.min(15000,Math.round(Number(delaySeconds)||0)*1000))};
 const response=await fetch(base+"/"+endpoint+"/"+encodeURIComponent(instance),{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(16000)});
 const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{data={raw:raw.slice(0,240)}}
 if(!response.ok)throw new Error("Evolution "+response.status+": "+String(data?.message||data?.error||raw||"falha").slice(0,280));
 return data;
}
async function evolutionSendSmart(a:any,orgId:string,phone:string,interactive:any,message:string,...rest:any[]){
 const media=Boolean(rest[2]||rest[4]);
 if(!media&&interactive?.style==="menu"&&interactive?.type==="list"&&Array.isArray(interactive.rows)&&interactive.rows.length>0&&interactive.prefer!=="text"&&orgId===OFFICE_ORG){
  try{
   const base=(await runtimeSecret(a,"evolution_api_url")).replace(/\/+$/,""),key=await runtimeSecret(a,"evolution_api_key");
   const instance=(await runtimeSecret(a,"evolution_instance_name"))||"suzanne-lexoffice",p=digits(phone);
   const cutW=(v:any,n:number)=>Array.from(String(v??"").trim()).slice(0,n).join("");
   const body={number:p,title:cutW(interactive.header||"Suzanne Figueiredo Advocacia",60),description:cutW(interactive.body||message,1024),buttonText:cutW(interactive.button||"Ver opções",20),footerText:cutW(interactive.footer||"",60),
    sections:[{title:cutW(interactive.section||"Opções",24),rows:interactive.rows.slice(0,10).map((r:any)=>({title:cutW(r.title,24),description:r.description?cutW(r.description,72):"",rowId:cutW(r.id,200)}))}]};
   const r=await fetch(base+"/message/sendList/"+encodeURIComponent(instance),{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(16000)});
   const raw=await r.text();
   if(r.ok){let d:any={};try{d=JSON.parse(raw)}catch{}return d;}
   console.error("evolution sendList recusado",r.status,raw.slice(0,300));
  }catch(e){console.error("evolution sendList erro",e instanceof Error?e.message:String(e));}
 }
 const text=interactive?.style==="menu"?interactiveAsMenuText(message,interactive):interactiveAsText(message,interactive);
 return evolutionSend(a,orgId,phone,text,...(rest as [any,any,any,any,any,any]));
}

const EMOJI_HEAD=/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)\s*(.*)$/u;
function shortTitle(t:string,n=20){const s=String(t||"").trim();if(Array.from(s).length<=n)return s;let o="";for(const w of s.split(/\s+/)){const x=o?o+" "+w:w;if(Array.from(x).length>n)break;o=x}return o||Array.from(s).slice(0,n).join("")}
function metaButtonsFromMenu(message:string,interactive:any){
  if(!interactive||interactive.type!=="list"||!Array.isArray(interactive.rows))return null;
  const rows=interactive.rows.filter((r:any)=>r?.id&&r?.title);if(!rows.length)return null;
  const nodeKey=String(rows[0].id).split(":")[0];
  const page=Math.max(0,Math.floor(Number(interactive.page)||0));
  const remaining=rows.slice(page*2);if(!remaining.length)return null;
  const more=remaining.length>3,shown=more?remaining.slice(0,2):remaining;
  const buttons:any[]=shown.map((r:any)=>({id:String(r.id).slice(0,200),title:shortTitle(r.title)}));
  if(more)buttons.push({id:"more:"+nodeKey+":"+(page+1),title:"➕ Mais opções"});
  const lines=shown.filter((r:any)=>r.description).map((r:any)=>{const t=String(r.title).trim(),m=t.match(EMOJI_HEAD),head=m?m[1]+" *"+m[2]+"*":"*"+t+"*";return head+"\n_"+String(r.description).trim()+"_"});
  const body=[String(message||"").trim(),...lines].filter(Boolean).join("\n\n");
  if(!body||body.length>1024||new Set(buttons.map((b:any)=>b.id)).size!==buttons.length)return null;
  return {body,interactive:{type:"button",buttons}};
}
async function metaReplyChannel(a:any){return (await runtimeSecret(a,"meta_reply_channel")).toLowerCase()==="true"}
function sanitize(text: string) {
  return text.replace(/^\s*(suporte|support)\s*:\s*/i, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function unsafe(text: string) {
  return /(bot_ativo|human_takeover|ai_enabled|resume_at|system prompt|prompt interno|racioc[ií]nio interno|verifica[cç][aã]o de estado|transbordo humano|registro de poss[ií]vel)/i.test(text);
}
async function aiKillSwitch(a: any, orgId: string, conversationId: string | null, target: string, agentKey: string) {
  if (!AGENT_KEYS.has(agentKey) && agentKey !== "system") return false;
  const { data: ws } = await a.from("whatsapp_settings").select("ai_enabled,alert_phone,commercial_alert_phone").eq("org_id", orgId).maybeSingle();
  if (ws?.ai_enabled !== false) return false;
  if(orgId===OFFICE_ORG){const allowed=(await runtimeSecret(a,"ai_test_allowlist")).split(/[,;\s]+/).map(digits).filter(Boolean);if(allowed.includes(digits(target)))return false;}
  const p = digits(target);
  const br = (x: string) => (x.length >= 12 && x.startsWith("55") ? x.slice(2) : x);
  const adminPhones = [ws?.alert_phone, ws?.commercial_alert_phone].map(digits).filter(Boolean).map(br);
  if (p && adminPhones.some((x: string) => x === br(p))) return false;
  let convId = conversationId;
  if (!convId && p) {
    const { data: ct } = await a.from("whatsapp_contacts").select("id").eq("org_id", orgId).eq("phone", p).limit(1).maybeSingle();
    if (ct) { const { data: cv } = await a.from("whatsapp_conversations").select("id").eq("org_id", orgId).eq("contact_id", ct.id).neq("status", "closed").order("updated_at", { ascending: false }).limit(1).maybeSingle(); convId = cv?.id || null; }
  }
  if (!convId) return true;
  const since = new Date(Date.now() - 30 * 60000).toISOString();
  const { count } = await a.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("conversation_id", convId).eq("direction", "inbound").gte("created_at", since);
  return (count || 0) > 0;
}
async function conversationState(a: any, orgId: string, conversationId: string | null, target: string, cooldownMs: number) {
  let cv: any = null;
  const cols = "id,bot_ativo,conversation_owner,human_takeover_at,human_takeover_reason,last_human_outbound_at,chatbot_context";
  if (conversationId) {
    const q = await a.from("whatsapp_conversations").select(cols).eq("org_id", orgId).eq("id", conversationId).maybeSingle();
    cv = q.data;
  } else {
    const p = digits(target);
    if (p) {
      const { data: ct } = await a.from("whatsapp_contacts").select("id").eq("org_id", orgId).eq("phone", p).limit(1).maybeSingle();
      if (ct) {
        const q = await a.from("whatsapp_conversations").select(cols).eq("org_id", orgId).eq("contact_id", ct.id).neq("status", "closed").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        cv = q.data;
      }
    }
  }
  const panel = cv ? await panelTakeover(a, cv) : { managed: false };
  if (panel.managed) { cv.bot_ativo = !panel.paused; cv.conversation_owner = panel.paused ? "HUMAN" : "HELENA"; }
  const p = digits(target);
  let ctl: any = null;
  if (p) {
    const q = await a.from("ai_conversation_controls").select("ai_enabled,human_takeover,last_human_message_at,resume_at").eq("org_id", orgId).eq("contact_key", p).maybeSingle();
    ctl = q.data;
  }
  const timestamps = [cv?.last_human_outbound_at, ctl?.last_human_message_at]
    .filter(Boolean).map((x: any) => new Date(x).getTime()).filter(Number.isFinite);
  const lastHumanAt = timestamps.length ? Math.max(...timestamps) : null,
    cooldownUntil = lastHumanAt ? lastHumanAt + cooldownMs : null,
    humanCooldownActive = Boolean(cooldownUntil && Date.now() < cooldownUntil);
  const emergencyOnly = cv?.human_takeover_reason === "emergency_manual_takeover_fix" && !lastHumanAt;
  return {
    cv, ctl,
    panel_managed: panel.managed,
    global_ai_enabled: panel.global_ai_enabled,
    bot_ativo: cv?.bot_ativo ?? null,
    human_takeover: panel.managed ? panel.paused : !emergencyOnly && Boolean(cv?.conversation_owner === "HUMAN" || cv?.human_takeover_at || ctl?.human_takeover === true || ctl?.ai_enabled === false),
    last_human_outbound_at: lastHumanAt ? new Date(lastHumanAt).toISOString() : null,
    cooldown_until: panel.managed ? panel.resume_at : cooldownUntil ? new Date(cooldownUntil).toISOString() : null,
    human_cooldown_active: panel.managed ? panel.paused : humanCooldownActive,
  };
}
async function blockedByHuman(a: any, orgId: string, conversationId: string | null, target: string, automated: boolean, cooldownMs: number, panelAutomated = automated) {
  const state = await conversationState(a, orgId, conversationId, target, cooldownMs);
  if (!automated && !(state.panel_managed && panelAutomated)) return { blocked: false, reason: "human_operator_allowed", state };
  if (state.panel_managed) return { blocked: state.human_takeover, reason: "human_takeover", state };
  if (state.human_cooldown_active) return { blocked: true, reason: `human_cooldown_${Math.round(cooldownMs/60000)}m`, state };
  const manualTakeover = state.cv?.human_takeover_reason === "manual_operator_message" && Boolean(state.last_human_outbound_at);
  if (manualTakeover) return { blocked: false, reason: "human_cooldown_elapsed", state };
  return {
    blocked: state.human_takeover || (state.bot_ativo === false && state.cv?.human_takeover_reason !== "emergency_manual_takeover_fix"),
    reason: "human_takeover",
    state,
  };
}

async function activeFinancialRestriction(a:any,orgId:string,conversationId:string|null,target:string){let clientId:string|null=null;if(conversationId){const {data}=await a.from('whatsapp_conversations').select('client_id,contact_id').eq('org_id',orgId).eq('id',conversationId).maybeSingle();clientId=data?.client_id||null;if(!clientId&&data?.contact_id){const {data:ct}=await a.from('whatsapp_contacts').select('client_id').eq('id',data.contact_id).maybeSingle();clientId=ct?.client_id||null}}if(!clientId){const p=digits(target);const {data:ct}=await a.from('whatsapp_contacts').select('client_id').eq('org_id',orgId).eq('phone',p).limit(1).maybeSingle();clientId=ct?.client_id||null}if(!clientId)return null;const {data:r}=await a.from('client_service_restrictions').select('id,client_id').eq('org_id',orgId).eq('client_id',clientId).eq('active',true).limit(1).maybeSingle();return r||null;}
async function log(a: any, row: any) {
  try { await a.from("whatsapp_outbound_gate_log").insert(row); } catch {}
}
async function trace(a: any, orgId: string, conversationId: string | null, agentKey: string, decision: string, metadata: any) {
  if (!conversationId) return;
  try {
    await a.from("ai_orchestrator_events").insert({ org_id: orgId, conversation_id: conversationId, event_type: "whatsapp_reply_pipeline", agent_key: agentKey, decision, reason: metadata?.reason || null, metadata });
  } catch {}
}
const J = (x: unknown, s = 200) => json(x, s);
function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function pickPhone(m: any, chat: any): string {
  const candidates = [m?.chatid, chat?.wa_chatid, chat?.phone, m?.sender_pn && m?.fromMe !== true ? m.sender_pn : null];
  for (const c of candidates) {
    const s = String(c ?? "");
    if (!s || s.includes("@lid") || s.includes("@g.us") || s.includes("@broadcast") || s.includes("@newsletter")) continue;
    const p = digits(s.replace(/@.*/, ""));
    if (/^55\d{10,11}$/.test(p)) return p;
  }
  return "";
}
function pickText(m: any): string {
  const c = m?.content;
  const fromContent = typeof c === "string" ? c : (c?.text || c?.caption || c?.selectedDisplayText || c?.title || "");
  return String(m?.text || fromContent || m?.buttonOrListid || "").trim();
}
function mediaLabel(m: any): string {
  const t = String(m?.messageType || "").toLowerCase() + " " + String(m?.mediaType || "").toLowerCase();
  if (/sticker/.test(t)) return "figurinha";
  if (/(audio|ptt)/.test(t)) return "áudio";
  if (/image/.test(t)) return "imagem";
  if (/document/.test(t)) return "documento";
  if (/video/.test(t)) return "vídeo";
  return "";
}
async function handleUazapiWebhook(req: Request) {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const secret = async (k: string) => { const { data } = await db.from("system_runtime_secrets").select("secret").eq("key", k).maybeSingle(); return String(data?.secret || "").trim(); };
  const expected = await secret("uazapi_webhook_token");
  const got = String(new URL(req.url).searchParams.get("token") || "");
  if (!safeEqual(got, expected)) return J({ error: "webhook_forbidden" }, 403);
  if ((await secret("whatsapp_provider")).toLowerCase() !== "uazapi") return J({ ok: true, ignored: "provider_disabled" });
  const body = await req.json().catch(() => null);
  if (!body) return J({ ok: true, ignored: "invalid_json" });
  const eventType = String(body.EventType || body.event || body.type || "").toLowerCase();
  const m = body.message || body.data?.message || {};
  const chat = body.chat || {};
  if (eventType !== "messages") return J({ ok: true, ignored: "event", event: eventType });
  if (m?.isGroup === true) return J({ ok: true, ignored: "group" });
  if (m?.wasSentByApi === true) return J({ ok: true, ignored: "sent_by_api" });
  const phone = pickPhone(m, chat);
  if (!phone) return J({ ok: true, ignored: "invalid_phone" });
  const text = pickText(m);
  const iid = String(m?.buttonOrListid || "").trim();
  if (iid && m?.fromMe !== true) {
    // v106: resposta a um botão do menu -> mesmo atendimento (menu/Helena); "Mais opções" abre a próxima página.
    if (await metaTestBlocked(db, phone)) return J({ ok: true, ignored: "test_phase_not_allowlisted" });
    const mid0 = String(m?.messageid || m?.id || "");
    const more = iid.match(/^more:([a-z_]+):(\d{1,2})$/i);
    if (more) return J({ ok: true, ...(await metaMenuPage(db, phone, more[1], Number(more[2]), mid0)) });
    return await bridgeToFlow(db, phone, mid0, text, iid, String(m?.senderName || chat?.name || ""));
  }
  const media = mediaLabel(m);
  // v110: áudio, imagem e PDF de números liberados são lidos (baixa -> transcreve/lê -> mesmo atendimento). Falha avisa a pessoa.
  if (m?.fromMe !== true && (media === "áudio" || media === "imagem" || media === "documento") && !(await metaTestBlocked(db, phone))) {
    try {
      const ir = await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/whatsapp-media-intake", { method: "POST", headers: { Authorization: "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, "Content-Type": "application/json" }, body: JSON.stringify({ phone, m, kind: media, text, pushName: String(m?.senderName || chat?.name || "") }), signal: AbortSignal.timeout(58000) });
      const ij = await ir.json().catch(() => ({}));
      return J({ ok: ir.ok, media_intake: true, result: ij });
    } catch (e) { console.error("media_intake", e instanceof Error ? e.message : String(e)); return J({ ok: true, error: "media_intake_error" }); }
  }
  // v107: texto livre (sem mídia) segue o MESMO coordenador dos botões (menu + Helena). Fora da liberação, mantém o caminho antigo.
  if (m?.fromMe !== true && !media && text && !(await metaTestBlocked(db, phone))) await learnPreference(db, phone, text);
  if (m?.fromMe !== true && !media && text && !m?.quoted && !(await metaTestBlocked(db, phone))) {
    return await bridgeToFlow(db, phone, String(m?.messageid || m?.id || ""), text, "", String(m?.senderName || chat?.name || ""));
  }
  const bridgedText = media ? `[MIDIA:${media}]${text ? " " + text : ""}` : text;
  const contactResult = await db.from("whatsapp_contacts").select("id").eq("org_id", OFFICE_ORG).in("phone", [phone, phone.slice(2)]).limit(1).maybeSingle();
  if (contactResult.error) throw new Error("panel_takeover_contact_unavailable");
  if (contactResult.data) {
    const conversationResult = await db.from("whatsapp_conversations").select("id,chatbot_context").eq("org_id", OFFICE_ORG).eq("contact_id", contactResult.data.id).neq("status", "closed").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (conversationResult.error) throw new Error("panel_takeover_conversation_unavailable");
    if (conversationResult.data) {
      const panel = await panelTakeover(db, conversationResult.data, "keyword", text);
      if (panel.managed && panel.keyword_matched) return J({ ok: true, event: "panel_takeover_keyword", resumed: panel.resumed === true, paused: panel.paused, global_ai_enabled: panel.global_ai_enabled });
    }
  }
  const msgId = String(m?.messageid || m?.id || "");
  const evoInstance = await secret("evolution_instance_name");
  const evoToken = await secret("evolution_webhook_token");
  if (!evoInstance || !evoToken) return J({ ok: false, error: "bridge_not_configured" }, 503);
  const event = {
    event: "messages.upsert",
    instance: evoInstance,
    source: "uazapi",
    data: {
      key: { remoteJid: phone + "@s.whatsapp.net", fromMe: m?.fromMe === true, id: msgId },
      message: bridgedText ? { conversation: bridgedText } : {},
      pushName: String(m?.senderName || chat?.name || ""),
    },
  };
  const url = Deno.env.get("SUPABASE_URL")! + "/functions/v1/whatsapp-evolution-connect?evolution_webhook=1&token=" + encodeURIComponent(evoToken);
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(58000) });
  const result = await r.json().catch(() => ({}));
  return J({ ok: r.ok, bridged: true, result }, r.ok ? 200 : 502);
}

const phoneCoreOf=(v:any)=>{let d=digits(v);if(d.startsWith("55")&&d.length>=12)d=d.slice(2);if(d.length===11&&d[2]==="9")d=d.slice(0,2)+d.slice(3);return d.length===10?d:""};
async function metaTestBlocked(db:any,phone:string){
  const {data:ws}=await db.from("whatsapp_settings").select("ai_enabled").eq("org_id",OFFICE_ORG).maybeSingle();
  if(ws?.ai_enabled===true||(await runtimeSecret(db,"helena_live"))==="true")return false;
  const allow=(await runtimeSecret(db,"ai_test_allowlist")).split(/[,;\s]+/).map(phoneCoreOf).filter(Boolean),p=phoneCoreOf(phone);
  return !p||!allow.includes(p);
}
async function metaSignatureOk(raw:string,appSecret:string,header:string){
  if(!appSecret||!/^sha256=[a-f0-9]{64}$/i.test(header))return false;
  const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(appSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(raw)));
  return safeEqual("sha256="+Array.from(sig,(x)=>x.toString(16).padStart(2,"0")).join(""),header.toLowerCase());
}
async function metaMenuPage(db:any,phone:string,node:string,page:number,msgId:string){
  const sk=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,base=Deno.env.get("SUPABASE_URL")!,hd={Authorization:"Bearer "+sk,apikey:sk,"Content-Type":"application/json"};
  const pv=await (await fetch(base+"/functions/v1/whatsapp-chatbot-flow",{method:"POST",headers:hd,body:JSON.stringify({org_id:OFFICE_ORG,phone,node,action:"preview"}),signal:AbortSignal.timeout(20000)})).json().catch(()=>null);
  if(!pv?.ok||!pv?.interactive)return {ignored:"menu_node_not_found"};
  const r=await fetch(base+"/functions/v1/whatsapp-outbound-gate",{method:"POST",headers:hd,body:JSON.stringify({org_id:OFFICE_ORG,phone,message:pv.message,interactive:{...pv.interactive,page},agent_key:"helena_chatbot",idempotency_key:"chatbot_more:"+msgId,format_agent_reply:false}),signal:AbortSignal.timeout(30000)});
  const d=await r.json().catch(()=>({}));
  return {action:"menu_page",page,sent:d?.allowed===true,reason:d?.reason||d?.error||null};
}
// v111: registra a preferência de comunicação só quando a pessoa pede ou responde à pergunta (nunca por suposição).
async function learnPreference(db:any,phone:string,text:string){
 try{
  const t=String(text||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
  let pref="";
  if(/\bnao\b[^.!?]{0,25}audio/.test(t))pref="texto";
  else if(/(manda|mande|envia|envie|grava|grave|responde|responda|fala|fale|explica|explique|prefiro|pode (ser|mandar|enviar|responder)|quero)[^.!?]{0,20}\b(por|em) audio\b/.test(t)||/\b(manda|mande|envia|envie|grava|grave)\b[^.!?]{0,25}\b(um |o )?audio\b/.test(t)||/\b(prefiro|quero) audio\b/.test(t)||/^(por |em )?audio[.!]?$/.test(t))pref="audio";
  else if(/(prefiro|quero|pode (ser|mandar|enviar|responder)|manda|mande|responde|responda)[^.!?]{0,25}(por |em )?(texto|mensagem|escrito|escrita)\b/.test(t)||/^(por |em )?(texto|mensagem|escrito)[.!]?$/.test(t))pref="texto";
  else if(/(os dois|ambos|texto e audio|audio e texto)/.test(t))pref="ambos";
  if(!pref)return;
  if(/^(por |em )?(audio|texto|mensagem|escrito)[.!]?$/.test(t)){
   // resposta curta só vale se a Helena acabou de perguntar a preferência.
   const p=digits(phone);
   const {data:ct}=await db.from("whatsapp_contacts").select("id").eq("org_id",OFFICE_ORG).in("phone",[p,p.slice(2)]).limit(1).maybeSingle();
   if(!ct)return;
   const {data:cv}=await db.from("whatsapp_conversations").select("id").eq("org_id",OFFICE_ORG).eq("contact_id",ct.id).neq("status","closed").order("updated_at",{ascending:false}).limit(1).maybeSingle();
   if(!cv)return;
   const {data:last}=await db.from("whatsapp_messages").select("body").eq("conversation_id",cv.id).eq("direction","outbound").order("created_at",{ascending:false}).limit(1).maybeSingle();
   if(!/por mensagem ou por [aá]udio|mensagem ou [aá]udio/i.test(String(last?.body||"")))return;
  }
  const p=digits(phone);
  await db.from("whatsapp_contacts").update({communication_preference:pref}).eq("org_id",OFFICE_ORG).in("phone",[p,p.startsWith("55")?p.slice(2):"55"+p]);
 }catch(e){console.error("learnPreference",e instanceof Error?e.message:String(e))}
}
async function bridgeToFlow(db:any,phone:string,mid:string,text:string,iid:string,pushName:string){
  try{
    const {data:wc}=await db.from("integration_connections").select("id,settings").eq("org_id",OFFICE_ORG).eq("provider","whatsapp").eq("status","connected").limit(5);
    const wconn=(wc||[]).find((c:any)=>c.settings?.provider==="waha"&&c.settings?.channel_enabled===true&&c.settings?.waha_session),wkey=(Deno.env.get("WAHA_API_KEY")||"").trim();
    if(!wconn||!wkey){console.error("flow_bridge_not_configured");return json({ok:true,error:"flow_bridge_not_configured"});}
    const session=String(wconn.settings.waha_session);
    const payload={event:"message",session,payload:{id:mid||("uz:"+Date.now()),from:phone+"@c.us",chatId:phone+"@c.us",fromMe:false,body:text||iid,pushName,source:"evolution",...(iid?{listResponse:{selectedRowId:iid}}:{}),_data:{key:{remoteJidAlt:phone+"@s.whatsapp.net"}}}};
    const up=await fetch(Deno.env.get("SUPABASE_URL")!+"/functions/v1/waha-message-webhook",{method:"POST",headers:{"Content-Type":"application/json","x-lexoffice-webhook-key":wkey,"x-lexoffice-connection-id":String(wconn.id),"x-lexoffice-waha-session":session},body:JSON.stringify(payload),signal:AbortSignal.timeout(55000)});
    const out=await up.json().catch(()=>({}));
    if(!up.ok)console.error("flow_bridge_failed",up.status);
    return json({ok:up.ok,delivered:up.ok,processing:out?.event||out?.ignored||"accepted"});
  }catch(e){console.error("flow_bridge",e instanceof Error?e.message:e);return json({ok:true,error:"flow_bridge_error"});}
}
async function metaDiag(db:any,stage:string,extra=""){await log(db,{org_id:OFFICE_ORG,conversation_id:null,agent_key:"meta_inbound",allowed:false,reason:"meta_inbound:"+stage,body_preview:extra.slice(0,200),idempotency_key:null});}
async function handleMetaInbound(req:Request){
  const db=admin(),u=new URL(req.url);
  if(req.method==="GET"){
    const t=String(u.searchParams.get("hub.verify_token")||""),ok=[await runtimeSecret(db,"meta_webhook_secret"),await runtimeSecret(db,"meta_webhook_verify_token")].filter(Boolean).some((x)=>safeEqual(t,x));
    if(u.searchParams.get("hub.mode")==="subscribe"&&ok)return new Response(u.searchParams.get("hub.challenge")||"");
    return json({ok:false,error:"forbidden"},403);
  }
  if(req.method!=="POST")return json({ok:false},405);
  const raw=await req.text();
  if(!(await metaSignatureOk(raw,await runtimeSecret(db,"meta_app_secret"),req.headers.get("x-hub-signature-256")||""))){await metaDiag(db,"assinatura_invalida","tem_header="+Boolean(req.headers.get("x-hub-signature-256")));return json({ok:false},401);}
  if(!(await metaReplyChannel(db))){await metaDiag(db,"canal_desligado");return json({ok:true,ignored:"meta_channel_off"});}
  let body:any;try{body=JSON.parse(raw)}catch{return json({ok:true,ignored:"invalid_json"})}
  const value=body?.entry?.[0]?.changes?.[0]?.value;
  if(!value)return json({ok:true,ignored:"no_value"});
  if(String(value?.metadata?.phone_number_id||"")!==await runtimeSecret(db,"meta_whatsapp_phone_number_id"))return json({ok:true,ignored:"other_number"});
  const msg=value?.messages?.[0];
  if(!msg){await metaDiag(db,"sem_mensagem","campos="+Object.keys(value||{}).join(","));return json({ok:true,ignored:"status_or_no_message"});}
  await metaDiag(db,"mensagem_recebida","tipo="+String(msg?.type||"")+" final="+digits(msg?.from).slice(-4));
  const phone=digits(msg.from);
  if(!/^55\d{10,11}$/.test(phone))return json({ok:true,ignored:"invalid_phone"});
  if(await metaTestBlocked(db,phone))return json({ok:true,ignored:"test_phase_not_allowlisted"});
  const iid=String(msg?.interactive?.button_reply?.id||msg?.interactive?.list_reply?.id||msg?.button?.payload||"").trim();
  const title=String(msg?.interactive?.button_reply?.title||msg?.interactive?.list_reply?.title||msg?.button?.text||"").trim();
  const text=msg?.type==="text"?String(msg?.text?.body||"").trim():title;
  const mid=String(msg?.id||"").trim();
  if(!mid||(!text&&!iid))return json({ok:true,ignored:"unsupported_media"});
  try{
    const more=iid.match(/^more:([a-z_]+):(\d{1,2})$/i);
    if(more)return json({ok:true,...(await metaMenuPage(db,phone,more[1],Number(more[2]),mid))});
    return await bridgeToFlow(db,phone,mid,text,iid,String(value?.contacts?.[0]?.profile?.name||""));
  }catch(e){console.error("meta_inbound",e instanceof Error?e.message:e);return json({ok:true,error:"meta_inbound_error"});}
}
Deno.serve(async (req) => {
  if (new URL(req.url).searchParams.get("meta_inbound") === "1") return await handleMetaInbound(req);
  if (req.method !== "POST") return json({ ok: false, error: "Método inválido" }, 405);
  if (new URL(req.url).searchParams.get("uazapi_webhook") === "1") {
    try { return await handleUazapiWebhook(req); } catch (e) { console.error("uazapi_webhook", e); return json({ ok: false, error: "webhook_error" }, 500); }
  }
  try {
    const service = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim(), auth = (req.headers.get("authorization") || "").trim();
    if (!service || auth !== `Bearer ${service}`) return json({ ok: false, error: "Não autorizado" }, 401);
    const b = await req.json().catch(() => ({}));
    const orgId = String(b.org_id || "").trim(),
      conversationId = b.conversation_id ? String(b.conversation_id) : null,
      target = String(b.phone || b.to || b.chat_id || "").trim(),
      agentKey = String(b.agent_key || "system").trim(),
      key = String(b.idempotency_key || "").trim() || null,
      rawMessage = String(b.message || "").trim(),
      image = b.image ? String(b.image) : null,
      document = b.document ? String(b.document) : null,
      fileName = b.file_name ? String(b.file_name).replace(/[\\/]/g, "-").slice(0, 180) : null,
      caption = b.caption ? String(b.caption) : null,
      interactive = b.interactive && typeof b.interactive === "object" ? b.interactive : null;
    if (!orgId || !target || (!rawMessage && !image && !document)) return json({ ok: false, error: "org_id, destino e mensagem ou mídia são obrigatórios" }, 400);
    const reactiveKeys = new Set(["helena_chatbot","client_service_triage","sales","client_schedule_relationship","scheduler","closer","legal_triage","support_n1","sdr"]);
    const humanRequested = b.operator_send === true || String(key || "").startsWith("operator:");
    const automatedPrefix = /^(notification:|collection:|alert:|process-notification:|lexsign-remind-)/i.test(String(key || ""));
    const proactive = b.proactive === true || (!humanRequested && (automatedPrefix || (!reactiveKeys.has(agentKey) && agentKey !== "system" && agentKey !== "helena_office")));
    // v109 (20/11/2026): resposta a quem escreveu nos últimos 30 min nunca é barrada pelo horário (só aviso automático é).
    let answeringInbound = false;
    if (proactive && !humanRequested && conversationId && b.proactive !== true && !automatedPrefix) {
      const { count: recentIn } = await admin().from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).eq("direction", "inbound").gte("created_at", new Date(Date.now() - 30 * 60000).toISOString());
      answeringInbound = (recentIn || 0) > 0;
    }
    if (proactive && !humanRequested && !answeringInbound) {
      const parts = new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",weekday:"short",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
      const weekday = parts.find(p=>p.type==="weekday")?.value || "";
      const hour = Number(parts.find(p=>p.type==="hour")?.value || "-1");
      if (!["Mon","Tue","Wed","Thu","Fri"].includes(weekday) || hour < 8 || hour >= 18)
        return json({ok:false,allowed:false,reason:"outside_business_hours",retryable:true},429);
    }
    const cooldownMin = Number.isFinite(Number(b.human_silence_minutes)) && Number(b.human_silence_minutes) >= 0 ? Number(b.human_silence_minutes) : DEFAULT_COOLDOWN_MIN;
    const cooldownMs = cooldownMin * 60 * 1000;
    const a = admin();
    if (key) {
      const { data: existing } = await a.from("whatsapp_outbound_gate_log").select("id,allowed,reason").eq("org_id", orgId).eq("idempotency_key", key).maybeSingle();
      if (existing && existing.allowed === true) return json({ ok: true, duplicate: true, allowed: true, reason: existing.reason });
    }
    if (b.operator_send !== true && !String(key || "").startsWith("operator:") && !automatedPrefix && await aiKillSwitch(a, orgId, conversationId, target, agentKey)) {
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: "ai_disabled_global", body_preview: previewForLog(rawMessage, 240), idempotency_key: key });
      return json({ ok: true, allowed: false, reason: "ai_disabled_global" });
    }
    const restriction=await activeFinancialRestriction(a,orgId,conversationId,target);
    const helenaRestrictedOk = agentKey === 'helena_office' && b.restricted_mode === true;
    if(restriction&&agentKey!=='billing'&&!helenaRestrictedOk){await log(a,{org_id:orgId,conversation_id:conversationId,agent_key:agentKey,allowed:false,reason:'financial_service_restriction',body_preview:previewForLog(rawMessage,240),idempotency_key:key});return json({ok:true,allowed:false,reason:'financial_service_restriction'});}
    const automated = AGENT_KEYS.has(agentKey) || b.format_agent_reply === true,
      formatted = automated
        ? formatWhatsAppAgentReply(rawMessage, { includeHeader: !proactive && !humanRequested && agentKey !== "system" && agentKey !== "helena_chatbot" && interactive?.style !== "menu" })
        : { rawAgentOutput: rawMessage, parsedReply: sanitize(rawMessage), formattedReply: sanitize(rawMessage) },
      message = formatted.formattedReply;
    if (!message && !image && !document) return json({ ok: false, error: "Mensagem vazia após formatação" }, 400);
    if (unsafe(formatted.parsedReply)) {
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: "unsafe_internal_content", body_preview: previewForLog(formatted.parsedReply, 240), idempotency_key: key });
      return json({ ok: true, allowed: false, reason: "unsafe_internal_content" });
    }
    const panelAutomated = b.operator_send !== true && !String(key || "").startsWith("operator:") && (automated || b.triage_reply === true || ["concierge","legal_triage","scheduler","sdr","closer","proposal_recovery","customer_success","support_n1","retention"].includes(agentKey));
    const panelReply = b.triage_reply === true || ["concierge","legal_triage","scheduler","sdr","closer","proposal_recovery","customer_success","support_n1","retention"].includes(agentKey);
    const hb = await blockedByHuman(a, orgId, conversationId, target, automated, cooldownMs, panelAutomated);
    if (hb.blocked) {
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: hb.reason, body_preview: previewForLog(message, 240), idempotency_key: key });
      return json({ ok: true, allowed: false, reason: hb.reason, resume_at: hb.state.cooldown_until });
    }
    const { data: officeWaha } = await a.from("integration_connections").select("id")
      .eq("org_id",orgId).eq("provider","whatsapp").eq("status","connected")
      .filter("settings->>provider","eq","waha").filter("settings->>channel_enabled","eq","true").maybeSingle();
    const providerName = (officeWaha && !["evolution","uazapi"].includes(await activeProvider(a))) ? "waha" : (["meta","uazapi"].includes(String(b.force_provider||"")) ? String(b.force_provider) : await activeProvider(a));
    await trace(a, orgId, conversationId, agentKey, "ready_to_send", { provider: providerName });
    try {
      if (panelAutomated) {
        const fresh = await blockedByHuman(a, orgId, conversationId, target, automated, cooldownMs, panelAutomated);
        if (fresh.state.panel_managed && (fresh.blocked || (panelReply && fresh.state.global_ai_enabled !== true))) {
          const reason = fresh.blocked ? "human_takeover" : "ai_disabled_global";
          await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason, body_preview: previewForLog(message, 240), idempotency_key: key });
          return json({ ok: true, allowed: false, reason });
        }
        if (fresh.state.panel_managed && panelReply) {
          const policy = await a.from("ai_agent_policies").select("active,allowed_channels").eq("org_id", orgId).eq("agent_key", agentKey).maybeSingle();
          if (policy.error || policy.data?.active !== true || !policy.data?.allowed_channels?.includes("whatsapp")) return json({ ok: true, allowed: false, reason: "agent_not_authorized" });
        }
      }
      const delay = automated ? Number(b.delay_seconds || 0) : 0;
      let usedProvider = providerName, metaError = "";
      let provider: any;
      const reactiveReply = !proactive && !humanRequested && !image && !document && (automated || reactiveKeys.has(agentKey) || agentKey === "helena_office") && (await metaReplyChannel(a));
      if (reactiveReply) {
        try {
          const mb = interactive?.style === "menu" ? metaButtonsFromMenu(message, interactive) : null;
          provider = await metaSend(a, orgId, target, mb ? mb.body : (interactive?.style === "menu" ? interactiveAsMenuText(message, interactive) : interactiveAsText(message, interactive)), null, null, null, null, null, mb ? mb.interactive : null);
          usedProvider = mb ? "meta_buttons" : "meta_reply";
        } catch (me) {
          metaError = me instanceof Error ? me.message : String(me);
          await trace(a, orgId, conversationId, agentKey, "meta_reply_failed_fallback_evolution", { reason: "meta_failed", error: metaError });
          provider = await evolutionSendSmart(a, orgId, target, interactive, message, delay, b.typing_indicator === true, image, caption, document, fileName);
          usedProvider = "evolution_fallback";
        }
      } else if (providerName === "waha") {
        const typingSeconds = automated && !proactive && agentKey !== "system" ? (delay > 0 ? delay : Math.max(3, Math.min(10, Math.round(String(message).length / 30)))) : 0;
        provider = await wahaSend(a, orgId, conversationId, target, interactive?.style === "menu" ? message : interactiveAsText(message, interactive), image, caption, document, fileName, interactive, typingSeconds);
      } else if (providerName === "meta") {
        let template: { name: string } | null = null;
        if (!humanRequested && (proactive || automatedPrefix) && !image && !document) {
          const w = await metaWindow(a, orgId, conversationId, target);
          if (!w.open) template = { name: w.name };
        }
        try { provider = await metaSend(a, orgId, target, message, image, caption, document, fileName, template, template ? null : interactive); if (template) usedProvider = "meta_template"; }
        catch (me) {
          metaError = me instanceof Error ? me.message : String(me);
          const fallbackOn = b.allow_provider_fallback !== false && (await runtimeSecret(a, "meta_fallback_uazapi")).toLowerCase() !== "false";
          if (!fallbackOn) throw me;
          await trace(a, orgId, conversationId, agentKey, "meta_failed_fallback_uazapi", { reason: "meta_failed", error: metaError });
          provider = await uazapiSend(a, orgId, target, (interactive?.style === "menu" ? interactiveAsMenuText(message, interactive) : interactiveAsText(message, interactive)), 0, image, caption, document, fileName);
          usedProvider = "uazapi_fallback";
        }
      } else if (providerName === "uazapi") {
        // v111: resposta da Helena sem espera artificial longa: "digitando…" curto (ou "gravando…" + voz para quem prefere áudio).
        const reactiveU = automated && !humanRequested && !image && !document && (!proactive || (answeringInbound && !(await metaTestBlocked(a, target))));
        const pref = reactiveU && !interactive ? await contactPreference(a, orgId, target) : "";
        const refusesAudio = Boolean(pref) && /n[aã]o (consigo|posso|tenho como)[^.!?]{0,30}[aá]udio|tecnicamente[^.!?]{0,30}[aá]udio/i.test(formatted.parsedReply);
        const saySrc = refusesAudio ? "Claro! Vou responder por áudio. Como posso te ajudar agora?" : formatted.parsedReply;
        const textOut = refusesAudio ? saySrc : message;
        const voiceFirst = pref ? await uazapiVoice(a, orgId, target, saySrc) : null;
        if (voiceFirst && pref === "audio") { provider = voiceFirst; usedProvider = "uazapi_voice"; }
        else {
          let dl = delay;
          if (reactiveU) {
            const typingMs = Math.max(1200, Math.min(4000, String(textOut).length * 25));
            await uazapiPresence(a, target, "composing", typingMs);
            await sleepMs(typingMs);
            dl = 0;
          }
          provider = ((!image && !document ? await uazapiSendMenu(a, orgId, target, interactive, textOut, dl) : null) ?? await uazapiSend(a, orgId, target, (interactive?.style === "menu" ? interactiveAsMenuText(textOut, interactive) : interactiveAsText(textOut, interactive)), dl, image, caption, document, fileName));
          if (voiceFirst) usedProvider = "uazapi_text_voice";
        }
      } else provider = await evolutionSendSmart(a, orgId, target, interactive, message, delay, b.typing_indicator === true, image, caption, document, fileName);
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: true, reason: "sent_" + usedProvider + (metaError ? " | meta:" + metaError.slice(0, 120) : ""), body_preview: previewForLog(message, 240), idempotency_key: key });
      const externalId = String(provider?.messageid || provider?.key?.id || provider?.zaapId || provider?.messageId || provider?.id || "") || null;
      if (conversationId && automated) {
        try {
          await a.from("whatsapp_messages").insert({ org_id: orgId, conversation_id: conversationId, direction: "outbound", message_type: document && /^data:audio\//i.test(document) ? "audio" : document ? "document" : image ? "image" : "text", body: formatted.parsedReply, status: "sent", sent_at: new Date().toISOString(), external_message_id: externalId, metadata: { source: "ai_agent", agent_key: agentKey, file_name: fileName, provider: usedProvider } });
          await a.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: previewForLog(formatted.parsedReply, 120), updated_at: new Date().toISOString() }).eq("id", conversationId);
        } catch (e) { console.error("history_insert", e); }
      }
      return json({ ok: true, allowed: true, provider: usedProvider, meta_error: metaError || undefined, phone: digits(target), external_message_id: externalId, provider_response: provider, parsed_reply: formatted.parsedReply, formatted_reply: message });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: providerName + "_send_failed:" + err.slice(0, 180), body_preview: previewForLog(message, 240), idempotency_key: key });
      await trace(a, orgId, conversationId, agentKey, "provider_error", { reason: providerName + "_send_failed", error: err });
      return json({ ok: false, error: err }, 502);
    }
  } catch (e) {
    console.error("whatsapp-outbound-gate", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

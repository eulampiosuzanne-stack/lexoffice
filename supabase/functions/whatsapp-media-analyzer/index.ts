import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// v5 (29/09/2026): Gemini primeiro (OpenAI sem crédito); OpenAI só como reserva.
// áudio -> transcrição; imagem/PDF -> leitura. Não armazena o arquivo.
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json"}});
const db=()=>createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
async function vault(org:string,p:string){try{const {data}=await db().rpc("read_integration_secret",{p_org_id:org,p_provider:p});return String(data||"").trim()}catch{return ""}}
function b64(a:ArrayBuffer){let s="";const u=new Uint8Array(a);for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s)}
async function usage(org:string,provider:string,model:string,purpose:string,ok:boolean,chars:number){try{await db().from("ai_usage_events").insert({org_id:org,provider,model,purpose:'whatsapp_media_'+purpose,output_chars:chars,estimated:true,success:ok})}catch{}}
const AUDIO_PROMPT="Transcreva fielmente, em português, o áudio enviado por um cliente pelo WhatsApp. Devolva somente a transcrição, sem comentários.";
const IMG_PROMPT="Você está lendo uma imagem enviada por um cliente pelo WhatsApp a um escritório de advocacia. Diga em 1 linha o que é (ex.: comprovante de pagamento PIX, RG, CNH, comprovante de residência, laudo, print de conversa, foto). Depois transcreva os dados relevantes visíveis (nomes, datas, valores, números de documento, instituição). Se for comprovante de pagamento, destaque VALOR, DATA, PAGADOR e RECEBEDOR. Não invente nada; se algo estiver ilegível, diga que está ilegível. Máximo de 12 linhas.";
const VIDEO_PROMPT="Analise o vídeo curto enviado por um cliente ao escritório de advocacia. Descreva apenas o que é perceptível nas imagens e no áudio, se houver. Identifique fatos, falas, textos, datas e valores somente quando legíveis ou audíveis. Não presuma identidades, intenção, autoria, culpa ou autenticidade. Se a gravação não permitir concluir algo, informe a limitação. Máximo de 12 linhas.";
const PDF_PROMPT="Você está lendo um PDF enviado por um cliente pelo WhatsApp a um escritório de advocacia. Diga em 1 linha que tipo de documento é. Depois resuma o conteúdo relevante: partes, datas, valores, prazos, números de processo e o que o documento pede ou decide. Se for comprovante de pagamento, destaque VALOR, DATA, PAGADOR e RECEBEDOR. Não invente nada. Máximo de 15 linhas.";
async function gemini(key:string,prompt:string,mime:string,data:string){
  let last:any=null;
  for(const model of ['gemini-flash-latest','gemini-3.5-flash','gemini-flash-lite-latest']){
    try{
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:mime,data}}]}],generationConfig:{maxOutputTokens:4096,temperature:0.1}})});
      const d=await r.json().catch(()=>null);
      if(r.ok){const text=(d?.candidates?.[0]?.content?.parts||[]).filter((p:any)=>!p.thought).map((p:any)=>p.text||'').join('').trim();if(text)return {ok:true,model,text};last={ok:false,model,error:'gemini_empty'};continue}
      last={ok:false,model,error:`gemini_${r.status}: ${d?.error?.message||''}`};
      if(![429,500,503,404].includes(r.status))break;
    }catch(e){last={ok:false,model,error:String(e)}}
  }
  return last||{ok:false,error:'gemini_failed'};
}
async function openaiAudio(key:string,buf:ArrayBuffer,mime:string){const fd=new FormData();fd.append("model","gpt-4o-mini-transcribe");fd.append("language","pt");const ext=mime.includes("mpeg")?"mp3":mime.includes("mp4")||mime.includes("m4a")?"m4a":mime.includes("wav")?"wav":"ogg";fd.append("file",new Blob([buf],{type:mime||"audio/ogg"}),`audio.${ext}`);const r=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+key},body:fd});const d=await r.json().catch(()=>null);if(!r.ok)return {ok:false,error:d?.error?.message||"transcription_failed"};const text=String(d?.text||"").trim();return {ok:!!text,text}}
async function openaiRead(key:string,prompt:string,part:any){const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5-mini",reasoning:{effort:"low"},max_output_tokens:2500,input:[{role:"user",content:[{type:"input_text",text:prompt},part]}]})});const d=await r.json().catch(()=>null);if(!r.ok)return {ok:false,error:d?.error?.message||"analysis_failed"};const text=String(d?.output_text||d?.output?.flatMap((o:any)=>o.content||[]).map((c:any)=>c.text||"").join("")||"").trim();return {ok:!!text,text}}
Deno.serve(async req=>{try{
 const svc=(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"").trim();
 if((req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim()!==svc)return J({ok:false,error:"unauthorized"},401);
 const x=await req.json(),url=String(x.url||""),type=String(x.type||"document"),org=String(x.org_id||"");
 if(!url||!org)return J({ok:false,error:"media_missing"},400);
 const gkey=(await vault(org,'gemini_api'))||(Deno.env.get('GEMINI_API_KEY')||'').trim();
 const okey=(await vault(org,'openai_api'))||(Deno.env.get('OPENAI_API_KEY')||'').trim();
 if(!gkey&&!okey)return J({ok:false,error:"ai_key_missing"},503);
 const fr=await fetch(url);if(!fr.ok)return J({ok:false,error:"media_download_"+fr.status},400);
 let mime=(fr.headers.get("content-type")||String(x.mime||"")||"application/octet-stream").split(";")[0].trim();
 const buf=await fr.arrayBuffer();if(buf.byteLength>18*1024*1024)return J({ok:false,error:"media_too_large"},413);
 const isAudio=type==="audio";
 const isPdf=!isAudio&&type==="document"&&(mime==="application/pdf"||/\.pdf$/i.test(String(x.filename||"")));
 const isImage=!isAudio&&(type==="image"||mime.startsWith("image/"));
 const isVideo=type==="video"&&["video/mp4","video/webm","video/quicktime"].includes(mime);
 if(!isAudio&&!isPdf&&!isImage&&!isVideo)return J({ok:false,error:"unsupported_type",mime},415);
 if(isImage&&!mime.startsWith("image/"))mime="image/jpeg";
 if(isPdf)mime="application/pdf";
 if(isAudio&&!mime.startsWith("audio/"))mime="audio/ogg";
 const kind=isAudio?'audio':isImage?'image':isVideo?'video':'pdf';
 const data=b64(buf);
 const prompt=isAudio?AUDIO_PROMPT:isImage?IMG_PROMPT:isVideo?VIDEO_PROMPT:PDF_PROMPT;
 let errors:string[]=[];
 if(gkey){const g:any=await gemini(gkey,prompt,mime,data);await usage(org,'gemini',g.model||'gemini',kind,!!g.ok,String(g.text||'').length);if(g.ok)return J({ok:true,kind,text:g.text,provider:'gemini'});errors.push(String(g.error||'gemini_failed'))}
 if(okey&&!isVideo){const o:any=isAudio?await openaiAudio(okey,buf,mime):await openaiRead(okey,prompt,isImage?{type:"input_image",image_url:`data:${mime};base64,${data}`}:{type:"input_file",filename:String(x.filename||"documento.pdf"),file_data:`data:application/pdf;base64,${data}`});await usage(org,'openai',isAudio?'gpt-4o-mini-transcribe':'gpt-5-mini',kind,!!o.ok,String(o.text||'').length);if(o.ok)return J({ok:true,kind,text:o.text,provider:'openai'});errors.push(String(o.error||'openai_failed'))}
 return J({ok:false,error:errors.join(' | ')},502);
}catch(e){return J({ok:false,error:e instanceof Error?e.message:String(e)},500)}});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const admin=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});

async function context(req:Request){
  const auth=req.headers.get('authorization')||'';
  const token=auth.replace(/^Bearer\s+/i,'').trim();
  if(!token)throw new Error('UNAUTHORIZED');
  const a=admin();
  const {data,error}=await a.auth.getUser(token);
  if(error||!data.user)throw new Error('UNAUTHORIZED');
  const {data:p}=await a.from('profiles').select('org_id,status').eq('id',data.user.id).maybeSingle();
  if(!p?.org_id||p.status!=='active')throw new Error('FORBIDDEN');
  return {a,orgId:String(p.org_id)};
}

async function geminiKey(a:any,orgId:string){
  try{
    const {data}=await a.rpc('read_integration_secret',{p_org_id:orgId,p_provider:'gemini_api'});
    const key=String(data||'').trim();
    if(key)return key;
  }catch{}
  return (Deno.env.get('GEMINI_API_KEY')||Deno.env.get('GOOGLE_GEMINI_API_KEY')||'').trim();
}

function stripFence(s:string){return s.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim()}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({ok:false,error:'Método inválido'},405);
  try{
    const {a,orgId}=await context(req);
    const b=await req.json().catch(()=>({}));
    const calculator=String(b.calculator||'').trim();
    const fileName=String(b.file_name||'documento.pdf').trim();
    const pdfBase64=String(b.pdf_base64||'').trim();
    const fields=Array.isArray(b.fields)?b.fields:[];
    if(!calculator||!pdfBase64||!fields.length)return json({ok:false,error:'Dados insuficientes para o autopreenchimento.'},400);
    if(pdfBase64.length>12_000_000)return json({ok:false,error:'PDF muito grande. Use um arquivo de até aproximadamente 8 MB.'},413);

    const key=await geminiKey(a,orgId);
    if(!key)return json({ok:false,error:'Leitor inteligente de PDF não configurado.'},503);

    const prompt=`Você é um extrator de dados jurídicos para preenchimento de calculadoras do LEXOFFICE. Leia o PDF e preencha SOMENTE informações explicitamente presentes no documento. Não invente, não estime e não complete lacunas.\n\nCalculadora: ${calculator}\nArquivo: ${fileName}\nCampos disponíveis: ${JSON.stringify(fields)}\n\nRetorne APENAS JSON válido no formato {"values":{"RÓTULO_EXATO":"valor"},"found":0,"notes":""}. Regras: use exatamente os rótulos recebidos; omita campos não encontrados; números sem R$ e sem separador de milhar, usando ponto decimal; datas em YYYY-MM-DD; para select use exatamente um dos optionValue fornecidos; preserve texto útil em campos text/textarea. Se houver valores conflitantes, omita o campo e explique em notes.`;

    const model=(Deno.env.get('GEMINI_MODEL')||'gemini-2.5-flash').trim();
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:'application/pdf',data:pdfBase64}}]}],generationConfig:{temperature:0,maxOutputTokens:2200,responseMimeType:'application/json'}})
    });
    const out=await r.json().catch(()=>null);
    if(!r.ok)return json({ok:false,error:`Falha ao ler o PDF (${r.status}).`,detail:out?.error?.message||null},502);
    const text=String(out?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('')||'').trim();
    if(!text)return json({ok:false,error:'Nenhum dado foi extraído do PDF.'},422);

    let parsed:any;
    try{parsed=JSON.parse(stripFence(text))}catch{return json({ok:false,error:'Não foi possível interpretar os dados extraídos do PDF.'},422)}
    const allowed=new Set(fields.map((f:any)=>String(f.label||'')));
    const values:any={};
    for(const [label,value] of Object.entries(parsed?.values||{})){
      if(allowed.has(label)&&value!==null&&value!==undefined&&String(value).trim()!=='')values[label]=String(value);
    }
    return json({ok:true,values,found:Object.keys(values).length,notes:String(parsed?.notes||'')});
  }catch(e){
    const m=e instanceof Error?e.message:String(e);
    if(m==='UNAUTHORIZED')return json({ok:false,error:'Não autorizado'},401);
    if(m==='FORBIDDEN')return json({ok:false,error:'Usuário sem acesso ao escritório'},403);
    return json({ok:false,error:m},500);
  }
});

// Sherlocker public-source connectors. No private-person enumeration or unrestricted URL fetching.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const headers={"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"POST, OPTIONS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const sources={
 pncp:"https://pncp.gov.br/api/consulta/v1/contratos",
 wayback:"https://web.archive.org/cdx/search/cdx",
};
function safeDomain(v:string){try{const u=new URL(v.includes("://")?v:"https://"+v);if(u.protocol!=="https:"||u.username||u.password||u.port||!u.hostname.includes(".")||/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname))throw Error();return u.hostname.toLowerCase()}catch{throw Error("Domínio inválido")}}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return reply({error:"Método não permitido"},405);
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return reply({error:"Autenticação necessária"},401);
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
 const {data:{user},error}=await supabase.auth.getUser(auth.slice(7));
 if(error||!user)return reply({error:"Sessão inválida"},401);
 let body:any;try{body=await req.json()}catch{return reply({error:"JSON inválido"},400)}
 const engine=String(body?.engine||"");
 let url:URL;
 try{
  if(engine==="wayback"){
   const domain=safeDomain(String(body?.domain||""));
   url=new URL(sources.wayback);url.searchParams.set("url",domain+"/*");url.searchParams.set("output","json");url.searchParams.set("filter","statuscode:200");url.searchParams.set("collapse","urlkey");url.searchParams.set("limit","20");url.searchParams.set("fl","timestamp,original,statuscode,mimetype");
  }else if(engine==="pncp"){
   const start=String(body?.start||""),end=String(body?.end||"");
   if(!/^\d{8}$/.test(start)||!/^\d{8}$/.test(end)||start>end)throw Error("Informe datas AAAAMMDD válidas");
   url=new URL(sources.pncp);url.searchParams.set("dataInicial",start);url.searchParams.set("dataFinal",end);url.searchParams.set("pagina","1");url.searchParams.set("tamanhoPagina","20");
  }else return reply({error:"Motor não suportado"},400);
 }catch(e){return reply({error:String((e as Error).message)},400)}
 try{
  const response=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)return reply({engine,status:"source_unavailable",http_status:response.status,source:url.origin},502);
  const raw=await response.text();if(raw.length>1500000)return reply({error:"Resposta excede limite"},502);
  return reply({engine,status:"completed",source:url.origin,retrieved_at:new Date().toISOString(),data:JSON.parse(raw),disclaimer:"Dados públicos; confirme a fonte e a identidade antes de conclusões jurídicas."});
 }catch{return reply({engine,status:"source_unavailable",error:"Fonte indisponível ou resposta inválida"},502)}
});

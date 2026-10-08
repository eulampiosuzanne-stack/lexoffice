import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleDonnaDailyBrief } from "./donna-daily-brief.ts";
import { handleVipInboundMessage } from "./vip-inbound.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-donna-token, x-vip-token","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  // Rota exclusiva do briefing interno. O endpoint legado continua respondendo 410.
  if(req.method==="POST" && req.headers.has("x-donna-token")) return handleDonnaDailyBrief(req);
  if(req.method==="POST" && req.headers.has("x-vip-token")) return handleVipInboundMessage(req);
  return new Response(JSON.stringify({ok:false,error:"Canal legado desativado por segurança. Use a conexão WhatsApp vinculada ao usuário no LEXOFFICE."}),{status:410,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
});

export const WHATSAPP_AGENT_HEADER='⚖️ *Clara | Suzanne Figueiredo Advocacia* ⚖️';

const HEADER_RE=/^\s*⚖️?\s*\*{0,2}\s*Clara\s*\|\s*Suzanne\s+Figueiredo\s+Advocacia\s*\*{0,2}\s*⚖️?\s*[:\-–—]?\s*/i;
const SUPPORT_RE=/^\s*(suporte|support)\s*:\s*/i;
const TRAILING_SIGNATURE_RE=/\n\s*(?:⚖️?\s*)?\*{0,2}\s*Clara\s*\|\s*Suzanne\s+Figueiredo\s+Advocacia\s*\*{0,2}\s*⚖️?\s*$/i;

function tryExtractJsonReply(value){
  const text=String(value??'').trim();
  if(!text)return '';
  const unfenced=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try{
    const parsed=JSON.parse(unfenced);
    if(parsed&&typeof parsed==='object'&&typeof parsed.reply==='string')return parsed.reply;
  }catch{}
  return text;
}

export function parseWhatsAppAgentReply(raw){
  let reply=tryExtractJsonReply(raw).replace(/\r\n?/g,'\n').trim();
  for(let i=0;i<4;i++){
    const next=reply.replace(HEADER_RE,'').replace(SUPPORT_RE,'').trim();
    if(next===reply)break;
    reply=next;
  }
  reply=reply.replace(TRAILING_SIGNATURE_RE,'').trim();
  reply=reply.replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  return reply;
}

export function formatWhatsAppAgentReply(raw,{includeHeader=true}={}){
  const parsedReply=parseWhatsAppAgentReply(raw);
  if(!parsedReply)return {rawAgentOutput:String(raw??''),parsedReply:'',formattedReply:''};
  const formattedReply=includeHeader?`${WHATSAPP_AGENT_HEADER}\n\n${parsedReply}`:parsedReply;
  return {rawAgentOutput:String(raw??''),parsedReply,formattedReply};
}

export function previewForLog(value,max=500){
  const text=String(value??'').replace(/\s+/g,' ').trim();
  return text.length>max?text.slice(0,max)+'…':text;
}

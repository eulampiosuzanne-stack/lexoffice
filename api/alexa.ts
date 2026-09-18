import { createHash, timingSafeEqual } from 'node:crypto';
import { SkillRequestSignatureVerifier, TimestampVerifier } from 'ask-sdk-express-adapter';
import getRawBody from 'raw-body';

export const config = {
  api: { bodyParser: false },
};

const ENDPOINT_TOKEN_SHA256 = '2a97efb44928dc858f60f1ef37dd4a857d4189c2ab5aad20728e797a8e249903';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dcpwcuototomxoiszukt.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_h1gal1BQha__PKo2_wxY_Q_wZfAqoEm';

type HistoryItem = { role: 'user' | 'assistant'; text: string };
type PendingSend = { clientId: string; clientName: string; phone: string; message?: string };
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ALEXA_ORG_ID = process.env.ALEXA_ORG_ID || '';

async function db(path: string, init: RequestInit = {}) {
  if (!SERVICE_KEY) throw new Error('alexa_service_key_missing');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`supabase_${response.status}`);
  return data;
}
function normalizeName(v:string){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function extractSendTarget(message:string){
  const m=message.match(/(?:envie|manda|mande|enviar|mandar)(?:\s+uma)?\s+mensagem\s+(?:para|pra|pro|à|ao)\s+(.+)/i);
  return m?.[1]?.replace(/[.!?]+$/,'').trim()||'';
}
async function findClientsByName(name:string){
  if(!ALEXA_ORG_ID) throw new Error('alexa_org_id_missing');
  const term=encodeURIComponent(`*${name.trim()}*`);
  const rows=await db(`clients?org_id=eq.${encodeURIComponent(ALEXA_ORG_ID)}&status=eq.active&name=ilike.${term}&select=id,name,phone,whatsapp&limit=5`);
  return (Array.isArray(rows)?rows:[]).filter((x:any)=>String(x.whatsapp||x.phone||'').replace(/\D/g,''));
}
async function sendWhatsApp(p:PendingSend){
  if(!SERVICE_KEY||!ALEXA_ORG_ID) throw new Error('alexa_actions_not_configured');
  const response=await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-operator-send`,{method:'POST',headers:{Authorization:`Bearer ${SERVICE_KEY}`,apikey:SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify({org_id:ALEXA_ORG_ID,message:p.message,targets:[{phone:p.phone,name:p.clientName}],keep_ai_active:true})});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok||Number(data?.sent||0)!==1)throw new Error(data?.error||data?.results?.[0]?.error||'send_failed');
  return data;
}
function pendingFromSession(envelope:any):PendingSend|null{
  const p=envelope?.session?.attributes?.pendingSend;
  return p&&p.clientId&&p.clientName&&p.phone?p:null;
}

function sendJson(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function hasValidEndpointToken(req: any) {
  const token = new URL(req.url || '/', 'https://lexoffice.local').searchParams.get('token') || '';
  const actual = createHash('sha256').update(token).digest();
  const expected = Buffer.from(ENDPOINT_TOKEN_SHA256, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is HistoryItem => Boolean(item) && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string')
    .map((item) => ({ role: item.role, text: item.text.trim().slice(0, 900) }))
    .filter((item) => item.text)
    .slice(-8);
}

function alexaResponse(text: string, history: HistoryItem[] = [], shouldEndSession = false, extra: Record<string,unknown> = {}) {
  const spoken = text.trim().slice(0, 1100) || 'Não consegui responder agora.';
  return {
    version: '1.0',
    sessionAttributes: { history: history.slice(-8), ...extra },
    response: {
      outputSpeech: { type: 'PlainText', text: spoken },
      ...(shouldEndSession ? {} : {
        reprompt: { outputSpeech: { type: 'PlainText', text: 'O que você quer consultar ou recapitular?' } },
      }),
      shouldEndSession,
    },
  };
}

function cleanForVoice(value: string) {
  const compact = value
    .replace(/```[\s\S]*?```/g, ' conteúdo técnico omitido ')
    .replace(/https?:\/\/\S+/g, 'link disponível no LexOffice')
    .replace(/[*_#>`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length <= 1050) return compact;
  const shortened = compact.slice(0, 1050);
  const sentenceEnd = Math.max(shortened.lastIndexOf('.'), shortened.lastIndexOf('?'), shortened.lastIndexOf('!'));
  return `${sentenceEnd > 500 ? shortened.slice(0, sentenceEnd + 1) : shortened.trim()} Para continuar, faça outra pergunta.`;
}

async function askLexOffice(message: string, history: HistoryItem[]) {
  const transcript = history.length
    ? history.map((item) => `${item.role === 'user' ? 'Usuária' : 'Assistente'}: ${item.text}`).join('\n')
    : 'Ainda não há falas anteriores nesta sessão.';
  const recapRequested = /\b(resum|recapitul|retom|relembr)/i.test(message);
  const input = `${recapRequested ? 'A usuária pediu uma recapitulação objetiva.' : 'Responda à nova fala da usuária.'}\n\nConversa desta sessão:\n${transcript}\n\nNova fala: ${message}`;
  const instructions = [
    'Você é o canal de voz privado do LEXOFFICE para a advogada Suzanne.',
    'Responda em português do Brasil, em no máximo 70 palavras, com frases naturais para serem faladas pela Alexa.',
    'Use somente o conteúdo desta sessão. Não afirme ter consultado processos, clientes, agenda ou documentos quando esses dados não estiverem no texto.',
    'Nunca invente audiência, prazo, valor, andamento processual ou compromisso.',
    'Quando faltar um dado essencial, diga isso claramente e faça apenas uma pergunta por vez.',
    'Não use markdown, listas longas, URLs nem códigos.',
  ].join(' ');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-provider-gateway`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_key: 'client_service_triage', instructions, input, temperature: 0.2, max_output_tokens: 240 }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || !data?.text) throw new Error('ai_unavailable');
    return cleanForVoice(String(data.text));
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!hasValidEndpointToken(req)) return sendJson(res, 403, { error: 'forbidden' });

  let rawBody = '';
  try {
    rawBody = await getRawBody(req, { encoding: 'utf8', limit: '256kb' });
  } catch (error) {
    console.error('[alexa] raw_body_failed', error instanceof Error ? error.message : 'unknown');
    return sendJson(res, 400, { error: 'invalid_alexa_request' });
  }

  try {
    await new SkillRequestSignatureVerifier().verify(rawBody, req.headers);
  } catch (error) {
    console.error('[alexa] signature_verification_failed', error instanceof Error ? error.message : 'unknown', {
      hasSignature: Boolean(req.headers?.signature),
      hasCertChainUrl: Boolean(req.headers?.signaturecertchainurl),
      contentType: req.headers?.['content-type'] || null,
    });
    return sendJson(res, 400, { error: 'invalid_alexa_request' });
  }

  try {
    await new TimestampVerifier().verify(rawBody);
  } catch (error) {
    console.error('[alexa] timestamp_verification_failed', error instanceof Error ? error.message : 'unknown');
    return sendJson(res, 400, { error: 'invalid_alexa_request' });
  }

  let envelope: any;
  try {
    envelope = JSON.parse(rawBody);
  } catch (error) {
    console.error('[alexa] json_parse_failed', error instanceof Error ? error.message : 'unknown');
    return sendJson(res, 400, { error: 'invalid_alexa_request' });
  }

  try {
    const configuredSkillId = process.env.ALEXA_SKILL_ID?.trim();
    const requestSkillId = envelope?.context?.System?.application?.applicationId || envelope?.session?.application?.applicationId;
    if (configuredSkillId && requestSkillId !== configuredSkillId) {
      console.error('[alexa] skill_id_mismatch');
      return sendJson(res, 403, { error: 'invalid_skill' });
    }

    const request = envelope?.request || {};
    const history = normalizeHistory(envelope?.session?.attributes?.history);

    if (request.type === 'LaunchRequest') {
      console.info('[alexa] launch_request_ok');
      return sendJson(res, 200, alexaResponse('LexOffice conectado. Como posso ajudar?', history));
    }
    if (request.type === 'SessionEndedRequest') return sendJson(res, 200, { version: '1.0', response: {} });
    if (request.type !== 'IntentRequest') return sendJson(res, 200, alexaResponse('Não entendi esse pedido. Faça uma pergunta ou peça para recapitular.', history));

    const intentName = request.intent?.name;
    if (['AMAZON.CancelIntent', 'AMAZON.StopIntent', 'AMAZON.NavigateHomeIntent'].includes(intentName)) return sendJson(res, 200, alexaResponse('Conversa encerrada com privacidade.', history, true));
    if (intentName === 'AMAZON.HelpIntent') return sendJson(res, 200, alexaResponse('Diga, por exemplo: pergunte quais foram os pontos principais, ou: resuma nossa conversa.', history));
    if (intentName !== 'ConversaIntent') return sendJson(res, 200, alexaResponse('Faça uma pergunta ou peça para recapitular a conversa.', history));

    const message = String(request.intent?.slots?.mensagem?.value || '').trim();
    const pending = pendingFromSession(envelope);
    if (!message) return sendJson(res, 200, alexaResponse('Como posso ajudar?', history, false, pending?{pendingSend:pending}:{}));

    if (/^(cancelar|cancele|não envie|nao envie|desistir)$/i.test(message)) {
      return sendJson(res, 200, alexaResponse('Envio cancelado. Como posso ajudar?', history));
    }
    if (pending && !pending.message) {
      const prepared={...pending,message:message.slice(0,4000)};
      return sendJson(res,200,alexaResponse(`Vou enviar para ${pending.clientName} pelo WhatsApp cadastrado no LexOffice. Confirma o envio?`,history,false,{pendingSend:prepared}));
    }
    if (pending?.message) {
      if (/^(confirmo|confirmar|sim confirmo|pode enviar|envie)$/i.test(normalizeName(message))) {
        try { await sendWhatsApp(pending); return sendJson(res,200,alexaResponse('Mensagem enviada.',history)); }
        catch(error){ console.error('[alexa] whatsapp_send_failed',error instanceof Error?error.message:'unknown'); return sendJson(res,200,alexaResponse('Não consegui enviar a mensagem pelo WhatsApp. Nenhuma nova tentativa será feita sem sua confirmação.',history)); }
      }
      return sendJson(res,200,alexaResponse('O envio está aguardando confirmação. Diga confirmo para enviar ou cancelar para desistir.',history,false,{pendingSend:pending}));
    }
    const target=extractSendTarget(message);
    if(target){
      try{
        const clients=await findClientsByName(target);
        if(!clients.length)return sendJson(res,200,alexaResponse(`Não encontrei ${target} com WhatsApp cadastrado no LexOffice.`,history));
        if(clients.length>1)return sendJson(res,200,alexaResponse(`Encontrei mais de um cadastro para ${target}. Diga o nome completo do cliente antes de enviar.`,history));
        const client=clients[0], phone=String(client.whatsapp||client.phone||'').replace(/\D/g,'');
        return sendJson(res,200,alexaResponse(`Encontrei ${client.name} no LexOffice. Qual mensagem deseja enviar?`,history,false,{pendingSend:{clientId:client.id,clientName:client.name,phone}}));
      }catch(error){console.error('[alexa] client_lookup_failed',error instanceof Error?error.message:'unknown');return sendJson(res,200,alexaResponse('A consulta de clientes do LexOffice não está disponível agora.',history));}
    }

    try {
      const answer = await askLexOffice(message.slice(0, 1500), history);
      const updated = [...history, { role: 'user' as const, text: message.slice(0, 900) }, { role: 'assistant' as const, text: answer }].slice(-8);
      return sendJson(res, 200, alexaResponse(answer, updated));
    } catch (error) {
      console.error('[alexa] ai_gateway_failed', error instanceof Error ? error.message : 'unknown');
      return sendJson(res, 200, alexaResponse('A conexão de inteligência do LEXOFFICE não respondeu a tempo. Tente novamente em instantes.', history));
    }
  } catch (error) {
    console.error('[alexa] handler_failed', error instanceof Error ? error.message : 'unknown');
    return sendJson(res, 500, { error: 'alexa_handler_failed' });
  }
}

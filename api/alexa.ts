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

function alexaResponse(text: string, history: HistoryItem[] = [], shouldEndSession = false) {
  const spoken = text.trim().slice(0, 1100) || 'Não consegui responder agora.';
  return {
    version: '1.0',
    sessionAttributes: { history: history.slice(-8) },
    response: {
      outputSpeech: { type: 'PlainText', text: spoken },
      ...(shouldEndSession ? {} : {
        reprompt: {
          outputSpeech: { type: 'PlainText', text: 'O que você quer consultar ou recapitular?' },
        },
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
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_key: 'client_service_triage',
        instructions,
        input,
        temperature: 0.2,
        max_output_tokens: 240,
      }),
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

  try {
    const rawBody = await getRawBody(req, { encoding: 'utf8', limit: '256kb' });
    await new SkillRequestSignatureVerifier().verify(rawBody, req.headers);
    await new TimestampVerifier().verify(rawBody);

    const envelope = JSON.parse(rawBody);
    const configuredSkillId = process.env.ALEXA_SKILL_ID?.trim();
    const requestSkillId = envelope?.context?.System?.application?.applicationId || envelope?.session?.application?.applicationId;
    if (configuredSkillId && requestSkillId !== configuredSkillId) return sendJson(res, 403, { error: 'invalid_skill' });

    const request = envelope?.request || {};
    const history = normalizeHistory(envelope?.session?.attributes?.history);

    if (request.type === 'LaunchRequest') {
      return sendJson(res, 200, alexaResponse('LEXOFFICE conectado. Você pode fazer uma pergunta ou dizer: resuma nossa conversa.', history));
    }

    if (request.type === 'SessionEndedRequest') return sendJson(res, 200, { version: '1.0', response: {} });

    if (request.type !== 'IntentRequest') {
      return sendJson(res, 200, alexaResponse('Não entendi esse pedido. Faça uma pergunta ou peça para recapitular.', history));
    }

    const intentName = request.intent?.name;
    if (['AMAZON.CancelIntent', 'AMAZON.StopIntent', 'AMAZON.NavigateHomeIntent'].includes(intentName)) {
      return sendJson(res, 200, alexaResponse('Conversa encerrada com privacidade.', history, true));
    }
    if (intentName === 'AMAZON.HelpIntent') {
      return sendJson(res, 200, alexaResponse('Diga, por exemplo: pergunte quais foram os pontos principais, ou: resuma nossa conversa.', history));
    }
    if (intentName !== 'ConversaIntent') {
      return sendJson(res, 200, alexaResponse('Faça uma pergunta ou peça para recapitular a conversa.', history));
    }

    const message = String(request.intent?.slots?.mensagem?.value || '').trim();
    if (!message) return sendJson(res, 200, alexaResponse('O que você quer consultar ou recapitular?', history));

    try {
      const answer = await askLexOffice(message.slice(0, 1500), history);
      const updated = [...history, { role: 'user' as const, text: message.slice(0, 900) }, { role: 'assistant' as const, text: answer }].slice(-8);
      return sendJson(res, 200, alexaResponse(answer, updated));
    } catch {
      return sendJson(res, 200, alexaResponse('A conexão de inteligência do LEXOFFICE não respondeu a tempo. Tente novamente em instantes.', history));
    }
  } catch {
    return sendJson(res, 400, { error: 'invalid_alexa_request' });
  }
}

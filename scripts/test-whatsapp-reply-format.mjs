import assert from 'node:assert/strict';
import {formatWhatsAppAgentReply,parseWhatsAppAgentReply,WHATSAPP_AGENT_HEADER} from '../supabase/functions/_shared/whatsapp-reply-format.mjs';

const fmt=(x)=>formatWhatsAppAgentReply(x).formattedReply;

assert.equal(parseWhatsAppAgentReply('Boa tarde! Em que posso ajudar?'),'Boa tarde! Em que posso ajudar?');
assert.equal(fmt('Boa tarde! Em que posso ajudar?'),`${WHATSAPP_AGENT_HEADER}\n\nBoa tarde! Em que posso ajudar?`);

assert.equal(fmt('Vou verificar essa informação.'),`${WHATSAPP_AGENT_HEADER}\n\nVou verificar essa informação.`);

assert.equal(fmt('⚖️ Clara | Suzanne Figueiredo Advocacia ⚖️\n\nVou verificar essa informação.'),`${WHATSAPP_AGENT_HEADER}\n\nVou verificar essa informação.`);
assert.equal(fmt('⚖️ *Clara | Suzanne Figueiredo Advocacia* ⚖️\n\n⚖️ Clara | Suzanne Figueiredo Advocacia ⚖️\n\nVou verificar essa informação.'),`${WHATSAPP_AGENT_HEADER}\n\nVou verificar essa informação.`);

assert.equal(fmt('{"reply":"Resposta limpa.","agent_id":"triage"}'),`${WHATSAPP_AGENT_HEADER}\n\nResposta limpa.`);
assert.equal(fmt('```json\n{"reply":"Resposta limpa."}\n```'),`${WHATSAPP_AGENT_HEADER}\n\nResposta limpa.`);

assert.equal(parseWhatsAppAgentReply('Suporte:   Texto   \n\n\n  continuação'),'Texto\n\ncontinuação');

console.log('WhatsApp reply formatter: all regression scenarios passed.');

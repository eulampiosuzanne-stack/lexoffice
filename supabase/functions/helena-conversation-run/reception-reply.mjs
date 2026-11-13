import { receptionMessages } from './reception-messages.mjs';

export function receptionReply(message, appUrl) {
  const text = message.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/[.!?]+$/, '');
  const options = [
    [/^(?:agendamentos|opcoes de agendamento)$/, 'schedule_prompt'],
    [/^(?:quero atendimento juridico|quero falar sobre um novo caso|novo caso)$/, 'lead_topic'],
    [/^(?:como funciona a consulta|como agendar uma consulta paga)$/, 'lead_consultation'],
    [/^(?:quero falar com a equipe|quero atendimento humano|nao quero falar com (?:um )?robo)$/, 'human_request'],
    [/^(?:como acompanho minha solicitacao|onde acompanho minha solicitacao)$/, 'request_information'],
    [/^(?:parcerias?|quero propor uma parceria)$/, 'partnership'],
    [/^(?:assuntos? administrativos?|informacoes sobre o escritorio)$/, 'administrative'],
    [/^(?:atendimento geral|outra duvida)$/, 'clarify'],
    [/^(?:me cobraram errado|nao reconheco essa cobranca|contestar cobranca)$/, 'dispute'],
    [/^(?:urgencia|e urgente)$/, 'urgent_triage'],
    [/^(?:enviar documentos?|(?:quero|preciso) (?:enviar|mandar) (?:um documento|documentos|um pdf))$/, 'document_send'],
    [/^(?:receber documento|quero uma copia do documento)$/, 'document_copy'],
    [/^(?:meu processo|quero saber do meu processo|consultar meu processo)$/, 'case_access'],
    [/^(?:proxima audiencia|consultar minha audiencia)$/, 'hearing_access'],
    [/^(?:minhas parcelas|consultar meus pagamentos)$/, 'finance_access'],
    [/^(?:segunda via|quero (?:a )?segunda via)$/, 'second_copy'],
    [/^(?:ja paguei|ja fiz o pagamento)$/, 'payment_review'],
  ];
  const match = options.find(([pattern]) => pattern.test(text));
  if (!match) return '';
  const key = match[1];
  return ['payment_review', 'partnership', 'administrative', 'clarify', 'dispute', 'urgent_triage', 'schedule_prompt', 'lead_topic', 'lead_consultation', 'human_request'].includes(key) ? receptionMessages[key] : receptionMessages[key] + '\n\n' + appUrl;
}

import { receptionMessages } from './reception-messages.mjs';

export function receptionReply(message, appUrl) {
  const text = message.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/[.!?]+$/, '');
  const options = [
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
  return key === 'payment_review' ? receptionMessages[key] : receptionMessages[key] + '\n\n' + appUrl;
}

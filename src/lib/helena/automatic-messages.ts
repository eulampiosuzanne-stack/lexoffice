export type AutomaticMessage = { id: string; category: 'attendance'|'process'|'finance'|'relationship'; trigger: string; requiresReview: boolean; template: string };
const mk = (category: AutomaticMessage['category'], id: string, trigger: string, template: string, requiresReview = false): AutomaticMessage => ({ category, id, trigger, template, requiresReview });
export const HELENA_AUTOMATIC_MESSAGES: AutomaticMessage[] = [
  mk('attendance','welcome','first_contact','Olá! Sou Helena, do escritório Suzanne Figueiredo. Como podemos ajudar?'),
  mk('attendance','greeting','greeting_only','Olá! Escolha uma das opções do menu para começar.'),
  mk('attendance','client_identified','client_identified','Seu atendimento foi identificado. Como podemos ajudar?'),
  mk('attendance','new_lead','lead_identified','Para iniciar seu atendimento, vou registrar o assunto e orientar sobre a consulta.'),
  mk('attendance','other_subject','other_subject','Conte brevemente o assunto para direcionarmos seu contato.'),
  mk('attendance','after_hours','outside_business_hours','Recebemos sua mensagem fora do expediente. Nossa equipe dará continuidade no horário de atendimento.'),
  mk('attendance','lawyer_busy','lawyer_busy','A Dra. Suzanne está em atendimento. Você pode deixar um recado pelo aplicativo ou solicitar um agendamento.'),
  mk('attendance','lawyer_hearing','lawyer_in_hearing','A Dra. Suzanne está em audiência. Você pode deixar um recado pelo aplicativo ou solicitar um agendamento.'),
  mk('attendance','schedule_request','schedule_requested','Recebemos seu pedido de agendamento. Vamos verificar os horários disponíveis.'),
  mk('attendance','schedule_change','schedule_changed','Recebemos sua solicitação de alteração de horário. A confirmação será enviada após verificação.'),
  mk('process','case_distributed','case_distributed','Seu processo foi distribuído. Enviaremos os dados confirmados do protocolo após conferência.'),
  mk('process','case_number','case_number_confirmed','O número do processo já está disponível para consulta no aplicativo.'),
  mk('process','case_update','case_update_verified','Há uma nova movimentação confirmada no seu processo. Consulte o resumo no aplicativo.',true),
  mk('process','no_relevant_change','case_update_no_action','Registramos uma movimentação sem providência imediata identificada.'),
  mk('process','hearing_set','hearing_confirmed','Uma audiência foi designada. Confira os dados confirmados no aplicativo.',true),
  mk('process','hearing_reminder','hearing_reminder_due','Lembrete: confira no aplicativo os dados da audiência agendada.'),
  mk('process','client_action','client_action_required','Precisamos de uma providência sua. Consulte a solicitação no aplicativo.',true),
  mk('process','case_inactive','case_without_recent_update','Seu processo segue em acompanhamento. A ausência de movimentação recente não significa encerramento.'),
  mk('process','documents_requested','documents_requested','Solicitamos documentos para dar continuidade ao atendimento. Consulte a lista no aplicativo.'),
  mk('process','documents_received','documents_received','Recebemos seus documentos. O recebimento não significa que já foram analisados.'),
  mk('process','document_available','document_available','Um documento está disponível para consulta no aplicativo.'),
  mk('finance','finance_welcome','finance_onboarding','As informações sobre honorários e vencimentos estão disponíveis na área financeira.'),
  mk('finance','payment_soon','installment_due_soon','Há uma parcela próxima do vencimento. Confira os dados na área financeira.'),
  mk('finance','payment_today','installment_due_today','Uma parcela vence hoje. Consulte os dados para pagamento na área financeira.'),
  mk('finance','payment_overdue','installment_overdue','Identificamos uma parcela em aberto. Consulte a área financeira para verificar ou regularizar.'),
  mk('finance','pix_requested','payment_instructions_requested','Recebemos seu pedido de instruções de pagamento. Vamos conferir os dados antes do envio.'),
  mk('finance','receipt_received','payment_receipt_received','Recebemos seu comprovante. O pagamento ainda depende de confirmação.'),
  mk('finance','payment_confirmed','payment_confirmed','Seu pagamento foi confirmado em nosso sistema.'),
  mk('finance','payment_negotiation','payment_negotiation_requested','Recebemos sua proposta de regularização. Ela será analisada antes de qualquer confirmação.',true),
  mk('relationship','message_received','message_received','Seu recado foi registrado e encaminhado à equipe.'),
  mk('relationship','callback_requested','callback_requested','Recebemos sua solicitação de retorno. A equipe verificará a disponibilidade.'),
  mk('relationship','awaiting_reply','followup_due','Estamos acompanhando seu atendimento. Caso ainda precise de ajuda, responda a esta mensagem.'),
  mk('relationship','urgent_received','urgent_reported','Recebemos seu relato e o encaminhamos para avaliação prioritária. Em risco imediato, acione o serviço de emergência.'),
  mk('relationship','human_handoff','human_takeover','Seu atendimento foi encaminhado à equipe. A Helena ficará em pausa enquanto houver atendimento humano.'),
  mk('relationship','human_pause','human_cooldown','A equipe está conduzindo seu atendimento. As respostas automáticas permanecem pausadas.'),
  mk('relationship','satisfaction','case_service_completed','Gostaríamos de saber como foi seu atendimento. Sua opinião nos ajuda a melhorar.'),
];
export function validateAutomaticMessages(messages = HELENA_AUTOMATIC_MESSAGES): string[] {
  const ids = new Set<string>(); const errors: string[] = [];
  for (const item of messages) {
    if (ids.has(item.id)) errors.push(`duplicated:${item.id}`);
    ids.add(item.id);
    if (!item.trigger || !item.template || !item.category) errors.push(`incomplete:${item.id}`);
    if (/\{\{[^}]+\}\}/.test(item.template)) errors.push(`unresolved_placeholder:${item.id}`);
  }
  return errors;
}

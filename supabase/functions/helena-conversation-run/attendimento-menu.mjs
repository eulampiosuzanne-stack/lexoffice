export const WELCOME = 'Olá! 😊 Bem-vindo ao Suzanne Figueiredo Advocacia e Soluções Jurídicas. Como podemos ajudar?';
export const AWAY = 'Olá! Nosso expediente já encerrou, mas sua mensagem foi recebida. 💛 Se for uma situação de risco imediato à integridade física, procure o serviço de emergência. Para os demais assuntos, nossa equipe dará continuidade no próximo expediente.';
export const LAWYER_BUSY = 'A Dra. Suzanne está em atendimento agora. 😊 Você prefere verificar um horário para conversar com ela ou deixar um recado pelo nosso aplicativo?';

const item = (id, title, description) => ({ id, title, description });
export const INITIAL = [
  item('ident_cliente', 'Sou cliente', 'Já tenho atendimento com o escritório'),
  item('ident_lead', 'Não sou cliente', 'Desejo atendimento jurídico'),
  item('ident_outros', 'Outros assuntos', 'Informações, parcerias e assuntos administrativos'),
];
export const CLIENT = [
  item('client_process', 'Meu processo', 'Consultar andamentos com segurança'),
  item('client_docs', 'Enviar documentos', 'Usar o aplicativo do cliente'),
  item('client_finance', 'Financeiro', 'Consultar pagamentos e honorários'),
  item('client_meeting', 'Agendar atendimento', 'Verificar horários disponíveis'),
  item('client_lawyer', 'Falar com a Dra.', 'Solicitar reunião ou enviar recado'),
  item('client_urgent', 'Urgência', 'Informar o que está acontecendo'),
  item('client_other', 'Outros assuntos', 'Conversar com a Helena'),
];
export const OTHER = [
  item('other_partnership', 'Parcerias', 'Apresentar uma proposta de parceria'),
  item('other_admin', 'Assuntos administrativos', 'Informações sobre o escritório'),
  item('other_general', 'Atendimento geral', 'Conte como podemos ajudar'),
];

export function isGreeting(message) {
  return /^(?:(?:oi|ola|bom dia|boa tarde|boa noite|tudo bem)[ ,.!?]*)+$/i.test(message.trim());
}

export function routeMenuIntent(message, fallback) {
  if (message === 'meu processo') return 'client_process_updates';
  if (message === 'financeiro') return 'billing';
  if (['agendar atendimento', 'agendar reuniao', 'falar com a dra.'].includes(message)) return 'client_schedule_relationship';
  return fallback;
}

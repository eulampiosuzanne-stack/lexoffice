export type MenuOption = { id: string; title: string; description: string; emoji: string; next?: string; agent?: string };
export type Menu = { title: string; options: MenuOption[] };

const back: MenuOption = { id: 'menu', emoji: '↩️', title: 'Menu inicial', description: 'Voltar às opções principais', next: 'start' };
export const HELENA_MENUS: Record<string, Menu> = {
  start: { title: 'Olá! Sou Helena, concierge jurídica do escritório Suzanne Figueiredo. Como posso ajudar?', options: [
    { id: 'client', emoji: '👩‍⚖️', title: 'Sou cliente', description: 'Já tenho atendimento com o escritório', next: 'client_menu' },
    { id: 'new', emoji: '✨', title: 'Não sou cliente', description: 'Quero iniciar um atendimento', next: 'new_menu' },
    { id: 'other', emoji: '💬', title: 'Outros assuntos', description: 'Informações gerais e outros contatos', next: 'other_menu' },
  ] },
  client_menu: { title: 'Qual serviço você deseja?', options: [
    { id: 'process', emoji: '📂', title: 'Meus processos', description: 'Andamentos, audiências e próximos passos', next: 'process_menu' },
    { id: 'docs', emoji: '📄', title: 'Documentos', description: 'Enviar ou solicitar documentos', agent: 'client_service_triage' },
    { id: 'finance', emoji: '💳', title: 'Financeiro', description: 'Honorários, parcelas e comprovantes', agent: 'billing' },
    { id: 'schedule', emoji: '📅', title: 'Agendamentos', description: 'Marcar ou alterar atendimento', agent: 'client_schedule_relationship' },
    { id: 'urgent', emoji: '🚨', title: 'Urgência', description: 'Comunicar situação prioritária', agent: 'client_service_triage' },
    { id: 'lawyer', emoji: '👩‍⚖️', title: 'Falar com a Dra.', description: 'Solicitar agendamento com a advogada', agent: 'client_schedule_relationship' },
    back,
  ] },
  process_menu: { title: 'Como posso ajudar com seu processo?', options: [
    { id: 'latest', emoji: '🔔', title: 'Último andamento', description: 'Consultar atualização confirmada', agent: 'client_process_updates' },
    { id: 'hearing', emoji: '🗓️', title: 'Próxima audiência', description: 'Consultar data e orientações', agent: 'client_process_updates' },
    { id: 'question', emoji: '💬', title: 'Tirar uma dúvida', description: 'Perguntar sobre seu processo', agent: 'client_process_updates' },
    { id: 'back', emoji: '↩️', title: 'Voltar', description: 'Serviços para clientes', next: 'client_menu' },
    back,
  ] },
  new_menu: { title: 'Como podemos ajudar?', options: [
    { id: 'consult', emoji: '📅', title: 'Agendar consulta', description: 'Triagem e orientações sobre consulta paga', agent: 'client_service_triage' },
    { id: 'newcase', emoji: '⚖️', title: 'Novo caso', description: 'Informar o assunto jurídico', agent: 'client_service_triage' },
    { id: 'fees', emoji: '💳', title: 'Valores de consulta', description: 'Conhecer as condições de atendimento', agent: 'client_service_triage' },
    back,
  ] },
  other_menu: { title: 'Sobre o que deseja falar?', options: [
    { id: 'message', emoji: '✉️', title: 'Deixar recado', description: 'Registrar mensagem para a equipe', agent: 'client_service_triage' },
    { id: 'partnership', emoji: '🤝', title: 'Parcerias', description: 'Propostas e contatos profissionais', agent: 'client_service_triage' },
    { id: 'general', emoji: 'ℹ️', title: 'Informações', description: 'Horários e canais de atendimento', agent: 'client_service_triage' },
    back,
  ] },
};

export function validateHelenaMenus(menus: Record<string, Menu> = HELENA_MENUS): string[] {
  const errors: string[] = [];
  for (const [key, menu] of Object.entries(menus)) {
    if (menu.options.length > 10) errors.push(`${key}: mais de 10 opções`);
    const ids = new Set<string>();
    for (const option of menu.options) {
      if (ids.has(option.id)) errors.push(`${key}: id duplicado ${option.id}`);
      ids.add(option.id);
      if (!option.title || !option.description || !option.emoji) errors.push(`${key}: opção incompleta ${option.id}`);
      if (option.next && !menus[option.next]) errors.push(`${key}: destino inexistente ${option.next}`);
      if (Boolean(option.next) === Boolean(option.agent)) errors.push(`${key}: destino ambíguo ${option.id}`);
    }
  }
  return errors;
}

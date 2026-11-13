// Regras e textos do chatbot (sem dependências — testáveis em qualquer ambiente).
export const D = (v: any) => String(v ?? "").replace(/\D/g, "");
// ---------- textos aprovados ----------
export const TXT = {
  welcome: "Seja bem-vindo(a) ao escritório *Suzanne Figueiredo Advocacia e Soluções Jurídicas*.\n\nSelecione uma opção para direcionarmos seu atendimento.",
  client: (n: string) => `😊 Que bom ter você por aqui${n ? ", " + n : ""}! Sobre o que deseja falar?`,
  processGeneric: "📌 Seu processo segue em andamento normal. Você não precisa fazer nada agora.\n\nHavendo novidade importante, avisaremos por aqui.",
  processApproved: (cnj: string, date: string, msg: string) => `⚖️ Processo ${cnj}\n📅 Atualização de ${date}:\n\n${msg}\n\n✅ Você não precisa fazer nada agora.`,
  docs: "📎 Pode enviar o documento por aqui mesmo.\n\n✅ A equipe confirma o recebimento em até 1 dia útil.",
  docsReceived: "✅ Documento recebido! A equipe confirma em até 1 dia útil.",
  fees: "💼 A equipe vai enviar a sua posição financeira atualizada em até 1 dia útil.",
  lookup: "🔎 Não localizei seu cadastro por este telefone.\n\nPor favor, envie seu *nome completo* e o *número do processo* (se tiver), numa mensagem só.",
  lookupNotFound: "📋 Obrigada! A equipe vai conferir seu cadastro e retorna em até 1 dia útil.",
  areas: "✨ Será um prazer conhecer o seu caso! Qual é a área?",
  leadName: "📝 Por favor, informe seu *nome completo*.",
  leadNameRetry: "Não consegui identificar o nome. Por favor, envie seu *nome completo*.",
  leadDesc: "✍️ Em poucas palavras, conte o que aconteceu e como podemos ajudar.",
  leadDescRetry: "Por favor, descreva o assunto em poucas palavras para encaminharmos corretamente.",
  leadNext: (n: string) => `🙏 Obrigada${n ? ", " + n : ""}! A Dra. Suzanne atende por *consulta agendada*, para dar ao seu caso a atenção que ele merece.\n\nComo prefere seguir?`,
  leadSchedule: "📅 Perfeito! A equipe envia os horários disponíveis para a consulta em até 1 dia útil.",
  leadWait: "⏰ Combinado! A equipe entra em contato em até 1 dia útil.",
  leadIsClient: "😊 Identificamos que você já é nosso cliente. Vou te mostrar as opções de atendimento.",
  other: "✍️ Escreva em poucas palavras o que você precisa.\n\n📬 A equipe lê e retorna em até 1 dia útil.",
  otherRetry: "Por favor, escreva um breve resumo para eu registrar.",
  received: "✅ Recebido, obrigada! Retornamos em até 1 dia útil.",
  afterHours: "🌙 Nosso atendimento é de segunda a sexta, das 8h às 18h. Sua mensagem foi registrada e respondemos no próximo dia útil.\n\nAtendimentos fora do horário têm *taxa adicional*.",
  afterNext: "✅ Combinado! Retornamos no próximo dia útil.",
  afterUrgent: "🚨 Recebido. A Dra. Suzanne foi avisada agora.\n\nLembramos que o atendimento fora do horário tem taxa adicional.",
  vip: (n: string) => `Oi${n ? ", " + n : ""}!\n\nJá vi sua mensagem.\n\nA Dra. Suzanne continua com você por aqui.`,
  urgentPrompt: "🚨 Atendimento prioritário. Por gentileza, descreva brevemente o ocorrido e informe se existe risco imediato ou prazo judicial próximo.",
  draPrompt: "Para direcionar sua solicitação à Dra. Suzanne, selecione uma das opções.",
  draSchedule: "As reuniões com a Dra. Suzanne são realizadas de segunda a sexta-feira, das 13h às 18h, mediante disponibilidade. Seu pedido será encaminhado para consulta da agenda.",
  draMessage: "Escreva sua mensagem para a Dra. Suzanne. O recado será registrado e encaminhado para apreciação.",
  call: "📞 Seu pedido de ligação foi registrado. A equipe retorna em até 1 dia útil.",
  chooseOption: "Por favor, escolha uma das opções abaixo 👇",
};

export const MENU = {
  root: [{ id: "m1_sou_cliente", title: "Sou cliente" }, { id: "m1_nao_sou_cliente", title: "Não sou cliente" }, { id: "m1_outros", title: "Outros assuntos" }],
  client: [{ id: "client_last_movement", title: "Meu processo", description: "Consultar atualizações disponíveis" }, { id: "client_documents", title: "Enviar documentos", description: "Encaminhar arquivos e comprovantes" }, { id: "client_fees", title: "Financeiro", description: "Honorários, parcelas e pagamentos" }, { id: "client_urgent", title: "Urgência", description: "Solicitar atenção prioritária" }, { id: "client_dra", title: "Falar com Dra. Suzanne", description: "Agendamento ou recado" }],
  dra: [{ id: "dra_schedule", title: "Agendar reunião", description: "Reuniões das 13h às 18h" }, { id: "dra_message", title: "Deixar recado", description: "Enviar mensagem à advogada" }, { id: "menu_client", title: "Voltar", description: "Retornar ao menu de clientes" }],
  areas: [{ id: "lead_area_health", title: "🏥 Saúde e planos" }, { id: "lead_area_consumer", title: "🛒 Consumidor" }, { id: "lead_area_civil", title: "🏠 Cível e família" }, { id: "lead_area_admin", title: "🏛️ Administrativo" }, { id: "lead_area_other", title: "📄 Outra área" }],
  leadNext: [{ id: "lead_schedule", title: "Agendar consulta" }, { id: "lead_wait", title: "Aguardar contato" }],
  after: [{ id: "afterhours_next", title: "Retorno no horário" }, { id: "afterhours_urgent", title: "Urgente aceito taxa" }],
};
export const AREA: Record<string, string> = { lead_area_health: "Saúde e planos", lead_area_consumer: "Consumidor", lead_area_civil: "Cível e família", lead_area_admin: "Administrativo", lead_area_other: "Outra área" };
// ids antigos (conversas em andamento) → equivalentes novos
export const OLD_IDS: Record<string, string> = {
  sou_cliente: "m1_sou_cliente", cliente: "m1_sou_cliente", menu_cliente: "m1_sou_cliente", ja_cliente: "m1_sou_cliente",
  nao_sou_cliente: "m1_nao_sou_cliente", novo_cliente: "m1_nao_sou_cliente", lead: "m1_nao_sou_cliente", quero_contratar: "m1_nao_sou_cliente",
  outros: "m1_outros", falar_dra: "m1_outros", falar_com_equipe: "m1_outros", client_team: "m1_outros",
  andamento: "client_last_movement", meu_processo: "client_last_movement", client_deadlines: "client_last_movement",
  cli_andamento: "client_last_movement", cli_documentos: "client_documents", cli_honorarios: "client_fees", cli_urgencia: "client_urgent", cli_humano: "client_dra",
  documentos: "client_documents", honorarios: "client_fees", client_meeting: "client_fees", agenda: "client_fees",
  lead_area_family: "lead_area_civil", lead_area_divorce: "lead_area_civil", lead_area_support: "lead_area_civil", lead_area_banking: "lead_area_consumer",
  lead_area_labor: "lead_area_other", lead_area_social_security: "lead_area_other", area_saude: "lead_area_health", area_familia: "lead_area_civil",
  area_consumidor: "lead_area_consumer", area_admin: "lead_area_admin", area_outra: "lead_area_other",
  afterhours_menu: "menu_main", sim_horario: "afterhours_next", urgente: "afterhours_urgent",
};
export const NODE_MENU: Record<string, any[]> = { meta_root: MENU.root, meta_client_menu: MENU.client, meta_dra_menu: MENU.dra, meta_lead_area: MENU.areas, meta_lead_next: MENU.leadNext, meta_afterhours_menu: MENU.after };

// ---------- regras puras (testáveis) ----------
export function normalizeId(id: string) { const x = String(id || "").trim(); return OLD_IDS[x] || x; }
export function pickByNumber(node: string, text: string) {
  const t = String(text || "").trim().replace(/[️⃣]/g, "");
  if (!/^\d{1,2}$/.test(t)) return "";
  const opts = NODE_MENU[node]; if (!opts) return "";
  const n = Number(t) - 1; return n >= 0 && n < opts.length ? String(opts[n].id) : "";
}
export function isAck(t: string) { return /^(k{3,}|ok+|okay|aqui|👍|🙏)[!. ]*$/i.test(String(t || "").trim()); }
export function isMenuWord(t: string) { return /^(menu|in[ií]cio|voltar ao menu|voltar)$/i.test(String(t || "").trim()); }
export function wantsCall(t: string) { return /(me liga|me ligue|ligar para mim|pode ligar|ligação|ligacao|me chama por voz|por telefone)/i.test(String(t || "")); }
export function serviceHours(now = new Date(), startMin = 480, endMin = 1080) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (x: string) => parts.find((p) => p.type === x)?.value || "";
  const minutes = Number(g("hour")) * 60 + Number(g("minute"));
  const workday = !["Sat", "Sun"].includes(g("weekday"));
  return { inHours: workday && minutes >= startMin && minutes < endMin, weekday: g("weekday"), minutes };
}
export function firstName(n: any) { return String(n || "").trim().split(/\s+/)[0] || ""; }
// Telefone brasileiro em forma única: DDD + 8 dígitos (a Meta às vezes manda sem o 9; o cadastro costuma ter o 9).
export function canonPhone(v: any) {
  let d = D(v); if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : "";
}
export function samePhone(a: any, b: any) { const x = canonPhone(a), y = canonPhone(b); return !!x && x === y; }

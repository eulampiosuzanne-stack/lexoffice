// Menu de botões (modelo Word da Dra.) para contatos marcados "Só chatbot". Lógica pura, sem rede nem banco.
export type Menu = { question: string; rows: { id: string; title: string }[] };
export type Reply = { text: string; menu?: Menu };
export type Result = { node: string; tries: number; replies: Reply[]; handoff?: string };

const SESSION_MS = 12 * 3600000;
const MAIN = ["📂 Meu processo", "🆕 Novo processo", "📎 Documentos", "💰 Financeiro", "📍 Endereço", "⚖️ Consultoria", "📅 Agendamento"];
const NOVO = ["👤 Pessoa física", "🏢 Pessoa jurídica", "↩️ Voltar ao menu"];
const SIMNAO = ["✅ Sim, voltar", "👋 Encerrar"];
const CONSULTA = ["✅ Quero consultoria", "↩️ Voltar ao menu"];
const AGENDA = ["✅ Já paguei", "⚖️ Consultoria", "↩️ Voltar ao menu"];
const OPTIONS: Record<string, string[]> = { menu: MAIN, novo: NOVO, endereco: SIMNAO, consultoria: CONSULTA, agenda: AGENDA };
const QUESTION: Record<string, string> = {
  menu: "Como podemos te auxiliar?", novo: "⚖️ *Qual o tipo de processo que precisa?*", endereco: "Gostaria de tratar de outro assunto?",
  consultoria: "Deseja seguir com a consultoria?", agenda: "Você já fez o pagamento da consultoria?",
};
const WARN = "⚠️ Para continuar, você precisa *escolher uma das opções* abaixo 👇";
const CONSULTA_TEXT = "⚖️ *Consultoria jurídica*\n\n💻 Atendimento somente *online*\n💰 Valor: *R$ 300,00*\n📅 O agendamento é feito *somente depois* da confirmação do pagamento.";

function menu(question: string, options: string[]): Reply {
  return {
    text: question + "\n\n" + options.map((o, i) => `${i + 1} - ${o}`).join("\n"),
    menu: { question, rows: options.map((o, i) => ({ id: `sfbot:${i + 1}`, title: o })) },
  };
}
const norm = (v: string) => v.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
// WhatsApp mostra no máximo 3 botões por mensagem: opções extras seguem em outra mensagem.
export function parts(reply: Reply): { text: string; buttons?: { id: string; title: string }[] }[] {
  if (!reply.menu) return [{ text: reply.text }];
  const out = [];
  for (let i = 0; i < reply.menu.rows.length; i += 3) out.push({ text: i ? "Mais opções:" : reply.menu.question, buttons: reply.menu.rows.slice(i, i + 3) });
  return out;
}
export function choice(input: string, options: string[]): number {
  const t = norm(input).replace(/^sfbot:/, "").replace(/[.)!]+$/, "");
  const n = /^[1-9]$/.test(t) ? Number(t) : options.findIndex((o) => norm(o) === t || t === `${options.indexOf(o) + 1} - ${norm(o)}`) + 1;
  return n >= 1 && n <= options.length ? n : 0;
}
/** Lembrete para quem recebeu o menu e não escolheu nada. */
export function reminder(node: string): Reply | null {
  return OPTIONS[node] ? menu(WARN, OPTIONS[node]) : null;
}
function brasilia(now: Date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return { day: p.find((x) => x.type === "weekday")!.value, hour: Number(p.find((x) => x.type === "hour")!.value) };
}
export const isOpen = (now: Date) => { const b = brasilia(now); return !["Sat", "Sun"].includes(b.day) && b.hour >= 8 && b.hour < 18; };
const greeting = (now: Date) => { const h = brasilia(now).hour; return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite"; };

export function step(s: { node: string; tries: number; lastAt: Date | null; name: string; input: string; attachment: boolean; now: Date }): Result {
  const name = s.name ? " " + s.name : "";
  const out = (node: string, replies: Reply[] = [], handoff?: string, tries = 0): Result => ({ node, tries, replies, handoff });
  const main = menu(`⚖️ *Suzanne Figueiredo*\n_Advocacia e Soluções Jurídicas_\n\n👋 Olá${s.name ? " *" + s.name + "*" : ""}! Você está no *pré-atendimento*.\n${QUESTION.menu}`, MAIN);
  const expired = !s.lastAt || s.now.getTime() - s.lastAt.getTime() > SESSION_MS;

  if (expired || s.node === "new" || s.node === "closed" || (s.node === "offhours" && isOpen(s.now))) {
    if (!isOpen(s.now)) return out("offhours", [{ text: `🌙 ${greeting(s.now)}${name}!\n\nNão estamos atendendo no momento, mas seu chamado está *registrado*, e daremos retorno assim que voltarmos. 🤝` }], "Mensagem fora do horário");
    return out("menu", [main]);
  }
  if (s.node === "handed" || s.node === "offhours") return out(s.node);

  if (s.node === "docs") {
    if (!s.attachment) return out("handed", [], "Envio de documentos");
    return out("handed", [{ text: "✅ *Identificamos o envio do documento.*\n\n🔎 A análise será feita em tempo hábil pelo setor responsável, e logo te daremos um retorno aqui no chat.\n📎 Caso precise enviar múltiplos documentos, eles podem ser enviados a seguir." }], "Documento enviado");
  }

  const node = OPTIONS[s.node] ? s.node : "menu";
  const options = OPTIONS[node];
  const n = s.attachment ? 0 : choice(s.input, options);
  if (!n) {
    // Avisa duas vezes que é preciso escolher; depois (ou com anexo) passa para atendimento humano, sem ficar em ciclo.
    if (s.attachment || s.tries >= 2) return out("handed", [{ text: "🤝 Seu chat foi direcionado para a *equipe responsável*, e logo te retornaremos." }], "Aguardando atendimento");
    return out(node, [menu(WARN, options)], undefined, s.tries + 1);
  }
  const back = () => out("menu", [main]);
  const consulta = () => out("consultoria", [{ text: CONSULTA_TEXT }, menu(QUESTION.consultoria, CONSULTA)]);

  if (node === "novo") {
    if (n === 3) return back();
    const kind = n === 1 ? "pessoa física" : "pessoa jurídica";
    return out("handed", [{ text: `✅ Você selecionou: *Processo para ${kind}*.\n\n🤝 Seu chat foi direcionado para a equipe responsável, e logo te retornaremos.\n✍️ Para agilizar o atendimento, envie os detalhes do seu processo nas próximas mensagens.` }], `Novo processo (${kind})`);
  }
  if (node === "endereco") {
    if (n === 2) return out("closed", [{ text: "🙏 *Agradecemos seu contato.*\nPara reiniciar o atendimento, basta enviar uma nova mensagem." }]);
    return back();
  }
  if (node === "consultoria") {
    if (n === 2) return back();
    return out("handed", [{ text: "✅ *Ótimo!*\n\n💳 Em breve enviaremos os dados para pagamento.\n📅 Assim que o pagamento for confirmado, agendamos o seu horário." }], "Quer a consultoria (R$ 300,00): enviar pagamento");
  }
  if (node === "agenda") {
    if (n === 2) return consulta();
    if (n === 3) return back();
    return out("handed", [{ text: "🔎 Vamos *conferir o pagamento* e logo combinamos o seu horário.\n📎 Se tiver o comprovante, envie aqui." }], "Informou que pagou: conferir e agendar");
  }
  if (n === 1) return out("handed", [{ text: "✅ Você selecionou: *Processo em andamento*.\n\n🤝 Seu chat já foi direcionado a um atendente que irá verificar o histórico e dar um retorno.\n✍️ Para agilizar, envie uma mensagem com sua solicitação." }], "Processo em andamento");
  if (n === 2) return out("novo", [menu(QUESTION.novo, NOVO)]);
  if (n === 3) return out("docs", [{ text: "✅ Você selecionou: *Envio de documentos*.\n\n📎 Por gentileza, envie os documentos agora. Eles serão analisados pela equipe responsável e logo daremos um retorno." }]);
  if (n === 4) return out("handed", [{ text: "✅ Você selecionou: *Financeiro*.\n\n🤝 Seu chat foi direcionado para a equipe responsável.\n✍️ Para agilizar o atendimento, envie os detalhes de sua dúvida nas próximas mensagens." }], "Financeiro");
  if (n === 5) return out("endereco", [{ text: "📍 *Nosso atendimento é somente online.*\n💻 Não atendemos presencialmente." }, menu(QUESTION.endereco, SIMNAO)]);
  if (n === 6) return consulta();
  return out("agenda", [{ text: "📅 *Agendamento*\n\nO horário é marcado *somente depois* da consultoria paga (R$ 300,00)." }, menu(QUESTION.agenda, AGENDA)]);
}

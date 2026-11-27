// Menu de botões (modelo Word da Dra.) para contatos marcados "Só chatbot". Lógica pura, sem rede nem banco.
export type Menu = { question: string; rows: { id: string; title: string }[] };
export type Reply = { text: string; menu?: Menu };
export type Result = { node: string; tries: number; replies: Reply[]; handoff?: string };

const SESSION_MS = 12 * 3600000;
const MAIN = ["Processo em curso", "Novo processo", "Envio de documentos", "Financeiro", "Endereço"];
const NOVO = ["Pessoa física", "Pessoa jurídica", "Voltar ao menu"];
const SIMNAO = ["Sim, voltar ao menu", "Não, encerrar"];

function menu(question: string, options: string[]): Reply {
  return {
    text: question + "\n\n" + options.map((o, i) => `${i + 1} - ${o}`).join("\n"),
    menu: { question, rows: options.map((o, i) => ({ id: `sfbot:${i + 1}`, title: o })) },
  };
}
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
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
function brasilia(now: Date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return { day: p.find((x) => x.type === "weekday")!.value, hour: Number(p.find((x) => x.type === "hour")!.value) };
}
export const isOpen = (now: Date) => { const b = brasilia(now); return !["Sat", "Sun"].includes(b.day) && b.hour >= 8 && b.hour < 18; };
const greeting = (now: Date) => { const h = brasilia(now).hour; return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite"; };

export function step(s: { node: string; tries: number; lastAt: Date | null; name: string; input: string; attachment: boolean; now: Date }): Result {
  const name = s.name ? " " + s.name : "";
  const out = (node: string, replies: Reply[] = [], handoff?: string, tries = 0): Result => ({ node, tries, replies, handoff });
  const main = menu(`Olá${name}! Você está no pré-atendimento. Como podemos te auxiliar?`, MAIN);
  const expired = !s.lastAt || s.now.getTime() - s.lastAt.getTime() > SESSION_MS;

  if (expired || s.node === "new" || s.node === "closed" || (s.node === "offhours" && isOpen(s.now))) {
    if (!isOpen(s.now)) return out("offhours", [{ text: `${greeting(s.now)}${name}! Não estamos atendendo no momento, mas seu chamado está registrado, e daremos retorno assim que voltarmos.` }], "Mensagem fora do horário");
    return out("menu", [main]);
  }
  if (s.node === "handed" || s.node === "offhours") return out(s.node);

  if (s.node === "docs") {
    if (!s.attachment) return out("handed", [], "Envio de documentos");
    return out("handed", [{ text: "Identificamos o envio do documento. A análise será feita em tempo hábil pelo setor responsável, e logo te daremos um retorno aqui no chat. Caso precise enviar múltiplos documentos, eles podem ser enviados a seguir." }], "Documento enviado");
  }

  const options = s.node === "novo" ? NOVO : s.node === "endereco" ? SIMNAO : s.node === "menu_curto" ? MAIN.slice(0, 4) : MAIN;
  const n = s.attachment ? 0 : choice(s.input, options);
  if (!n) {
    // Uma repetição; na segunda resposta inválida (ou anexo) passa para atendimento humano.
    if (s.attachment || s.tries >= 1) return out("handed", [{ text: "Seu chat foi direcionado para a equipe responsável, e logo te retornaremos." }], "Aguardando atendimento");
    const again = s.node === "novo" ? menu("Qual o tipo de processo que precisa?", NOVO)
      : s.node === "endereco" ? menu("Gostaria de tratar de outro assunto?", SIMNAO)
      : menu("Por favor, escolha uma das opções:", options);
    return out(s.node, [again], undefined, s.tries + 1);
  }

  if (s.node === "novo") {
    if (n === 3) return out("menu", [main]);
    const kind = n === 1 ? "pessoa física" : "pessoa jurídica";
    return out("handed", [{ text: `Você selecionou: Processo para ${kind}. Seu chat foi direcionado para a equipe responsável, e logo te retornaremos. Para agilizar o atendimento, envie os detalhes do seu processo nas próximas mensagens.` }], `Novo processo (${kind})`);
  }
  if (s.node === "endereco") {
    if (n === 2) return out("closed", [{ text: "Agradecemos seu contato. Para reiniciar o atendimento, basta enviar uma nova mensagem." }]);
    return out("menu_curto", [menu("Como podemos te auxiliar?", MAIN.slice(0, 4))]);
  }
  if (n === 1) return out("handed", [{ text: "Você selecionou: Processo em andamento. Seu chat já foi direcionado a um atendente que irá verificar o histórico e dar um retorno. Para agilizar, envie uma mensagem com sua solicitação." }], "Processo em andamento");
  if (n === 2) return out("novo", [menu("Qual o tipo de processo que precisa?", NOVO)]);
  if (n === 3) return out("docs", [{ text: "Você selecionou: Envio de documentos. Por gentileza, envie os documentos agora. Eles serão analisados pela equipe responsável e logo daremos um retorno." }]);
  if (n === 4) return out("handed", [{ text: "Você selecionou: Financeiro. Seu chat foi direcionado para a equipe responsável. Para agilizar o atendimento, envie os detalhes de sua dúvida nas próximas mensagens." }], "Financeiro");
  return out("endereco", [{ text: "Nosso atendimento é somente online. Não atendemos presencialmente." }, menu("Gostaria de tratar de outro assunto?", SIMNAO)]);
}

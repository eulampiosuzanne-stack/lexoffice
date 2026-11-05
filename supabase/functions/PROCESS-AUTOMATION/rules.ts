// Regras puras da Helena (testáveis sem rede).
// v11 (04/11/2026): frases fixas sem "equipe" (a equipe é a própria Dra. Suzanne).
// v10 (04/11/2026): sem pedido de desculpas genérico; emoji nunca sozinho na linha.
// v9 (04/11/2026): resposta mais humana — até 5 frases em parágrafos naturais (não mais 1 frase por parágrafo),
//   frases de segurança reescritas e sem "no sistema".
export const D = (v: any) => String(v ?? "").replace(/\D/g, "");
const N = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Telefone BR em forma única: DDD + 8 dígitos (sem 55 e sem o 9º dígito).
export function core(v: any) {
  let d = D(v); if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : "";
}

// Urgência real (risco concreto e imediato). Insistência/irritação NÃO entram.
export function isUrgent(message: string): boolean {
  const t = N(message);
  if (/violencia domestica|medida protetiva|ameac|agress|me bateu|bateu em mim|espancad|risco (?:de vida|a vida|a integridade)|prisao|\bpres[oa]\b|flagrante|suicid|sequestr|estupr|mandado de prisao/.test(t)) return true;
  if (/audiencia|prazo/.test(t) && (/\b(hoje|amanha|48 horas|48h|dois dias|2 dias)\b/.test(t) || /\b(?:[1-9]|[1-3][0-9]|4[0-8])\s*(?:h\b|horas\b)/.test(t))) return true;
  return /neg|recus|nao autor|nao liber/.test(t) && /tratamento|cirurgia|internacao|medicamento|atendimento/.test(t) && /urgente|grave|risco|emergencia|uti|cancer|oncolog/.test(t);
}

export function wantsHuman(message: string) { return /(falar|conversar).{0,20}(doutora|dra|advogada|suzanne|humano|pessoa)|quero a doutora|chama a doutora/.test(N(message)); }

export function parseModel(raw: string): any {
  const txt = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const tryParse = (s: string) => { try { const d = JSON.parse(s); return d && typeof d.reply === "string" ? d : null; } catch { return null; } };
  return tryParse(txt) || (() => { const m = txt.match(/\{[\s\S]*\}/); return m ? tryParse(m[0]) : null; })();
}

// Frases fixas de segurança (tom humano).
export const SAFE = {
  booking: "Anotei seu pedido de horário.\n\nVou ver a agenda e te confirmo por aqui.",
  payment: "Obrigada pelo comprovante.\n\nVou conferir o pagamento e, assim que estiver tudo certo, seguimos com o agendamento.",
  notified: "Deixei seu recado anotado para a Dra. Suzanne.\n\nSe for preciso, ela fala com você por aqui.",
};

// Travas do servidor: nada de confirmar o que não aconteceu, valores inventados, vazamento interno.
export function guardReply(reply: string, o: { fee: number; amounts: number[]; identified: boolean }): string {
  let r = String(reply || "").replace(/\r\n?/g, "\n").trim();
  if (!r) return "";
  const t = N(r);
  if (/bot_ativo|human_takeover|chatbot_context|system.?prompt|service_role|agent_key|orquestrador|banco de dados|\bjson\b|\bagente (?:de|financeiro|comercial)/.test(t)) return "";
  r = r.replace(/\bboutique\b/gi, "").replace(/[ \t]{2,}/g, " ");
  // v9: nada de "sistema" na fala da Helena.
  r = r.replace(/\b(verifiquei|conferi|olhei|consultei|vi)(?: aqui)? no (?:nosso )?sistema\b/gi, "$1 aqui")
       .replace(/\b(?:aqui )?no (?:nosso )?sistema\b/gi, "aqui")
       .replace(/\bo sistema (?:mostra|indica|informa|aponta)\b/gi, "consta");
  // v10: sem pedido de desculpas genérico (pedido da Dra. Suzanne): remove a frase inteira; se sobrar nada, mantém o original.
  const noSorry = r.replace(/(^|[.!?…]\s+|\n+)[^.!?…\n]*\b(?:pe[çc]o desculpas|me desculpe|desculpe (?:a|pela|pelo|o)|lamento)\b[^.!?…\n]*[.!?…]*/gi, "$1").replace(/^[\s,]+/, "").trim();
  if (noSorry) r = noSorry;
  if (/(?:ja |esta |foi |ficou )(?:agendad[oa]|marcad[oa]|reservad[oa])|horario (?:esta |foi )?confirmado|agendei|marquei/.test(t)) return SAFE.booking;
  if (/pagamento (?:foi |esta |ja esta )?confirmado|confirm(?:ei|amos) (?:o )?pagamento|recebemos (?:o |seu )?pagamento/.test(t)) return SAFE.payment;
  if (/(?:avisei|ja avisei|ja aciono?ei|notifiquei) a (?:dra|doutora|advogada)/.test(t)) return SAFE.notified;
  const allowed = [o.fee, ...o.amounts].map((x) => Math.round(Number(x) * 100));
  const amounts = [...r.matchAll(/R\$\s*([\d.]+(?:,\d{2})?)/gi)].map((m) => Math.round(Number(m[1].replace(/\./g, "").replace(",", ".")) * 100));
  if (amounts.some((x) => !allowed.includes(x))) return "";
  if (/\d\s*%/.test(r) && !/2\s*%|1\s*%/.test(r)) return "";
  if (/(?:tem|tera|possui) (?:todo o )?direito|vai ganhar|causa ganha|com certeza (?:ganha|vence)/.test(t)) return "";
  return r;
}

// v9: até 5 frases e 1 pergunta, em parágrafos naturais (até 2 frases por parágrafo, respeitando os parágrafos da IA).
const DOT = "․"; // ponto protegido (números, links, abreviações)
const MAX_SENTENCES = 5, PER_PARAGRAPH = 2;
export function shapeReply(reply: string): string {
  const r = String(reply || "").trim();
  if (!r) return "";
  const header = r.match(/^\*Helena\*[^\n]*\n+/);
  let bodyText = header ? r.slice(header[0].length) : r;
  bodyText = bodyText.replace(/(\S)\.(?=\S)/g, "$1" + DOT).replace(/\b(Dra|Dr|Sr|Sra|nº|Av|Prof)\./gi, "$1" + DOT);
  const paragraphs = bodyText.split(/\n\s*\n/).map((p) => p.replace(/\n+/g, " ").trim()).filter(Boolean);
  const out: string[] = []; let total = 0, questions = 0;
  for (const p of paragraphs) {
    const sentences = p.match(/[^.!?…]+(?:[.!?…]+|$)/g)?.map((s) => s.trim()).filter(Boolean) || [];
    let cur: string[] = [];
    for (const s of sentences) {
      if (total >= MAX_SENTENCES) break;
      // v10: emoji sozinho vai junto da frase anterior (nunca numa linha só).
      if (/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(s)) { if (cur.length) cur[cur.length - 1] += " " + s; else if (out.length) out[out.length - 1] += " " + s; continue; }
      if (s.includes("?")) { if (questions >= 1) continue; questions++; }
      cur.push(s); total++;
      if (cur.length >= PER_PARAGRAPH) { out.push(cur.join(" ")); cur = []; }
    }
    if (cur.length) out.push(cur.join(" "));
    if (total >= MAX_SENTENCES) break;
  }
  return ((header ? header[0].trim() + "\n\n" : "") + out.join("\n\n")).split(DOT).join(".").trim();
}

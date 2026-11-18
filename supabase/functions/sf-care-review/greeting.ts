// Saudação segura para mensagens do SF Care.
// Usa o primeiro nome só quando o cadastro parece um nome de pessoa;
// apelidos de WhatsApp, emojis, números ou letras soltas viram "Olá!".
const LOWER_WORDS = new Set(["a", "o", "e", "de", "da", "do", "das", "dos", "cliente", "teste", "lead", "contato", "sem", "nome"]);

function titleCase(word: string): string {
  return word
    .split(/([-'])/)
    .map(part => (/^[-']$/.test(part) ? part : part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1).toLocaleLowerCase("pt-BR")))
    .join("");
}

export function greetingName(raw: unknown): string | null {
  const name = String(raw ?? "").normalize("NFC").trim();
  if (!name) return null;
  // Só letras (com acento), espaços, hífen, apóstrofo e ponto.
  if (!/^[\p{L}\s.'-]+$/u.test(name)) return null;
  // "AnthonyCarrera" -> "Anthony Carrera"
  const spaced = name.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
  const words = spaced.split(/\s+/).filter(Boolean);
  const first = words[0].replace(/\./g, "");
  if (first.length < 2 || LOWER_WORDS.has(first.toLocaleLowerCase("pt-BR"))) return null;
  if (first.length > 30) return null;
  return titleCase(first);
}

export function greeting(raw: unknown): string {
  const n = greetingName(raw);
  return n ? `Olá, ${n}!` : "Olá!";
}

export function maskPhone(c: { whatsapp?: unknown; phone?: unknown } | null | undefined): string | null {
  const d = String(c?.whatsapp ?? "").replace(/\D/g, "") || String(c?.phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `final ${d.slice(-4)}`;
}

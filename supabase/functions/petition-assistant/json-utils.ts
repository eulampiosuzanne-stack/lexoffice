const stripFence = (s: string) => {
  const t = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  return i >= 0 && j > i ? t.slice(i, j + 1) : t;
};

// Modelos às vezes encerram uma resposta longa poucos caracteres antes do fim do
// JSON. Primeiro aceitamos JSON estrito; depois corrigimos somente problemas
// sintáticos seguros (vírgula final ou fechamento ausente), sem criar fatos.
export function parseModelJson(raw: string) {
  const source = stripFence(raw).replace(/^\uFEFF/, "").trim();
  const attempts = [source, source.replace(/,\s*([}\]])/g, "$1")];
  for (const candidate of attempts) {
    try { return JSON.parse(candidate); } catch { /* tenta reparo conservador */ }
  }

  const start = source.indexOf("{");
  if (start < 0) throw new Error("JSON_OBJECT_NOT_FOUND");
  let candidate = source.slice(start), inString = false, escaped = false;
  const stack: string[] = [];
  for (const ch of candidate) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inString) candidate += '"';
  candidate = candidate.replace(/,\s*$/, "");
  if (/[:]\s*$/.test(candidate)) candidate += "null";
  while (stack.length) candidate += stack.pop() === "{" ? "}" : "]";
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(candidate);
}

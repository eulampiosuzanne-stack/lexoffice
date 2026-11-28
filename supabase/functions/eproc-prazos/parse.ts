// Leitura da "Lista de Citações e Intimações com prazo aberto" do eproc.
// Colunas: Processo | Classe | Assunto | Evento e Prazo | Data envio | Início Prazo | Final Prazo
import { text } from "./eproc.ts";

const CNJ = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
const DT = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/;
export const brDate = (s: string, hora = "00:00:00") => {
  const m = s.replace(/\s+/g, " ").trim().match(DT);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ? `${m[4]}:${m[5]}:${m[6] || "00"}` : hora}-03:00`;
};

export type Prazo = { cnj: string; classe: string; assunto: string; evento: string; envio: string | null; inicio: string; final: string };

export function rowCells(html: string) {
  const starts = [...html.matchAll(/<tr\b[^>]*class=["'][^"']*infraTr(?:Clara|Escura)[^"']*["'][^>]*>/gi)].map((m) => m.index!);
  let segs = starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : html.indexOf("</table>", s);
    return html.slice(s, end > s ? end : undefined);
  });
  // Telas sem a classe padrão: qualquer linha que traga número de processo.
  if (!segs.length) segs = [...html.matchAll(/<tr\b[^>]*>(?:(?!<tr\b)[\s\S])*?<\/tr>/gi)].map((m) => m[0]).filter((x) => CNJ.test(x));
  return segs.map((seg) => [...seg.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => text(c[1]).replace(/\s+/g, " ").trim()));
}

export function parsePrazos(html: string) {
  const prazos: Prazo[] = [], naoLidas: string[][] = [];
  for (const cells of rowCells(html)) {
    const dates = cells.map((c, i) => ({ c, i })).filter((x) => DT.test(x.c));
    const pi = cells.findIndex((c) => CNJ.test(c));
    // Sem as três datas a linha NÃO é interpretada: melhor avisar do que chutar um prazo.
    if (pi < 0 || dates.length < 3) { naoLidas.push(cells.map((c) => c.slice(0, 120))); continue; }
    const [envio, inicio, final] = dates.slice(-3);
    const i0 = brDate(inicio.c), f0 = brDate(final.c, "23:59:59");
    if (!i0 || !f0 || f0 < i0) { naoLidas.push(cells.map((c) => c.slice(0, 120))); continue; }
    prazos.push({
      cnj: cells[pi].match(CNJ)![0], classe: cells[pi + 1] || "", assunto: cells[pi + 2] || "",
      evento: (cells[envio.i - 1] || "").slice(0, 600), envio: brDate(envio.c), inicio: i0, final: f0,
    });
  }
  return { prazos, naoLidas };
}

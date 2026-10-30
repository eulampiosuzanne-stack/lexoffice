import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

// Tipografia — biblioteca INTERNA de peças-modelo do escritório.
// As peças servem só para a IA aprender o estilo de escrita da Dra. Suzanne
// (petition-assistant lê typography_references). Clientes e equipe externa não acessam.

const BUCKET = "legal-review-files";
const MAX = 20 * 1024 * 1024;
const TYPES = ["Petição", "Contestação", "Recurso", "Parecer", "Outros"];

type Ref = {
  id: string;
  name: string;
  piece_type: string | null;
  notes: string | null;
  file_path: string | null;
  mime_type: string | null;
  extraction_status: string;
  created_at: string;
  style_profile: any;
};

// Extrai o texto de um .docx no navegador (ZIP + word/document.xml), sem bibliotecas externas.
async function docxText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return "";
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name !== "word/document.xml") continue;
    const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true);
    const data = buf.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
    let xml: string;
    if (method === 0) xml = new TextDecoder().decode(data);
    else {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      xml = await new Response(stream).text();
    }
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return "";
}

export default function Tipografia() {
  const [rows, setRows] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState(TYPES[0]);
  const [filter, setFilter] = useState("Todas");
  const [q, setQ] = useState("");

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("typography_references")
      .select("id,name,piece_type,notes,file_path,mime_type,extraction_status,created_at,style_profile")
      .order("piece_type", { ascending: true })
      .order("name", { ascending: true });
    setLoading(false);
    if (error) return setNotice("Não foi possível carregar a biblioteca: " + error.message);
    setRows((data || []) as Ref[]);
  }
  useEffect(() => { load(); }, []);

  const shown = useMemo(
    () => rows.filter((r) => (filter === "Todas" || r.piece_type === filter) && r.name.toLowerCase().includes(q.toLowerCase())),
    [rows, filter, q],
  );

  async function download(r: Ref) {
    if (!supabase || !r.file_path) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.file_path, 120, { download: r.name });
    if (error || !data?.signedUrl) return setNotice("Não foi possível baixar: " + (error?.message || "arquivo indisponível"));
    window.location.assign(data.signedUrl);
  }

  async function remove(r: Ref) {
    if (!supabase) return;
    if (!window.confirm(`Remover "${r.name}" da Tipografia? A IA deixará de usar esta peça como modelo.`)) return;
    setBusy(true);
    const del = await supabase.from("typography_references").delete().eq("id", r.id);
    if (!del.error && r.file_path) await supabase.storage.from(BUCKET).remove([r.file_path]);
    setBusy(false);
    if (del.error) return setNotice("Não foi possível remover: " + del.error.message);
    setNotice(`"${r.name}" removida.`);
    setRows((x) => x.filter((y) => y.id !== r.id));
  }

  async function upload() {
    if (!supabase) return;
    if (!file) return setNotice("Escolha uma peça em DOCX.");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "docx") return setNotice("Envie a peça em Word (.docx) para a IA conseguir ler o texto.");
    if (!file.size) return setNotice("O arquivo está vazio.");
    if (file.size > MAX) return setNotice("O arquivo excede o limite de 20 MB.");
    if (rows.some((r) => r.name === file.name && r.piece_type === kind)) return setNotice("Esta peça já está na biblioteca.");
    setBusy(true);
    setNotice("Lendo a peça...");
    let text = "";
    try { text = await docxText(file); } catch { text = ""; }
    const { data: orgId } = await supabase.rpc("current_org_id");
    const { data: u } = await supabase.auth.getUser();
    const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${orgId}/tipografia/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (up.error) { setBusy(false); return setNotice("Não foi possível guardar a peça: " + up.error.message); }
    const ins = await supabase.from("typography_references").insert({
      org_id: orgId, name: file.name, piece_type: kind, notes: `Padrão Suzanne — ${kind}`, rating: 5,
      file_path: path, mime_type: file.type || null, is_office_standard: false,
      extraction_status: text.length > 200 ? "ready" : "failed",
      style_profile: { origem: "Upload na Tipografia", perfil: `Padrão Suzanne — ${kind}`, texto_extraido: text },
      preview_paths: [], created_by: u.user?.id || null,
    });
    if (ins.error) { await supabase.storage.from(BUCKET).remove([path]); setBusy(false); return setNotice("Não foi possível registrar a peça: " + ins.error.message); }
    setBusy(false);
    setFile(null);
    setNotice(text.length > 200 ? "Peça adicionada. A IA já pode usá-la como modelo de estilo." : "Peça guardada, mas o texto não pôde ser lido. Confira se o arquivo não é imagem escaneada.");
    load();
  }

  // ---- Revisar minha peça: a IA compara com os modelos e devolve o mesmo Word melhorado ----
  const [revFile, setRevFile] = useState<File | null>(null);
  const [revKind, setRevKind] = useState(TYPES[0]);
  const [revNotes, setRevNotes] = useState("");
  const [revHighlight, setRevHighlight] = useState(true);
  const [revBusy, setRevBusy] = useState(false);
  const [revNotice, setRevNotice] = useState("");
  const [revResult, setRevResult] = useState<any>(null);

  async function review() {
    if (!supabase) return;
    if (!revFile) return setRevNotice("Escolha a peça em Word (.docx).");
    if (revFile.name.split(".").pop()?.toLowerCase() !== "docx") return setRevNotice("Envie a peça em Word (.docx). PDF não pode ser editado.");
    if (!revFile.size) return setRevNotice("O arquivo está vazio.");
    if (revFile.size > MAX) return setRevNotice("O arquivo excede o limite de 20 MB.");
    setRevBusy(true); setRevResult(null);
    setRevNotice("Enviando a peça...");
    const { data: orgId } = await supabase.rpc("current_org_id");
    const safe = revFile.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${orgId}/tipografia-entrada/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from(BUCKET).upload(path, revFile, { upsert: false, contentType: revFile.type || undefined });
    if (up.error) { setRevBusy(false); return setRevNotice("Não foi possível enviar a peça: " + up.error.message); }
    setRevNotice("A IA está comparando com os modelos e melhorando a peça. Isso leva de 30 segundos a 2 minutos...");
    const { data, error } = await supabase.functions.invoke("petition-assistant", { body: { action: "typography_improve", path, file_name: revFile.name, piece_type: revKind, instructions: revNotes, highlight: revHighlight } });
    setRevBusy(false);
    const err = (data as any)?.error || (error ? (await (error as any)?.context?.json?.().catch(() => null))?.error || error.message : "");
    if (err || !(data as any)?.ok) return setRevNotice("Não foi possível revisar: " + (err || "tente novamente."));
    setRevResult(data);
    setRevNotice((data as any).unchanged ? "A IA não encontrou o que melhorar em relação aos modelos." : `Peça revisada: ${(data as any).alteracoes?.length || 0} alteração(ões)${revHighlight ? ", destacadas em amarelo no Word" : ""}.`);
  }

  const counts = TYPES.map((t) => [t, rows.filter((r) => r.piece_type === t).length] as const);

  return (
    <section className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Tipografia</h1>
          <p>Peças-modelo do escritório. A IA usa estas peças só para aprender o seu estilo de escrita — nunca copia fatos, nomes ou números. Uso interno: clientes não veem.</p>
        </div>
      </div>

      <section className="integration-panel">
        <h2>Revisar minha peça</h2>
        <p>Anexe a peça em Word. A IA compara com os modelos aprovados, melhora, acrescenta ou substitui trechos e devolve o mesmo Word, com o seu timbrado e formatação, pronto para você conferir.</p>
        <label>Tipo da peça
          <select value={revKind} onChange={(e) => setRevKind(e.target.value)} disabled={revBusy}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label>Peça (.docx)
          <input type="file" accept=".docx" disabled={revBusy} onChange={(e) => { setRevFile(e.target.files?.[0] || null); setRevResult(null); setRevNotice(""); }} />
        </label>
        <label>O que quer que a IA observe (opcional)
          <textarea rows={3} value={revNotes} disabled={revBusy} onChange={(e) => setRevNotes(e.target.value)} placeholder="Ex.: reforçar o pedido de tutela; deixar os fatos mais objetivos." />
        </label>
        <label><input type="checkbox" checked={revHighlight} disabled={revBusy} onChange={(e) => setRevHighlight(e.target.checked)} /> Destacar as alterações em amarelo no Word</label>
        <button type="button" disabled={revBusy || !revFile} onClick={review}>{revBusy ? "Revisando..." : "Revisar com a IA"}</button>
        {revNotice && <p role="status">{revNotice}</p>}
        {revResult && !revResult.unchanged && (
          <div>
            {revResult.url && <p><a href={revResult.url}>Baixar a peça revisada (Word)</a></p>}
            {revResult.resumo && <p>{revResult.resumo}</p>}
            {revResult.modelos?.length > 0 && <small>Modelos usados: {revResult.modelos.join(", ")}</small>}
            <details>
              <summary>Ver as {revResult.alteracoes?.length || 0} alterações</summary>
              <ol>
                {(revResult.alteracoes || []).map((c: any, k: number) => (
                  <li key={k}>
                    <b>{c.op === "replace" ? "Substituído" : c.op === "insert_after" ? "Acrescentado" : "Retirado"}</b>{c.motivo ? ` — ${c.motivo}` : ""}
                    {c.antes && <p><small>Antes: {c.antes}</small></p>}
                    {c.depois && <p><small>Depois: {c.depois}</small></p>}
                  </li>
                ))}
              </ol>
            </details>
          </div>
        )}
      </section>

      <h2>Modelos que a IA usa como referência</h2>
      <div className="workspace-hub">
        {counts.map(([t, n]) => (
          <button key={t} type="button" className={`workspace-hub-card${filter === t ? " active" : ""}`} onClick={() => setFilter(filter === t ? "Todas" : t)}>
            <small>Modelos</small><h2>{t}</h2><p>{n} peça{n === 1 ? "" : "s"}</p>
          </button>
        ))}
      </div>

      <section className="integration-panel">
        <h2>Adicionar peça-modelo</h2>
        <label>Tipo da peça
          <select value={kind} onChange={(e) => setKind(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label>Arquivo (.docx)
          <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <button type="button" disabled={busy || !file} onClick={upload}>{busy ? "Aguarde..." : "Adicionar à Tipografia"}</button>
        {notice && <p role="status">{notice}</p>}
      </section>

      <label className="workspace-search">Localizar peça
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome da peça" />
      </label>

      {loading ? <p>Carregando...</p> : !shown.length ? <p>Nenhuma peça {filter !== "Todas" ? `do tipo ${filter} ` : ""}encontrada.</p> : (
        <div className="workspace-list">
          {shown.map((r) => (
            <article key={r.id} className="workspace-hub-card">
              <small>{r.piece_type || "Peça"} · {new Date(r.created_at).toLocaleDateString("pt-BR")}{r.extraction_status !== "ready" ? " · texto não lido" : ""}</small>
              <h2>{r.name}</h2>
              <p>{r.notes || ""}</p>
              <div>
                <button type="button" onClick={() => download(r)} disabled={!r.file_path}>Baixar</button>{" "}
                <button type="button" onClick={() => remove(r)} disabled={busy}>Remover</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

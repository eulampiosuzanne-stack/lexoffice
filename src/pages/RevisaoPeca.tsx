import { useState } from "react";
import {
  FileCheck2,
  Scale,
  ShieldCheck,
  Upload,
  SearchCheck,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import "./subtabs.css";

const max = 20 * 1024 * 1024;
const tabs = [
  "Tipografia",
  "Simulador do Adversário",
  "Jurisprudência",
  "Prova × Pedido",
  "Raio-X do Protocolo",
];

export default function RevisaoPeca() {
  const [tab, setTab] = useState(tabs[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<any>(null);

  async function analyze() {
    if (!file || !supabase)
      return setNotice("Escolha uma petição em DOCX ou PDF.");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["docx", "pdf"].includes(ext))
      return setNotice("Formato não aceito. Envie DOCX ou PDF.");
    if (!file.size) return setNotice("O arquivo está vazio.");
    if (file.size > max)
      return setNotice("O arquivo excede o limite de 20 MB.");
    setBusy(true);
    setNotice("Salvando a peça de forma privada...");
    const { data: userData } = await supabase.auth.getUser();
    const { data: orgId } = await supabase.rpc("current_org_id");
    const path = `${orgId}/${userData.user?.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const uploaded = await supabase.storage
      .from("legal-review-files")
      .upload(path, file, { upsert: false });
    if (uploaded.error) {
      setBusy(false);
      return setNotice(
        "Não foi possível guardar a peça: " + uploaded.error.message,
      );
    }
    const scanned = ext === "pdf" && /scan|scanner|imagem/i.test(file.name);
    const evaluation = {
      file_name: file.name,
      file_size: file.size,
      format: ext,
      scanned,
      score: null,
      formatting: scanned
        ? "⚠️ PDF possivelmente escaneado: extração tipográfica bloqueada."
        : "⚠️ Fontes e margens aguardam inspeção estrutural do documento.",
      visual:
        "⚠️ Tabelas, quadros e imagens precisam de conferência na prévia.",
      clarity:
        "⚠️ A clareza jurídica somente será pontuada após extração integral do texto.",
    };
    const saved = await supabase
      .from("legal_document_reviews")
      .insert({
        org_id: orgId,
        owner_user_id: userData.user?.id,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        status: scanned ? "needs_ocr" : "uploaded",
        result: evaluation,
      })
      .select()
      .single();
    setBusy(false);
    if (saved.error)
      return setNotice(
        "Arquivo preservado, mas o histórico não pôde ser salvo: " +
          saved.error.message,
      );
    setResult(evaluation);
    setNotice(
      scanned
        ? "PDF escaneado identificado. É necessário OCR antes da avaliação tipográfica."
        : "Arquivo recebido. A LEX não atribuiu notas técnicas que não conseguiu confirmar.",
    );
  }

  return (
    <div className="module-page review-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INTELIGÊNCIA · ANTES DO PROTOCOLO</span>
          <h1>Revisão da Peça</h1>
          <p>
            Validação visual, estratégica, jurisprudencial e documental antes do
            protocolo.
          </p>
        </div>
      </div>
      <nav className="campaign-tabs" aria-label="Módulos de revisão">
        {tabs.map((x) => (
          <button
            key={x}
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      <section className="integration-panel">
        <div className="integration-head">
          <div>
            <span className="integration-pill">
              <FileCheck2 size={14} /> {tab.toUpperCase()}
            </span>
            <h2>Enviar peça para revisão</h2>
            <p>
              DOCX ou PDF, até 20 MB. Arquivos permanecem privados e não
              aparecem no aplicativo do cliente.
            </p>
          </div>
        </div>
        <label
          className="integration-card"
          style={{ display: "block", cursor: "pointer" }}
        >
          <Upload size={22} />
          <b style={{ display: "block", margin: "8px 0" }}>
            {file?.name || "Escolher petição"}
          </b>
          <input
            type="file"
            accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setResult(null);
              setNotice("");
            }}
          />
          <small>
            {file
              ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
              : "O conteúdo jurídico não é alterado automaticamente."}
          </small>
        </label>
        <button className="primary" disabled={busy || !file} onClick={analyze}>
          <SearchCheck size={16} />
          {busy ? "Processando..." : "Iniciar análise segura"}
        </button>
        {notice && (
          <div className="integration-notice" role="status">
            {notice}
          </div>
        )}
      </section>
      {result && (
        <section className="integration-panel">
          <h2>Painel-resumo</h2>
          <div className="cards">
            <div className="card">
              <Scale />
              <strong>{result.score ?? "—"}</strong>
              <span>Nota geral</span>
            </div>
            <div className="card">
              <FileCheck2 />
              <strong>{result.scanned ? "OCR" : "Pendente"}</strong>
              <span>Tipografia</span>
            </div>
            <div className="card">
              <ShieldCheck />
              <strong>Privado</strong>
              <span>Proteção</span>
            </div>
          </div>
          <div className="integration-card">
            <p>{result.formatting}</p>
            <p>{result.visual}</p>
            <p>{result.clarity}</p>
          </div>
          <p>
            <b>Regra aplicada:</b> nenhuma fonte, jurisprudência, fato ou nota
            foi inventada. A versão corrigida somente poderá ser gerada depois
            da extração confirmada.
          </p>
        </section>
      )}
    </div>
  );
}

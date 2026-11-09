import InternalNavigation from '../components/InternalNavigation';
import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import {
  FileCheck2,
  Scale,
  ShieldCheck,
  Upload,
  SearchCheck,
} from "lucide-react";
import { supabase } from "../lib/supabase";

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
    setNotice(`Analisando ${tab.toLowerCase()} com o Gemini...`);
    const saved = await supabase
      .from("legal_document_reviews")
      .insert({
        org_id: orgId,
        owner_user_id: userData.user?.id,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        status: "processing",
        result: { tab, file_name: file.name, format: ext },
      })
      .select()
      .single();
    if (saved.error) {
      setBusy(false);
      return setNotice(
        "Arquivo preservado, mas o histórico não pôde ser salvo: " +
          saved.error.message,
      );
    }
    const { data, error } = await supabase.functions.invoke(
      "petition-assistant",
      {
        body: {
          action: "legal_review",
          review_id: saved.data.id,
          file_path: path,
          file_name: file.name,
          tab,
        },
      },
    );
    setBusy(false);
    if (error || !data?.ok) {
      await supabase
        .from("legal_document_reviews")
        .update({ status: "failed" })
        .eq("id", saved.data.id);
      if (error instanceof FunctionsHttpError) {
        const response = error.context as Response;
        const body = await response.json().catch(() => null);
        if (response.status === 503 && body?.error === "Google Gemini não está configurado em Integrações.") {
          return setNotice("O Gemini não está configurado neste espaço de trabalho. Em Agentes de IA, abra Infraestrutura para configurar o Google Gemini.");
        }
        if (response.status === 401) return setNotice("Sua sessão expirou. Entre novamente na LexOffice.");
        if (response.status === 403) return setNotice("A revisão não está disponível para esta conta ou espaço de trabalho.");
        if ([400, 404, 422].includes(response.status) && typeof body?.error === "string") {
          return setNotice(body.error);
        }
        return setNotice(`A revisão não pôde ser concluída agora (HTTP ${response.status}). A peça foi guardada de forma privada.`);
      }
      return setNotice(
        data?.error || "A análise não pôde ser concluída. A peça foi guardada de forma privada.",
      );
    }
    setResult(data.result);
    setNotice(`Análise de ${tab.toLowerCase()} concluída com ${data.model}.`);
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
      <InternalNavigation variant="underline" aria-label="Módulos de revisão">
        {tabs.map((x) => (
          <button
            key={x}
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </InternalNavigation>
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
              <strong>{result.status === "apto" ? "Apto" : result.status === "nao_apto" ? "Não apto" : "Com ajustes"}</strong>
              <span>Prontidão</span>
            </div>
            <div className="card">
              <ShieldCheck />
              <strong>Privado</strong>
              <span>Proteção</span>
            </div>
          </div>
          <div className="integration-card">
            <h3>Conclusão</h3>
            <p>{result.summary}</p>
          </div>
          {!!result.blocking_issues?.length && (
            <div className="integration-card">
              <h3>Impedimentos para protocolo</h3>
              {result.blocking_issues.map((item: any, index: number) => (
                <div key={`block-${index}`}>
                  <b>{item.title}</b>
                  <p>{item.detail}</p>
                  {item.evidence && <small>Base encontrada: {item.evidence}</small>}
                </div>
              ))}
            </div>
          )}
          {!!result.risks?.length && (
            <div className="integration-card">
              <h3>Riscos identificados</h3>
              {result.risks.map((item: any, index: number) => (
                <div key={`risk-${index}`}>
                  <b>{item.title}</b>
                  <p>{item.detail}</p>
                  {item.evidence && <small>Base encontrada: {item.evidence}</small>}
                </div>
              ))}
            </div>
          )}
          {!!result.strengths?.length && (
            <div className="integration-card">
              <h3>Pontos fortes</h3>
              {result.strengths.map((item: any, index: number) => (
                <p key={`strength-${index}`}><b>{item.title}:</b> {item.detail}</p>
              ))}
            </div>
          )}
          {!!result.proof_request_matrix?.length && (
            <div className="integration-card">
              <h3>Matriz Prova × Pedido</h3>
              {result.proof_request_matrix.map((item: any, index: number) => (
                <div key={`matrix-${index}`}>
                  <b>{item.request}</b>
                  <p>Fatos: {item.supporting_facts || "não confirmados"}</p>
                  <p>Provas existentes: {item.existing_evidence || "não confirmadas"}</p>
                  <p>Provas faltantes: {item.missing_evidence || "nenhuma confirmada"}</p>
                  <small>Risco: {item.risk || "não confirmado"}</small>
                </div>
              ))}
            </div>
          )}
          {!!result.jurisprudence_queries?.length && (
            <div className="integration-card">
              <h3>Pesquisa jurisprudencial necessária</h3>
              {result.jurisprudence_queries.map((item: any, index: number) => (
                <p key={`juris-${index}`}><b>{item.thesis}</b><br />{item.source}: {item.search_terms}</p>
              ))}
            </div>
          )}
          {!!result.recommendations?.length && (
            <div className="integration-card">
              <h3>Correções recomendadas</h3>
              {result.recommendations.map((item: any, index: number) => (
                <p key={`rec-${index}`}><b>{String(item.priority || "").toUpperCase()} — {item.action}</b><br />{item.reason}</p>
              ))}
            </div>
          )}
          {!!result.limitations?.length && (
            <div className="integration-card">
              <h3>Limitações da análise</h3>
              {result.limitations.map((item: string, index: number) => <p key={`limit-${index}`}>{item}</p>)}
            </div>
          )}
          <p>
            <b>Regra aplicada:</b> nenhuma fonte, jurisprudência, fato ou nota
            foi inventada. Confira as recomendações antes do protocolo.
          </p>
        </section>
      )}
    </div>
  );
}

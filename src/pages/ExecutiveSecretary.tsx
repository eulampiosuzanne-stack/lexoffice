import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import "./integrations.css";

type Run = {
  id: string;
  status: string;
  trigger_source?: string | null;
  started_at: string;
  finished_at?: string | null;
  checks?: Record<string, any> | null;
  actions?: any[] | null;
  alerts?: any[] | null;
  error?: string | null;
  attempt?: number | null;
};
type ExecutiveAction = {
  id: string;
  action_type: string;
  title: string;
  description?: string | null;
  risk_level: string;
  status: string;
  requires_suzanne: boolean;
  payload?: Record<string, any> | null;
  result?: Record<string, any> | null;
  decision_note?: string | null;
  error?: string | null;
  created_at: string;
  executed_at?: string | null;
};
const fmt = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";
const duration = (run?: Run | null) => {
  if (!run?.finished_at) return run?.started_at ? "Em execução" : "—";
  const ms =
    new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
};
const statusMeta = (run?: Run | null) => {
  if (!run) return { label: "SEM RONDA", cls: "", icon: <Clock3 size={16} /> };
  if (run.status === "failed")
    return { label: "FALHA", cls: "", icon: <XCircle size={16} /> };
  if (
    run.status === "attention" ||
    (run.alerts || []).some(
      (a: any) => a?.severity === "failure" && !a?.corrected,
    )
  )
    return { label: "ATENÇÃO", cls: "", icon: <AlertTriangle size={16} /> };
  return { label: "OPERACIONAL", cls: "ok", icon: <CheckCircle2 size={16} /> };
};

export default function ExecutiveSecretary() {
  const [runs, setRuns] = useState<Run[]>([]),
    [actions, setActions] = useState<ExecutiveAction[]>([]),
    [busy, setBusy] = useState(false),
    [decisionId, setDecisionId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.org_id) {
      setError("Organização não identificada.");
      setBusy(false);
      return;
    }
    const [runResult, actionResult] = await Promise.all([
      supabase
        .from("executive_dispatch_runs")
        .select(
          "id,status,trigger_source,started_at,finished_at,checks,actions,alerts,error,attempt",
        )
        .eq("org_id", profile.org_id)
        .order("started_at", { ascending: false })
        .limit(30),
      supabase
        .from("executive_action_queue")
        .select(
          "id,action_type,title,description,risk_level,status,requires_suzanne,payload,result,decision_note,error,created_at,executed_at",
        )
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (runResult.error) setError(runResult.error.message);
    else setRuns((runResult.data || []) as Run[]);
    if (actionResult.error) setError(actionResult.error.message);
    else setActions((actionResult.data || []) as ExecutiveAction[]);
    setBusy(false);
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);
  async function decide(id: string, decision: "approve" | "reject") {
    if (!supabase) return;
    setDecisionId(id);
    setError("");
    setNotice("");
    const { error: e } = await supabase.rpc("decide_executive_action", {
      p_action_id: id,
      p_decision: decision,
      p_note:
        decision === "approve"
          ? "Aprovado por Suzanne no painel executivo."
          : "Rejeitado por Suzanne no painel executivo.",
    });
    setDecisionId("");
    if (e) {
      setError(e.message);
      return;
    }
    setNotice(
      decision === "approve"
        ? "Ação aprovada. O Dispatcher executará na próxima ronda."
        : "Ação rejeitada.",
    );
    await load();
  }
  const last = runs[0] || null,
    meta = statusMeta(last),
    checks = last?.checks || {},
    alerts = last?.alerts || [],
    runActions = last?.actions || [];
  const next = last?.started_at
    ? new Date(
        Math.ceil((new Date(last.started_at).getTime() + 1) / 300000) * 300000,
      )
    : null;
  const pending = useMemo(
    () => actions.filter((a) => a.status === "awaiting_approval"),
    [actions],
  );
  const requiringSuzanne = [
    ...pending,
    ...alerts.filter((a: any) => a?.severity === "failure" && !a?.corrected),
  ];
  const indicators = [
    ["WhatsApp", checks.whatsapp_connections, checks.whatsapp_connections > 0],
    [
      "Gláucia",
      checks.glaucia_connected ? "Conectada" : "Desconectada",
      checks.glaucia_connected === true,
    ],
    [
      "Agentes ativos",
      checks.agents_active ?? checks.agents,
      (checks.agents_active ?? checks.agents) > 0,
    ],
    [
      "Conversas aguardando",
      checks.unattended ?? 0,
      (checks.unattended ?? 0) === 0,
    ],
    [
      "Conflito humano/robô",
      checks.human_bot_conflicts ?? 0,
      (checks.human_bot_conflicts ?? 0) === 0,
    ],
    [
      "Mensagens com falha",
      checks.failed_messages ?? 0,
      (checks.failed_messages ?? 0) === 0,
    ],
    [
      "Cobranças atrasadas",
      checks.overdue_collections ?? 0,
      (checks.overdue_collections ?? 0) === 0,
    ],
    [
      "Revisão humana",
      checks.pending_human_reviews ?? 0,
      (checks.pending_human_reviews ?? 0) === 0,
    ],
  ];
  return (
    <>
      <div className="page-title">
        <h1>Secretário Executivo</h1>
        <p>Central de supervisão e decisões operacionais da LexOffice.</p>
      </div>
      <div className="integration-head">
        <div>
          <span className="integration-pill">
            <ShieldCheck size={14} /> LEX EXECUTIVE DISPATCHER
          </span>
          <h2>Supervisão contínua</h2>
          <p>Ronda independente, idempotente e conectada à fila executiva.</p>
        </div>
        <button className="integration-action" onClick={load} disabled={busy}>
          <RefreshCw size={16} />
          {busy ? "Atualizando..." : "Atualizar"}
        </button>
      </div>
      {error && <div className="integration-notice">{error}</div>}
      {notice && <div className="integration-notice">{notice}</div>}
      <div className="cards">
        <div className="card">
          {meta.icon}
          <strong>{meta.label}</strong>
          <span>Status do supervisor</span>
        </div>
        <div className="card">
          <Clock3 size={18} />
          <strong>{fmt(last?.started_at)}</strong>
          <span>Última ronda</span>
        </div>
        <div className="card">
          <Clock3 size={18} />
          <strong>{next ? next.toLocaleString("pt-BR") : "—"}</strong>
          <span>Próxima ronda</span>
        </div>
        <div className="card">
          <Activity size={18} />
          <strong>{duration(last)}</strong>
          <span>Duração</span>
        </div>
      </div>
      <div className="integration-panel">
        <h3>Status da LexOffice</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          {indicators.map(([label, value, ok]) => (
            <div className="signature-row" key={String(label)}>
              <div>
                <strong>{String(label)}</strong>
                <small>{String(value ?? "—")}</small>
              </div>
              <span className={`status-dot ${ok ? "ok" : ""}`}>
                {ok ? "operacional" : "atenção"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 14,
        }}
      >
        <div className="integration-panel">
          <h3>Itens que exigem Suzanne</h3>
          {requiringSuzanne.length ? (
            pending.map((action) => (
              <div className="signature-row" key={action.id}>
                <div>
                  <strong>{action.title}</strong>
                  <small>
                    {action.description || action.action_type} • risco{" "}
                    {action.risk_level}
                  </small>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      className="integration-action"
                      disabled={decisionId === action.id}
                      onClick={() => decide(action.id, "approve")}
                    >
                      Aprovar
                    </button>
                    <button
                      className="secondary"
                      disabled={decisionId === action.id}
                      onClick={() => decide(action.id, "reject")}
                    >
                      Rejeitar
                    </button>
                  </div>
                </div>
                <span className="status-dot">decisão</span>
              </div>
            ))
          ) : (
            <div className="integration-empty">
              <CheckCircle2 size={25} />
              <p>Nenhuma decisão sensível pendente.</p>
            </div>
          )}
        </div>
        <div className="integration-panel">
          <h3>Ações executadas</h3>
          {actions
            .filter((a) => a.status === "executed")
            .slice(0, 10)
            .map((action) => (
              <div className="signature-row" key={action.id}>
                <div>
                  <strong>{action.title}</strong>
                  <small>
                    {fmt(action.executed_at)} • {action.action_type}
                  </small>
                </div>
                <span className="status-dot ok">executada</span>
              </div>
            ))}
          {!actions.some((a) => a.status === "executed") && (
            <div className="integration-empty">
              <Activity size={25} />
              <p>Nenhuma ação automática registrada.</p>
            </div>
          )}
        </div>
        <div className="integration-panel">
          <h3>Alertas da última ronda</h3>
          {alerts.length ? (
            alerts.map((alert: any, index) => (
              <div className="signature-row" key={`${alert.type}-${index}`}>
                <div>
                  <strong>{alert.type || "Alerta"}</strong>
                  <small>
                    {alert.count
                      ? `${alert.count} ocorrência(s)`
                      : alert.name || "Requer verificação"}
                  </small>
                </div>
                <span className={`status-dot ${alert.corrected ? "ok" : ""}`}>
                  {alert.corrected ? "corrigido" : alert.severity || "atenção"}
                </span>
              </div>
            ))
          ) : (
            <div className="integration-empty">
              <CheckCircle2 size={25} />
              <p>Nenhum alerta na última ronda.</p>
            </div>
          )}
        </div>
      </div>
      <div className="integration-panel">
        <h3>Histórico das rondas</h3>
        <div className="signature-list">
          {runs.map((run) => {
            const current = statusMeta(run);
            return (
              <div className="signature-row" key={run.id}>
                <div>
                  <strong>
                    {current.label} • {fmt(run.started_at)}
                  </strong>
                  <small>
                    ID {run.id} • {duration(run)} • tentativa {run.attempt || 1}{" "}
                    • {(run.actions || []).length} ação(ões)
                  </small>
                </div>
                <span className={`status-dot ${current.cls}`}>
                  {run.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="integration-panel">
        <h3>Registro da última execução</h3>
        {runActions.length ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(runActions, null, 2)}
          </pre>
        ) : (
          <div className="integration-empty">
            <Activity size={25} />
            <p>A última ronda não executou ações.</p>
          </div>
        )}
      </div>
    </>
  );
}

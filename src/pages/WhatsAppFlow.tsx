import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  RefreshCw,
  MessageCircle,
  UserRound,
  UsersRound,
  CheckCircle2,
  AlertTriangle,
  Route,
  Activity,
  CircleDollarSign,
  CalendarDays,
  Scale,
  Gavel,
  Paperclip,
  ChevronRight,
  ShieldAlert,
  BriefcaseBusiness,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import "./integrations.css";
type Conversation = {
  id: string;
  status: string;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  responsible_id?: string | null;
  priority?: string | null;
  unread_count?: number;
  conversation_owner?: string | null;
  owner_agent_key?: string | null;
  bot_ativo?: boolean;
  human_takeover_at?: string | null;
  tags?: string[] | null;
  whatsapp_contacts?: {
    name?: string | null;
    profile_name?: string | null;
    phone?: string | null;
    whatsapp_id?: string | null;
  } | null;
};
type Control = {
  id: string;
  contact_key: string;
  ai_enabled: boolean;
  human_takeover: boolean;
  resume_at?: string | null;
  last_ai_message_at?: string | null;
  last_human_message_at?: string | null;
  updated_at: string;
};
type Agent = {
  agent_key: string;
  display_name?: string | null;
  active: boolean;
  model?: string | null;
  allowed_channels?: string[] | null;
};
type Alert = {
  id: string;
  agent_key: string;
  contact_phone?: string | null;
  reason: string;
  status?: string | null;
  error_message?: string | null;
  created_at: string;
};
const digits = (v: any) => String(v ?? "").replace(/\D/g, "");
const menuCards = [
  {
    title: "Sou cliente",
    desc: "Acessar meu atendimento",
    icon: <Scale size={34} />,
  },
  {
    title: "Ainda não sou cliente",
    desc: "Fazer uma triagem inicial",
    icon: <Gavel size={34} />,
  },
  {
    title: "Sou advogado",
    desc: "Contato profissional",
    icon: <BriefcaseBusiness size={34} />,
  },
  {
    title: "É uma urgência",
    desc: "Sinalizar atendimento urgente",
    icon: <ShieldAlert size={34} />,
  },
];
const flowSteps = [
  [
    "Cliente",
    "Meu processo",
    "Andamento",
    "Documentos",
    "Pagamento",
    "Agendamento",
    "Falar sobre meu caso",
    "Falar com a equipe",
  ],
  [
    "Não cliente",
    "Nome e necessidade",
    "Área jurídica",
    "Breve relato",
    "Urgência",
    "Consulta estratégica — R$ 200",
    "Pagamento antes do agendamento",
  ],
  [
    "Advogado",
    "Nome e OAB",
    "Finalidade do contato",
    "Processo ou cliente relacionado",
    "Assunto e urgência",
  ],
  [
    "Urgência",
    "Identificação rápida",
    "Prazo ou audiência",
    "Risco imediato",
    "Sinalização na LexOffice",
  ],
  [
    "Helena",
    "Identifica a intenção",
    "Lê o histórico e anexos",
    "Encaminha ao agente especializado",
    "Voltar ao menu sempre disponível",
  ],
];
export default function WhatsAppFlow() {
  const [orgId, setOrgId] = useState(""),
    [userId, setUserId] = useState(""),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [controls, setControls] = useState<Control[]>([]),
    [agents, setAgents] = useState<Agent[]>([]),
    [alerts, setAlerts] = useState<Alert[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [globalAi, setGlobalAi] = useState<boolean | null>(null);
  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId],
  );
  const contactKey =
    selected?.whatsapp_contacts?.whatsapp_id ||
    selected?.whatsapp_contacts?.phone ||
    "";
  const control = useMemo(
    () =>
      controls.find((c) =>
        [contactKey, digits(contactKey)].includes(c.contact_key),
      ) || null,
    [controls, contactKey],
  );
  const handler =
    selected?.responsible_id === userId
      ? "me"
      : selected?.tags?.includes("support")
        ? "support"
        : "ai";
  const label = (c: Conversation) =>
    c.whatsapp_contacts?.profile_name ||
    c.whatsapp_contacts?.name ||
    c.whatsapp_contacts?.phone ||
    c.whatsapp_contacts?.whatsapp_id ||
    "Contato WhatsApp";
  async function load() {
    if (!supabase) return;
    setBusy(true);
    setNotice("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
    setUserId(user.id);
    const { data: p } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!p?.org_id) {
      setBusy(false);
      return;
    }
    setOrgId(p.org_id);
    const [cv, ct, ag, al, ws] = await Promise.all([
      supabase
        .from("whatsapp_conversations")
        .select(
          "id,status,priority,unread_count,last_message_preview,last_message_at,responsible_id,tags,conversation_owner,owner_agent_key,bot_ativo,human_takeover_at,whatsapp_contacts(name,profile_name,phone,whatsapp_id)",
        )
        .eq("org_id", p.org_id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("ai_conversation_controls")
        .select(
          "id,contact_key,ai_enabled,human_takeover,resume_at,last_ai_message_at,last_human_message_at,updated_at",
        )
        .eq("org_id", p.org_id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("ai_agent_policies")
        .select("agent_key,display_name,active,model,allowed_channels")
        .eq("org_id", p.org_id)
        .contains("allowed_channels", ["whatsapp"])
        .order("display_name"),
      supabase
        .from("ai_agent_alerts")
        .select(
          "id,agent_key,contact_phone,reason,status,error_message,created_at",
        )
        .eq("org_id", p.org_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("whatsapp_settings")
        .select("ai_enabled")
        .eq("org_id", p.org_id)
        .maybeSingle(),
    ]);
    setConversations((cv.data || []) as unknown as Conversation[]);
    setControls((ct.data || []) as Control[]);
    setAgents((ag.data || []) as Agent[]);
    setAlerts((al.data || []) as Alert[]);
    setGlobalAi(ws.data?.ai_enabled !== false);
    if (!selectedId && cv.data?.[0]) setSelectedId((cv.data[0] as any).id);
    setBusy(false);
  }
  useEffect(() => {
    load();
  }, []);
  async function setHandler(mode: "ai" | "me" | "support") {
    if (!supabase || !selected || !orgId) return;
    setBusy(true);
    setNotice("");
    const now = new Date();
    const nowIso = now.toISOString();
    const human = mode !== "ai";
    const resumeAt = new Date(now.getTime() + 20 * 60 * 1000).toISOString();
    const tags =
      mode === "support"
        ? Array.from(
            new Set([
              ...(selected.tags || []).filter((t) => t !== "support"),
              "support",
            ]),
          )
        : (selected.tags || []).filter((t) => t !== "support");
    await supabase
      .from("whatsapp_conversations")
      .update({
        responsible_id: mode === "me" ? userId : null,
        tags,
        bot_ativo: !human,
        conversation_owner: human ? "HUMAN" : "HELENA",
        human_takeover_at: human ? nowIso : null,
        human_takeover_by: human ? userId : null,
        human_takeover_reason: human ? "operator_takeover" : null,
        last_human_outbound_at: human ? nowIso : null,
        updated_at: nowIso,
      })
      .eq("id", selected.id);
    if (contactKey) {
      const variants = Array.from(
        new Set([contactKey, digits(contactKey)].filter(Boolean)),
      );
      const { data: existing } = await supabase
        .from("ai_conversation_controls")
        .select("id")
        .eq("org_id", orgId)
        .in("contact_key", variants)
        .limit(1)
        .maybeSingle();
      if (existing?.id)
        await supabase
          .from("ai_conversation_controls")
          .update({
            ai_enabled: !human,
            human_takeover: human,
            human_takeover_at: human ? nowIso : null,
            last_human_message_at: human ? nowIso : null,
            resume_after_minutes: human ? 20 : 0,
            resume_at: human ? resumeAt : null,
            updated_at: nowIso,
          })
          .eq("id", existing.id);
      else
        await supabase
          .from("ai_conversation_controls")
          .insert({
            org_id: orgId,
            contact_key: digits(contactKey) || contactKey,
            ai_enabled: !human,
            human_takeover: human,
            human_takeover_at: human ? nowIso : null,
            last_human_message_at: human ? nowIso : null,
            resume_after_minutes: human ? 20 : 0,
            resume_at: human ? resumeAt : null,
          });
    }
    setNotice(
      mode === "ai"
        ? "Helena reativada somente para este contato."
        : mode === "me"
          ? "Conversa atribuída a você; agentes em silêncio por pelo menos 20 minutos."
          : "Conversa enviada à equipe; agentes em silêncio por pelo menos 20 minutos.",
    );
    await load();
  }
  const lanes = [
    { key: "entrada", title: "Entrada", match: (c: Conversation) => ["new","open","entrada"].includes(String(c.status).toLowerCase()) && !c.human_takeover_at },
    { key: "triagem", title: "Triagem", match: (c: Conversation) => ["triage","triagem"].includes(String(c.status).toLowerCase()) || c.tags?.includes("triagem") },
    { key: "cliente", title: "Aguardando cliente", match: (c: Conversation) => ["waiting_client","aguardando_cliente"].includes(String(c.status).toLowerCase()) || c.tags?.includes("aguardando_cliente") },
    { key: "pagamento", title: "Aguardando pagamento", match: (c: Conversation) => ["waiting_payment","aguardando_pagamento"].includes(String(c.status).toLowerCase()) || c.tags?.includes("aguardando_pagamento") },
    { key: "agenda", title: "Agendamento", match: (c: Conversation) => ["scheduling","agendamento"].includes(String(c.status).toLowerCase()) || c.tags?.includes("agendamento") },
    { key: "atendimento", title: "Em atendimento", match: (c: Conversation) => ["in_progress","em_atendimento"].includes(String(c.status).toLowerCase()) && c.conversation_owner !== "HUMAN" },
    { key: "humano", title: "Humano assumiu", match: (c: Conversation) => c.conversation_owner === "HUMAN" || !!c.human_takeover_at },
    { key: "followup", title: "Follow-up", match: (c: Conversation) => ["follow_up","followup"].includes(String(c.status).toLowerCase()) || c.tags?.includes("follow_up") },
    { key: "concluido", title: "Concluído", match: (c: Conversation) => ["closed","done","concluido"].includes(String(c.status).toLowerCase()) },
  ];
  const laneFor = (c: Conversation) => lanes.find((l) => l.match(c))?.key || "entrada";
  const age = (iso?: string | null) => {
    if (!iso) return "sem horário";
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
  };
  const recentForSelected = alerts
    .filter(
      (a) =>
        !contactKey ||
        [contactKey, digits(contactKey)].includes(a.contact_phone || ""),
    )
    .slice(0, 10);
  const tileStyle = {
    border: "1px solid rgba(220,38,38,.3)",
    borderRadius: 18,
    padding: "22px 16px",
    minHeight: 150,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    gap: 8,
    background:
      "linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.02))",
  };
  return (
    <>
      <div className="page-title">
        <h1>Fluxo WhatsApp</h1>
        <p>Helena + agentes especializados + atendimento humano.</p>
      </div>
      <div className="integration-panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <span className="integration-pill">
              <Route size={14} /> CHATBOT VISUAL
            </span>
            <h2 style={{ margin: "8px 0 4px" }}>Menu inicial em quadrinhos</h2>
            <p style={{ margin: 0, opacity: 0.75 }}>
              Este é o quadro do chatbot. As opções ficam organizadas em grade,
              sem usar uma imagem única como menu.
            </p>
          </div>
          <span className="status-dot ok">ativo</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2,minmax(0,1fr))",
            gap: 14,
            maxWidth: 760,
            margin: "20px auto 8px",
          }}
        >
          {menuCards.map((c) => (
            <div key={c.title} style={tileStyle}>
              <div style={{ color: "#d4af37" }}>{c.icon}</div>
              <strong style={{ fontSize: 19 }}>{c.title}</strong>
              <span style={{ opacity: 0.72, fontSize: 14 }}>{c.desc}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="integration-panel">
        <div className="wa-board-head">
          <div><span className="eyebrow">CAIXAS DO ATENDIMENTO</span><h3>Central de conversas</h3></div>
          <span className="integration-pill">{conversations.length} conversas</span>
        </div>
        <div className="wa-kanban">
          {lanes.map((lane) => {
            const items = conversations.filter((c) => laneFor(c) === lane.key);
            return <section className="wa-lane" key={lane.key}>
              <header><strong>{lane.title}</strong><span>{items.length}</span></header>
              <div className="wa-lane-body">
                {items.slice(0,20).map((c) => <button key={c.id} className={`wa-chat-card ${selectedId===c.id?"selected":""}`} onClick={()=>setSelectedId(c.id)}>
                  <div className="wa-chat-card-top"><strong>{label(c)}</strong>{String(c.priority).toLowerCase()==="high" && <b>URGENTE</b>}</div>
                  <p>{c.last_message_preview || "Sem mensagem"}</p>
                  <footer><span>{c.conversation_owner==="HUMAN"?"Humano":c.owner_agent_key || "Helena"}</span><span>{age(c.last_message_at)}</span></footer>
                </button>)}
                {!items.length && <div className="wa-lane-empty">Nenhuma conversa</div>}
              </div>
            </section>;
          })}
        </div>
      </div>
      <div className="integration-panel">
        <h3>Etapas do atendimento</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          {flowSteps.map((s, i) => (
            <div
              key={s[0]}
              style={{
                ...tileStyle,
                alignItems: "stretch",
                textAlign: "left",
                minHeight: 170,
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.6 }}>ETAPA {i + 2}</span>
              <strong>{s[0]}</strong>
              {s.slice(1).map((x) => (
                <span
                  key={x}
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    fontSize: 13,
                    opacity: 0.8,
                  }}
                >
                  <ChevronRight size={13} />
                  {x}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="integration-head">
        <div>
          <span className="integration-pill">
            <Route size={14} /> FLUXO EM TEMPO REAL
          </span>
          <h2>Monitor e controle do atendimento</h2>
          <p>
            Controle das conversas, agentes, takeover e pausa humana de 20
            minutos.
          </p>
        </div>
        <button className="integration-action" onClick={load} disabled={busy}>
          <RefreshCw size={16} />
          {busy ? "Atualizando..." : "Atualizar"}
        </button>
      </div>
      {notice && <div className="integration-notice">{notice}</div>}
      <div className="integration-panel">
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <strong>IA global</strong>
            <p style={{ margin: "4px 0 0" }}>
              {globalAi === null
                ? "Verificando..."
                : globalAi
                  ? "Ativa para o escritório"
                  : "Pausada para o escritório"}
            </p>
          </div>
          <small>A retomada é feita por conversa, após validação do estado.</small>
        </div>
      </div>
      <div className="integration-panel">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(250px,.7fr) minmax(0,1.5fr)",
            gap: 14,
          }}
        >
          <div
            className="signature-list"
            style={{ maxHeight: 650, overflow: "auto" }}
          >
            {conversations.map((c) => (
              <button
                key={c.id}
                className={`signature-row ${selectedId === c.id ? "selected" : ""}`}
                onClick={() => setSelectedId(c.id)}
                style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
              >
                <div>
                  <strong>{label(c)}</strong>
                  <small>{c.last_message_preview || "Sem mensagem"}</small>
                </div>
              </button>
            ))}
          </div>
          <div>
            {!selected ? (
              <div className="integration-empty">
                <MessageCircle size={28} />
                <p>Selecione uma conversa.</p>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <span className="eyebrow">CONTATO</span>
                    <h2 style={{ margin: "4px 0" }}>{label(selected)}</h2>
                    <small>
                      {contactKey || "Identificador não encontrado"}
                    </small>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className={`integration-action ${handler === "ai" ? "selected" : ""}`}
                      onClick={() => setHandler("ai")}
                      disabled={busy}
                    >
                      <Bot size={14} />
                      Agente IA
                    </button>
                    <button
                      className={`secondary ${handler === "me" ? "selected" : ""}`}
                      onClick={() => setHandler("me")}
                      disabled={busy}
                    >
                      <UserRound size={14} />
                      Eu
                    </button>
                    <button
                      className={`secondary ${handler === "support" ? "selected" : ""}`}
                      onClick={() => setHandler("support")}
                      disabled={busy}
                    >
                      <UsersRound size={14} />
                      Suporte
                    </button>
                  </div>
                </div>
                <div className="cards" style={{ marginTop: 18 }}>
                  <div className="card">
                    <Activity size={18} />
                    <strong>{globalAi ? "ATIVA" : "PAUSADA"}</strong>
                    <span>1. IA global</span>
                  </div>
                  <div className="card">
                    <MessageCircle size={18} />
                    <strong>RECEBIDA</strong>
                    <span>2. Conversa registrada</span>
                  </div>
                  <div className="card">
                    <Bot size={18} />
                    <strong>
                      {control?.ai_enabled !== false && !control?.human_takeover
                        ? "ATIVO"
                        : "PAUSADO"}
                    </strong>
                    <span>3. Controle do contato</span>
                  </div>
                  <div className="card">
                    <CheckCircle2 size={18} />
                    <strong>
                      {handler === "ai"
                        ? "IA"
                        : handler === "me"
                          ? "VOCÊ"
                          : "SUPORTE"}
                    </strong>
                    <span>4. Responsável</span>
                  </div>
                </div>
                <div className="integration-panel" style={{ marginTop: 16 }}>
                  <h3>Agentes disponíveis no WhatsApp</h3>
                  <div className="signature-list">
                    {agents.map((a) => (
                      <div className="signature-row" key={a.agent_key}>
                        <div>
                          <strong>{a.display_name || a.agent_key}</strong>
                          <small>
                            {a.agent_key} • {a.model || "modelo padrão"}
                          </small>
                        </div>
                        <span className={`status-dot ${a.active ? "ok" : ""}`}>
                          {a.active ? "ativo" : "pausado"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="integration-panel" style={{ marginTop: 16 }}>
                  <h3>Falhas e alertas recentes deste contato</h3>
                  {recentForSelected.length === 0 ? (
                    <div className="integration-empty">
                      <CheckCircle2 size={25} />
                      <p>Nenhuma falha recente registrada para este contato.</p>
                    </div>
                  ) : (
                    <div className="signature-list">
                      {recentForSelected.map((a) => (
                        <div className="signature-row" key={a.id}>
                          <div>
                            <strong>
                              <AlertTriangle size={14} /> {a.reason}
                            </strong>
                            <small>
                              {a.agent_key} •{" "}
                              {new Date(a.created_at).toLocaleString("pt-BR")}
                              {a.error_message ? ` • ${a.error_message}` : ""}
                            </small>
                          </div>
                          <span className="status-dot">
                            {a.status || "alerta"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Bell, CalendarDays, Check, CheckSquare, ChevronRight, CircleDollarSign, ClipboardList, Clock3, FileText, FolderOpen, Gavel, Megaphone, MessageCircle, Scale, Search, Users, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { inactiveProcesses } from "../lib/managementPanel";


type Row = Record<string, any>;
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const dateKey = (v?: string) => v ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(v)) : "";
const hour = (v?: string) => v ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—";
const shortDate = (v?: string) => v ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).format(new Date(v)).replace(".", "") : "—";
const isHearing = (x: Row) => /audi[eê]ncia/i.test((x.event_type || "") + " " + (x.title || "") + " " + (x.hearing_type || ""));
const closingStatuses = "(completed,concluido,concluida,concluída,done,encerrado,closed,archived,arquivado,cancelled,canceled,cancelado)";

export default function DashboardOverview({ financeBlocked = false }: { financeBlocked?: boolean }) {
  const go = useNavigate();
  const [profile, setProfile] = useState<Row>({});
  const [data, setData] = useState<Row | null>(null);
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { if (alive) setData({ error: true }); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) setData({ error: true }); return; }
      const { data: person, error: profileError } = await supabase.from("profiles").select("org_id,name").eq("id", user.id).maybeSingle();
      if (profileError || !person?.org_id) { if (alive) setData({ error: true }); return; }
      if (alive) setProfile(person);
      const today = dateKey(new Date().toISOString());
      const start = today + "T00:00:00-03:00";
      const end = today + "T23:59:59-03:00";
      const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const financeQuery = financeBlocked
        ? Promise.resolve({ data: null, count: null, error: null })
        : supabase.from("financial_entries").select("id,amount,status,paid_at,due_date", { count: "exact" }).eq("org_id", person.org_id).eq("type", "income").in("status", ["pending", "overdue"]).limit(1000);
      const results = await Promise.all([
        supabase.from("processes").select("id", { count: "exact", head: true }).eq("org_id", person.org_id).not("status", "in", closingStatuses),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("org_id", person.org_id).eq("status", "active"),
        supabase.from("process_hearings").select("id,title,hearing_type,starts_at,process_id", { count: "exact" }).eq("org_id", person.org_id).gte("starts_at", start).lte("starts_at", threeDays).order("starts_at").limit(100),
        supabase.from("calendar_events").select("id,title,description,starts_at,location,event_type,status,process_id").eq("org_id", person.org_id).gte("starts_at", start).lte("starts_at", threeDays).neq("status", "cancelled").order("starts_at").limit(100),
        supabase.from("office_tasks").select("id,title,notes,priority,due_date,created_at,done_at").eq("org_id", person.org_id).eq("scope", "geral").is("done_at", null).order("due_date", { ascending: true, nullsFirst: false }).limit(150),
        supabase.from("process_deadlines").select("id,title,due_at,status,priority,process_id").eq("org_id", person.org_id).not("status", "in", closingStatuses).lte("due_at", threeDays).order("due_at").limit(100),
        supabase.from("process_movements").select("id,title,description,movement_date,created_at,process_id", { count: "exact" }).eq("org_id", person.org_id).gte("created_at", dayAgo).order("created_at", { ascending: false }).limit(100),
        supabase.from("client_app_inbox").select("id,kind,subject,created_at", { count: "exact" }).eq("org_id", person.org_id).is("read_at", null).order("created_at", { ascending: false }).limit(100),
        supabase.from("process_last_activity").select("process_id,status,updated_at,latest_movement_at").limit(5000),
        financeQuery,
      ]);
      const [processes, clients, hearings, events, tasks, deadlines, movements, inbox, lastActivity, finance] = results;
      if (!alive) return;
      const staleCount = lastActivity.error ? null : inactiveProcesses(lastActivity.data || [], 30).length;
      setData({
        error: false,
        processes: processes.error ? null : (processes.count ?? 0),
        clients: clients.error ? null : (clients.count ?? 0),
        hearingsCount: hearings.error ? null : (hearings.count ?? (hearings.data || []).length),
        hearings: hearings.error ? null : (hearings.data || []),
        events: events.error ? null : (events.data || []),
        tasks: tasks.error ? null : (tasks.data || []),
        deadlines: deadlines.error ? null : (deadlines.data || []),
        movements: movements.error ? null : (movements.data || []),
        movementsCount: movements.error ? null : (movements.count ?? (movements.data || []).length),
        inbox: inbox.error ? null : (inbox.data || []),
        inboxCount: inbox.error ? null : (inbox.count ?? (inbox.data || []).length),
        staleCount,
        finance: financeBlocked ? "restricted" : finance.error ? null : (finance.count ?? (finance.data || []).length),
      });
    })().catch((error) => { console.error("Falha ao carregar o painel SF", error); if (alive) setData({ error: true }); });
    return () => { alive = false; };
  }, [financeBlocked]);

  const today = dateKey(new Date().toISOString());
  const hearingsToday = useMemo(() => {
    if (!data) return [];
    const fromEvents = (data.events || []).filter(isHearing);
    const all = [...(data.hearings || []), ...fromEvents];
    const unique = new Map<string, Row>();
    for (const item of all) {
      if (dateKey(item.starts_at) !== today) continue;
      unique.set(String(item.starts_at) + "|" + String(item.title || item.hearing_type || ""), item);
    }
    return [...unique.values()];
  }, [data, today]);
  const routineRows = useMemo(() => {
    if (!data) return [];
    const rows: Row[] = [];
    (data.events || []).filter((x: Row) => dateKey(x.starts_at) === today).forEach((x: Row) => rows.push({ id: "event-" + x.id, type: "event", icon: isHearing(x) ? Gavel : CalendarDays, title: x.title || "Compromisso", meta: hour(x.starts_at) + (x.location ? " · " + x.location : ""), path: "/agenda", at: x.starts_at }));
    (data.deadlines || []).filter((x: Row) => dateKey(x.due_at) <= today).forEach((x: Row) => rows.push({ id: "deadline-" + x.id, type: "deadline", icon: Scale, title: x.title || "Prazo processual", meta: "Vence " + shortDate(x.due_at), path: "/processos", at: x.due_at }));
    (data.tasks || []).filter((x: Row) => !x.due_date || x.due_date <= today).forEach((x: Row) => rows.push({ id: "task-" + x.id, type: "task", task: x, icon: FileText, title: x.title || "Afazer", meta: x.due_date ? "Até " + shortDate(x.due_date) : (x.notes || "Sem prazo definido"), path: "/afazeres", at: x.due_date || x.created_at }));
    return rows.sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))).slice(0, 4);
  }, [data, today]);
  const alerts = useMemo(() => {
    if (!data) return [];
    const out: Row[] = [];
    const urgentDeadline = (data.deadlines || []).filter((x: Row) => x.due_at && new Date(x.due_at).getTime() <= Date.now() + 48 * 60 * 60 * 1000).sort((a: Row, b: Row) => Date.parse(a.due_at) - Date.parse(b.due_at))[0];
    if (urgentDeadline) out.push({ id: "deadline", tone: "danger", icon: AlertTriangle, title: urgentDeadline.title || "Prazo processual próximo", meta: "Vencimento " + shortDate(urgentDeadline.due_at), path: "/processos" });
    const nextHearing = [...(data.hearings || []), ...(data.events || []).filter(isHearing)].filter((x: Row) => x.starts_at && new Date(x.starts_at).getTime() >= Date.now()).sort((a: Row, b: Row) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
    if (nextHearing) out.push({ id: "hearing", tone: "warning", icon: CalendarDays, title: nextHearing.title || nextHearing.hearing_type || "Audiência agendada", meta: shortDate(nextHearing.starts_at) + " · " + hour(nextHearing.starts_at), path: "/agenda" });
    const pendingDocument = (data.inbox || []).find((x: Row) => /document|arquivo|anexo/i.test(String(x.kind || "") + " " + String(x.subject || "")));
    if (pendingDocument) out.push({ id: "document", tone: "warning", icon: FileText, title: pendingDocument.subject || "Documento recebido pelo aplicativo", meta: "Aguardando conferência", path: "/atendimento/aplicativo" });
    const movement = (data.movements || [])[0];
    if (movement) out.push({ id: "movement", tone: "success", icon: Activity, title: movement.title || "Nova movimentação registrada", meta: shortDate(movement.created_at || movement.movement_date), path: "/andamentos" });
    const unreadMessage = (data.inbox || []).find((x: Row) => x.id !== pendingDocument?.id);
    if (out.length < 4 && unreadMessage) out.push({ id: "message", tone: "info", icon: MessageCircle, title: unreadMessage.subject || "Mensagem de cliente aguardando", meta: "Aplicativo do cliente", path: "/atendimento/aplicativo" });
    return out.slice(0, 4);
  }, [data]);

  const completeTask = async (task: Row) => {
    if (!supabase || !profile.org_id || savingTask || task.done_at) return;
    setSavingTask(task.id); setActionError("");
    const completedAt = new Date().toISOString();
    const { data: updated, error } = await supabase.from("office_tasks").update({ done_at: completedAt }).eq("id", task.id).eq("org_id", profile.org_id).eq("scope", "geral").is("done_at", null).select("id");
    if (error || !updated?.length) setActionError(error?.message || "A tarefa não foi atualizada. Confira a lista de afazeres.");
    else setData((previous: Row) => previous ? { ...previous, tasks: (previous.tasks || []).map((row: Row) => row.id === task.id ? { ...row, done_at: completedAt } : row) } : previous);
    setSavingTask(null);
  };

  const shortcuts = [
    { name: "Nova Ação", desc: "Petição com IA", path: "/peticao-ia", icon: Gavel, variant: "wine" },
    { name: "Análise de Caso", desc: "Estratégia e risco", path: "/jurimetria", icon: Search, variant: "gold" },
    { name: "Honorários", desc: "Com tabela OAB", path: "/perfil-cliente/honorarios", icon: Scale, variant: "wine" },
    { name: "Agenda", desc: "Audiências e prazos", path: "/agenda", icon: CalendarDays, variant: "gold" },
    { name: "Documentos", desc: "Dossiês e anexos", path: "/documentos", icon: FolderOpen, variant: "wine" },
    { name: "Marketing", desc: "Conteúdo e redes", path: "/marketing", icon: Megaphone, variant: "gold" },
    { name: "Relatórios", desc: "Gestão do escritório", path: "/relatorios", icon: BarChart3, variant: "wine" },
  ];
  const todayTasks = (data?.tasks || []).filter((x: Row) => !x.due_date || x.due_date <= today).length;
  const pendingDeadlines = (data?.deadlines || []).filter((x: Row) => dateKey(x.due_at) <= dateKey(new Date(Date.now() + 3 * 86400000).toISOString())).length;
  const movementCount = data?.movementsCount;
  const documentCount = (data?.inbox || []).filter((x: Row) => /document|arquivo|anexo/i.test(String(x.kind || "") + " " + String(x.subject || ""))).length;
  const hotline = [
    { icon: CalendarDays, label: "Audiências hoje", value: data ? (data.hearings ? hearingsToday.length : "—") : "—" },
    { icon: Clock3, label: "Prazos próximos", value: data?.deadlines ? pendingDeadlines : "—" },
    { icon: Activity, label: "Andamentos em 24h", value: movementCount ?? "—" },
    { icon: FolderOpen, label: "Sem atualização há 30+ dias", value: data?.staleCount ?? "—" },
  ];

  return <div className="home-command">
    <section className="sf-hero-banner" aria-label="Banner ilustrado original Superadvogadas SF">
      <img src="/brand/superadvogadas-banner.png" alt="As três Superadvogadas SF voam ao lado da Guardiã SF sobre a cidade iluminada. À direita, o slogan Mais que direito, soluções para a sua vida, Organização, Produtividade, Estratégia e Crescimento, e a sede Suzanne Figueiredo Advocacia e Soluções Jurídicas." decoding="async" fetchPriority="high" />
    </section>
    <section className="hc-primary-actions" aria-label="Ações principais do escritório">
      <div className="hc-primary-actions-grid">{shortcuts.map((item) => { const Icon = item.icon; return <button type="button" className={"sf-3d-action sf-3d-" + item.variant} key={item.name} disabled={item.name === "Honorários" && financeBlocked} aria-label={item.name === "Honorários" && financeBlocked ? "Honorários indisponíveis para esta permissão" : item.name} onClick={() => { if (!(item.name === "Honorários" && financeBlocked)) go(item.path); }}><Icon size={30} strokeWidth={1.8} aria-hidden="true" /><strong>{item.name}</strong><small>{item.desc}</small></button>; })}</div>
    </section>

    <div className="hc-dashboard-top">
      <section className="hc-panel hc-routine" aria-labelledby="hc-routine-title">
        <header className="hc-panel-title"><div><span><ClipboardList size={21} /></span><div><h2 id="hc-routine-title">Minha Rotina de Hoje</h2><p>Tarefas, compromissos e prazos registrados</p></div></div><button type="button" onClick={() => go("/afazeres")}>Ver todas <ChevronRight size={16} /></button></header>
        {actionError && <p className="hc-inline-error" role="alert">{actionError}</p>}
        {!data ? <div className="hc-skeleton" aria-label="Carregando rotina" /> : routineRows.length ? <ul className="hc-routine-list">{routineRows.map((row: Row) => {
          const Icon = row.icon;
          return <li key={row.id} className={row.type === "task" && row.task.done_at ? "is-complete" : ""}>
            {row.type === "task" ? <button type="button" className={"hc-task-check" + (row.task.done_at ? " done" : "")} aria-label={row.task.done_at ? "Tarefa concluída" : "Marcar tarefa como concluída"} disabled={Boolean(row.task.done_at) || savingTask === row.task.id} onClick={() => void completeTask(row.task)}>{row.task.done_at ? <Check size={14} /> : null}</button> : <span className="hc-routine-check" aria-hidden="true" />}
            <button type="button" className="hc-routine-item" onClick={() => go(row.path)}><Icon size={19} aria-hidden="true" /><span><strong>{row.title}</strong><small>{row.meta}</small></span><ChevronRight size={16} aria-hidden="true" /></button>
          </li>;
        })}</ul> : <div className="hc-calm"><CheckSquare size={24} /><strong>Nenhuma tarefa, audiência ou prazo para hoje foi encontrado nas fontes consultadas.</strong><button type="button" onClick={() => go("/afazeres")}>Abrir Afazeres</button></div>}
      </section>

      <section className="hc-panel hc-summary" aria-labelledby="hc-summary-title">
        <header className="hc-panel-title"><div><span><BarChart3 size={21} /></span><div><h2 id="hc-summary-title">Resumo do Escritório</h2><p>Indicadores reais conforme os registros e permissões</p></div></div></header>
        <div className="hc-summary-grid">
          {[
            { icon: FolderOpen, value: data?.processes ?? "—", label: "Processos ativos", path: "/processos" },
            { icon: Users, value: data?.clients ?? "—", label: "Clientes ativos", path: "/clientes" },
            { icon: CalendarDays, value: data?.hearingsCount ?? "—", label: "Audiências · próximos 3 dias", path: "/agenda" },
            { icon: CircleDollarSign, value: data?.finance === "restricted" ? "Restrito" : data?.finance ?? "—", label: "Financeiro pendente", path: financeBlocked ? null : "/financeiro" },
          ].map((item) => { const Icon = item.icon; return <button type="button" key={item.label} className="hc-summary-tile" onClick={() => item.path && go(item.path)} disabled={!item.path}><Icon size={26} aria-hidden="true" /><strong>{item.value}</strong><span>{item.label}</span></button>; })}
        </div>
      </section>
    </div>

    <div className="hc-dashboard-bottom">
      <section className="hc-panel hc-character-card hc-donna" aria-labelledby="hc-donna-title">
        <header className="hc-panel-title"><div><span><ClipboardList size={20} /></span><div><h2 id="hc-donna-title">Donna – Briefing Diário</h2><p>Prioridades baseadas nos dados do escritório</p></div></div></header>
        <div className="hc-character-content">
          <div className="hc-character-portrait"><img src="/brand/donna-sf.webp" alt="Donna, a Superadvogada de cabelos escuros e óculos, com seu notebook SF" width="158" height="189" loading="lazy" decoding="async" /></div>
          <div className="hc-character-details">
            <ul className="hc-brief-list">{hotline.map((item) => { const Icon = item.icon; return <li key={item.label}><Icon size={15} aria-hidden="true" /><span>{item.label}</span><strong>{item.value}</strong></li>; })}</ul>
            <button type="button" className="hc-gold-action" onClick={() => go("/donna")}>Ver briefing completo <ChevronRight size={17} /></button>
          </div>
        </div>
      </section>

      <section className="hc-panel hc-character-card hc-helena" aria-labelledby="hc-helena-title">
        <header className="hc-panel-title"><div><span><MessageCircle size={20} /></span><div><h2 id="hc-helena-title">IA Helena – Concierge Jurídica</h2><p>Acesso à Helena já configurada no LexOffice</p></div></div></header>
        <div className="hc-character-content">
          <div className="hc-character-portrait"><img src="/brand/helena-sf.webp" alt="Helena, Superadvogada loira com headset e roupa vinho e dourada" width="168" height="189" loading="lazy" decoding="async" /></div>
          <div className="hc-character-details">
            <ul className="hc-capability-list">
              <li><Check size={16} />Analisar documentos</li>
              <li><Check size={16} />Sugerir petições</li>
              <li><Check size={16} />Resumir andamentos</li>
              <li><Check size={16} />Identificar prazos</li>
              <li><Check size={16} />Preparar comunicações</li>
            </ul>
            <button type="button" className="hc-gold-action" onClick={() => go("/agentes-ia")}><MessageCircle size={17} />Falar com a Helena</button>
          </div>
        </div>
      </section>

      <section className="hc-panel hc-alerts" aria-labelledby="hc-alerts-title">
        <header className="hc-panel-title"><div><span><Bell size={21} /></span><div><h2 id="hc-alerts-title">Alertas e Prioridades</h2><p>Somente itens reais consultados</p></div></div></header>
        {!data ? <div className="hc-skeleton" aria-label="Carregando alertas" /> : alerts.length ? <ul className="hc-alert-list">{alerts.map((item: Row) => { const Icon = item.icon; return <li key={item.id}><button type="button" onClick={() => go(item.path)}><span className={"hc-alert-icon " + item.tone}><Icon size={16} /></span><span><strong>{item.title}</strong><small>{item.meta}</small></span><ChevronRight size={16} /></button></li>; })}</ul> : <div className="hc-calm hc-alert-empty"><CheckSquare size={23} /><strong>Nenhum alerta foi retornado pelas fontes consultadas.</strong><button type="button" onClick={() => go("/agenda")}>Consultar agenda</button></div>}
      </section>
    </div>
  </div>;
}

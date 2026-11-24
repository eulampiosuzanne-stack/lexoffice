import InternalNavigation from '../components/InternalNavigation';
import { useEffect, useMemo, useState } from "react";
import {
  Compass,
  Search,
  Loader2,
  Gavel,
  ListChecks,
  CalendarClock,
  FileSignature,
  FileCheck2,
  Scale,
  AlertTriangle,
  CheckCircle2,
  X,
  Copy,
  Download,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  History,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { normalizeProcessPole, persistProcessRepresentation } from "../lib/processRepresentation";
import "./integrations.css";
import "./document-library.css";
import "./petition-assistant.css";
import "./conducao-processual.css";

// Condução Processual: depois do ajuizamento, a LEX acompanha o processo fase a fase, de acordo com o perfil
// do juízo (pesquisa pública da vara no DJEN, função judge-analysis), controla prazos e o checklist de provas
// e redige as minutas para a Dra. revisar e protocolar. Nada é protocolado nem enviado ao cliente daqui.

type Proc = {
  id: string;
  client_id?: string | null;
  cnj_number?: string | null;
  internal_number?: string | null;
  subject?: string | null;
  class_name?: string | null;
  vara?: string | null;
  comarca?: string | null;
  court?: string | null;
  area?: string | null;
  status?: string | null;
  is_confidential?: boolean | null;
  opposing_party?: string | null;
  pole?: string | null;
  clients?: { name?: string | null } | null;
};
type Mov = {
  id: string;
  movement_date: string;
  title?: string | null;
  description?: string | null;
  source?: string | null;
};
type Deadline = {
  id: string;
  title: string;
  due_at: string;
  status: string;
  priority?: string | null;
  description?: string | null;
};
type Hearing = {
  id: string;
  title?: string | null;
  starts_at: string;
  hearing_type?: string | null;
  status?: string | null;
  location?: string | null;
};
type Check = { item: string; done: boolean; origem?: string };
type Draft = {
  id: string;
  kind: string;
  title: string;
  content: string;
  created_at: string;
};

export const PHASES = [
  {
    key: "citacao",
    label: "Citação e resposta do réu",
    re: /cita[cç][aã]o|cite-se|mandado de cita|aguardando contesta|distribu[ií]d/,
  },
  {
    key: "replica",
    label: "Contestação / Réplica",
    re: /contesta[cç][aã]o|r[eé]plica|impugna[cç][aã]o [àa] contesta/,
  },
  {
    key: "provas",
    label: "Especificação de provas",
    re: /especifi\w* (as )?provas|especifica[cç][aã]o de provas|provas que pretendem produzir|indiquem as provas/,
  },
  {
    key: "saneamento",
    label: "Saneamento",
    re: /saneamento|saneador|pontos? controvertidos?/,
  },
  {
    key: "instrucao",
    label: "Instrução (perícia / audiência)",
    re: /per[ií]cia|perito|laudo|audi[eê]ncia de instru|instru[cç][aã]o e julgamento|rol de testemunhas/,
  },
  {
    key: "alegacoes",
    label: "Alegações finais / Memoriais",
    re: /alega[cç][oõ]es finais|memoriais|encerrada a instru/,
  },
  {
    key: "sentenca",
    label: "Sentença",
    re: /senten[cç]a|julgo (parcialmente )?(im)?procedente/,
  },
  {
    key: "recurso",
    label: "Recurso",
    re: /apela[cç][aã]o|recurso|contrarraz|ac[oó]rd[aã]o|embargos de declara/,
  },
  {
    key: "cumprimento",
    label: "Cumprimento de sentença",
    re: /cumprimento de senten|execu[cç][aã]o|penhora|bacenjud|sisbajud|alvar[aá]/,
  },
] as const;
type PhaseKey = (typeof PHASES)[number]["key"];
const norm = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// A fase atual é a mais avançada que aparece nos andamentos (o processo só anda para frente).
export function detectPhase(movs: { title?: string | null; description?: string | null; movement_date?: string | null }[]): PhaseKey {
  // Usar a movimentação relevante mais recente; fases podem retroceder após recurso/anulação.
  const ordered = [...movs].sort((a,b)=>String(b.movement_date || "").localeCompare(String(a.movement_date || "")));
  for (const m of ordered) {
    const t = norm(`${m.title || ""} ${String(m.description || "").slice(0,1500)}`);
    // Uma referência histórica a sentença não deve prevalecer sobre uma intimação atual.
    for (const p of [...PHASES].reverse()) if (p.re.test(t)) return p.key;
  }
  return "citacao";
}

const GUIDE: Record<
  PhaseKey,
  { foco: string; passos: string[]; minutas: string[] }
> = {
  citacao: {
    foco: "Garantir a citação válida e preparar a réplica antes de a contestação chegar.",
    passos: [
      "Conferir se o mandado/AR de citação voltou positivo; se negativo, pedir nova diligência ou citação por outro meio.",
      "Acompanhar o prazo de contestação do réu.",
      "Separar desde já os documentos que rebatem as defesas mais prováveis.",
      "Verificar pedido de tutela pendente de apreciação.",
    ],
    minutas: ["manifestacao", "tutela"],
  },
  replica: {
    foco: "Impugnar a contestação ponto a ponto e já indicar as provas que o juízo costuma deferir.",
    passos: [
      "Ler a contestação e listar preliminares, documentos novos e fatos impeditivos.",
      "Protocolar a réplica no prazo (15 dias úteis).",
      "Rebater documentos juntados pelo réu.",
      "Antecipar, na réplica, as provas que serão requeridas.",
    ],
    minutas: ["replica", "especificacao_provas"],
  },
  provas: {
    foco: "Requerer as provas que este juízo efetivamente defere, com fundamento de pertinência.",
    passos: [
      "Especificar provas de forma justificada (pertinência e utilidade).",
      "Se o juízo tende ao julgamento antecipado, reforçar a prova documental.",
      "Indicar quesitos e assistente técnico se houver perícia.",
      "Requerer inversão do ônus da prova quando cabível.",
    ],
    minutas: ["especificacao_provas", "quesitos"],
  },
  saneamento: {
    foco: "Conferir a decisão saneadora e corrigir o que for desfavorável.",
    passos: [
      "Conferir os pontos controvertidos fixados.",
      "Pedir esclarecimentos/ajustes em 5 dias, se necessário (art. 357, §1º, CPC).",
      "Cumprir prazos para rol de testemunhas e quesitos.",
    ],
    minutas: ["manifestacao", "rol_testemunhas", "quesitos"],
  },
  instrucao: {
    foco: "Produzir a prova com o máximo aproveitamento perante este juízo.",
    passos: [
      "Apresentar rol de testemunhas e intimar quando necessário.",
      "Acompanhar a perícia e o depósito de honorários periciais.",
      "Manifestar sobre o laudo no prazo.",
      "Preparar o cliente e as testemunhas para a audiência.",
    ],
    minutas: ["rol_testemunhas", "manifestacao_laudo", "quesitos"],
  },
  alegacoes: {
    foco: "Fechar a tese com base na prova produzida.",
    passos: [
      "Apresentar alegações finais/memoriais no prazo.",
      "Destacar a prova favorável e os pontos controvertidos resolvidos.",
      "Reforçar os pedidos e os valores.",
    ],
    minutas: ["memoriais"],
  },
  sentenca: {
    foco: "Avaliar a sentença e decidir os próximos passos com o cliente.",
    passos: [
      "A Dra. comunica a sentença pessoalmente ao cliente.",
      "Avaliar embargos de declaração (5 dias úteis).",
      "Avaliar apelação (15 dias úteis) e custas de preparo.",
    ],
    minutas: ["embargos", "manifestacao"],
  },
  recurso: {
    foco: "Recurso ou contrarrazões dentro do prazo.",
    passos: [
      "Conferir prazo de apelação/contrarrazões.",
      "Conferir preparo e gratuidade.",
      "Acompanhar a distribuição na câmara e eventual sustentação oral.",
    ],
    minutas: ["contrarrazoes", "manifestacao"],
  },
  cumprimento: {
    foco: "Receber o crédito.",
    passos: [
      "Apresentar cálculo atualizado (aba Calculadoras).",
      "Requerer intimação para pagamento (art. 523 do CPC) e penhora on-line.",
      "Pedir expedição de alvará quando houver depósito.",
    ],
    minutas: ["cumprimento", "manifestacao"],
  },
};
const DRAFTS: Record<string, string> = {
  replica: "Réplica (impugnação à contestação)",
  especificacao_provas: "Especificação de provas",
  quesitos: "Quesitos para perícia",
  rol_testemunhas: "Rol de testemunhas",
  manifestacao_laudo: "Manifestação sobre o laudo pericial",
  memoriais: "Alegações finais / Memoriais",
  embargos: "Embargos de declaração",
  contrarrazoes: "Contrarrazões de apelação",
  cumprimento: "Pedido de cumprimento de sentença",
  tutela: "Reiteração do pedido de tutela de urgência",
  manifestacao: "Manifestação simples",
  contestacao: "Contestação",
  reconvencao: "Reconvenção",
  impugnacao_documentos: "Impugnação a documentos",
  impugnacao_gratuidade: "Impugnação à gratuidade da justiça",
  impugnacao_valor_causa: "Impugnação ao valor da causa",
  emenda_inicial: "Emenda à petição inicial",
  aditamento_inicial: "Aditamento da petição inicial",
  peticao_inicial: "Petição inicial",
  habilitacao: "Habilitação nos autos",
  juntada: "Petição de juntada de documentos",
  desentranhamento: "Pedido de desentranhamento",
  producao_antecipada: "Produção antecipada de prova",
  impugnacao_pericia: "Impugnação ao laudo pericial",
  agravo_instrumento: "Agravo de instrumento",
  agravo_interno: "Agravo interno",
  apelacao: "Apelação",
  recurso_inominado: "Recurso inominado",
  contrarrazoes_inominado: "Contrarrazões ao recurso inominado",
  embargos_execucao: "Embargos à execução",
  impugnacao_cumprimento: "Impugnação ao cumprimento de sentença",
  excecao_preexecutividade: "Exceção de pré-executividade",
  execucao_alimentos: "Execução de alimentos",
  justificativa_alimentos: "Justificativa em execução de alimentos",
  acordo: "Petição de homologação de acordo",
  desistência: "Pedido de desistência",
  alvara: "Pedido de expedição de alvará",
  desbloqueio: "Pedido de desbloqueio de valores",
  penhora: "Pedido de penhora / pesquisa patrimonial",
  tutela_antecipada: "Pedido de tutela provisória",
  esclarecimentos: "Pedido de esclarecimentos",
};
const DRAFT_GROUPS: Record<string,string[]> = {
  "Início e defesa":["peticao_inicial","emenda_inicial","aditamento_inicial","contestacao","reconvencao","replica","impugnacao_documentos","impugnacao_gratuidade","impugnacao_valor_causa"],
  "Provas e instrução":["especificacao_provas","quesitos","rol_testemunhas","manifestacao_laudo","impugnacao_pericia","producao_antecipada","memoriais"],
  "Decisões e recursos":["embargos","agravo_instrumento","agravo_interno","apelacao","contrarrazoes","recurso_inominado","contrarrazoes_inominado"],
  "Execução e cumprimento":["cumprimento","impugnacao_cumprimento","embargos_execucao","excecao_preexecutividade","execucao_alimentos","justificativa_alimentos","penhora","desbloqueio","alvara"],
  "Tutelas e petições diversas":["tutela","tutela_antecipada","habilitacao","juntada","desentranhamento","acordo","desistência","esclarecimentos","manifestacao"],
};
const PHASE_CHECK: Record<PhaseKey, string[]> = {
  citacao: ["Comprovante de citação juntado"],
  replica: ["Réplica protocolada", "Documentos do réu impugnados"],
  provas: ["Especificação de provas protocolada"],
  saneamento: ["Pontos controvertidos conferidos"],
  instrucao: [
    "Rol de testemunhas apresentado",
    "Quesitos apresentados",
    "Cliente preparado para a audiência",
  ],
  alegacoes: ["Memoriais protocolados"],
  sentenca: ["Cliente informado pela Dra.", "Prazo de recurso avaliado"],
  recurso: ["Recurso/contrarrazões protocolados", "Preparo conferido"],
  cumprimento: ["Cálculo atualizado", "Pedido de penhora on-line"],
};

const brDT = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const brD = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "";
const daysLeft = (v: string) =>
  Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
const safeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
const procLabel = (p?: Proc | null) =>
  p
    ? `${p.cnj_number || p.internal_number || "Sem número"} · ${p.clients?.name || "Cliente"}`
    : "";
const judgeNumber = (value: unknown, digits = 1) => {
  if (value == null || value === "" || !Number.isFinite(Number(value)))
    return "—";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: digits,
  }).format(Number(value));
};
const judgeMoney = (value: unknown) => {
  if (value == null || value === "" || !Number.isFinite(Number(value)))
    return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value));
};

async function fnError(error: any) {
  let msg = error?.message || "Falha na comunicação.";
  try {
    const ctx = error?.context;
    if (ctx?.json) {
      const j = await ctx.json();
      msg = j?.error || msg;
    }
  } catch {
    /* mantém */
  }
  return msg;
}

export default function ConducaoProcessual() {
 const [strategySection,setStrategySection]=useState('providencias');
  const [procs, setProcs] = useState<Proc[]>([]);
  const [clients, setClients] = useState<{id:string;name:string}[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [procId, setProcId] = useState(
    () => new URLSearchParams(window.location.search).get("processo") || "",
  );
  const [movs, setMovs] = useState<Mov[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisAt, setAnalysisAt] = useState("");
  const [state, setState] = useState<{
    phase_override: string | null;
    checklist: Check[];
    notes: string;
  }>({ phase_override: null, checklist: [], notes: "" });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftKind, setDraftKind] = useState("");
  const [draftText, setDraftText] = useState("");
  const [clientReportText, setClientReportText] = useState("");
  const [clientReportId, setClientReportId] = useState("");
  const [clientReportAt, setClientReportAt] = useState("");
  const [reportPublished, setReportPublished] = useState(false);
  const [draftResearch, setDraftResearch] = useState("");
  const [draftStudy, setDraftStudy] = useState("");
  const [draftProvider, setDraftProvider] = useState("");
  const [draftExtra, setDraftExtra] = useState("");
  const [caseNote, setCaseNote] = useState("");
  const [caseDocs, setCaseDocs] = useState<{id:string;name:string;created_at:string}[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newDl, setNewDl] = useState({ title: "", due: "" });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{
    kind: "ok" | "error" | "info";
    text: string;
  } | null>(null);
  const [orgId, setOrgId] = useState("");

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data: org } = await supabase.rpc("current_org_id");
      setOrgId(String(org || ""));
      if (org) {
        const {data:rows,error:clientError}=await supabase.from("clients").select("id,name").eq("org_id",String(org)).order("name").limit(2000);
        if(clientError) setNotice({kind:"error",text:"Erro ao carregar clientes: "+clientError.message});
        else setClients((rows as {id:string;name:string}[])||[]);
      }
      const { data, error } = await supabase
        .from("processes")
        .select(
          "id,client_id,cnj_number,internal_number,subject,class_name,vara,comarca,court,area,status,is_confidential,opposing_party,pole,clients(name)",
        )
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (error)
        setNotice({
          kind: "error",
          text: "Não foi possível carregar os processos: " + error.message,
        });
      setProcs((data as any) || []);
    })();
  }, []);

  const proc = useMemo(
    () => procs.find((p) => p.id === procId) || null,
    [procs, procId],
  );
  const list = useMemo(() => {
    const f = norm(filter).trim();
    const base = procs.filter(
      (p) => (p.cnj_number || "").replace(/\D/g, "").length === 20,
    );
    if (!f) return base.slice(0, 80);
    return base
      .filter((p) =>
        norm(
          `${p.cnj_number} ${p.internal_number} ${p.clients?.name} ${p.subject} ${p.opposing_party}`,
        ).includes(f),
      )
      .slice(0, 80);
  }, [procs, filter]);

  async function updateRepresentation(patch: {client_id?:string|null;pole?:string}) {
    if(!supabase||!proc||!orgId) return;
    setBusy("representation");
    setNotice(null);
    try {
      const data = await persistProcessRepresentation(supabase, proc.id, orgId, patch);
      const client = clients.find(c => c.id === data.client_id);
      setProcs(prev=>prev.map(p=>p.id===proc.id?{...p,client_id:data.client_id,pole:data.pole,clients:client?{name:client.name}:data.client_id===p.client_id?p.clients:null}:p));
      setNotice({kind:"ok",text:"Vínculo e polo atualizados."});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error as {message?:string})?.message || "Falha ao salvar o processo.";
      setNotice({kind:"error",text:"Não foi possível salvar: "+message});
    } finally {
      setBusy("");
    }
  }

  async function loadProcess(id: string) {
    if (!supabase || !id) return;
    setBusy("load");
    setNotice(null);
    setDraftText("");
    setDraftKind("");
    setClientReportText("");setClientReportId("");setClientReportAt("");setReportPublished(false);
    const [m, d, h, a, c, dr, report] = await Promise.all([
      supabase
        .from("process_movements")
        .select("id,movement_date,title,description,source")
        .eq("process_id", id)
        .order("movement_date", { ascending: false })
        .limit(200),
      supabase
        .from("process_deadlines")
        .select("id,title,due_at,status,priority,description")
        .eq("process_id", id)
        .order("due_at", { ascending: true })
        .limit(100),
      supabase
        .from("process_hearings")
        .select("id,title,starts_at,hearing_type,status,location")
        .eq("process_id", id)
        .order("starts_at", { ascending: true })
        .limit(50),
      supabase
        .from("process_judge_analyses")
        .select("result,created_at")
        .eq("process_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("process_conduction")
        .select("phase_override,checklist,notes")
        .eq("process_id", id)
        .maybeSingle(),
      supabase
        .from("process_conduction_drafts")
        .select("id,kind,title,content,created_at")
        .eq("process_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("process_conduction_jobs").select("result,updated_at")
        .eq("process_id",id).eq("stage","completed").eq("state->>mode","client_report")
        .order("updated_at",{ascending:false}).limit(1).maybeSingle(),
    ]);
    if(report.data?.result?.text){
      setClientReportText(report.data.result.text);setClientReportId(id);setClientReportAt(report.data.updated_at);
    }
    setMovs((m.data as any) || []);
    setDeadlines((d.data as any) || []);
    setHearings((h.data as any) || []);
    setAnalysis(a.data?.result || null);
    setAnalysisAt(a.data?.created_at || "");
    setState({
      phase_override: c.data?.phase_override || null,
      checklist: Array.isArray(c.data?.checklist)
        ? (c.data!.checklist as Check[])
        : [],
      notes: c.data?.notes || "",
    });
    setDrafts((dr.data as any) || []);
    setBusy("");
  }
  async function loadCaseDocs(id: string) {
    if (!supabase) return;
    const { data } = await supabase.from("documents").select("id,name,created_at").eq("process_id", id).order("created_at", { ascending: false }).limit(41);
    setCaseDocs((data as any) || []);
  }
  // Anexa a decisão (ou outro documento) ao processo: a leitura dos autos pela IA usa os documentos vinculados.
  async function attachDecision(file: File | undefined) {
    if (!supabase || !proc || !file || busy) return;
    if (!/^(application\/pdf|image\/(png|jpeg|webp)|text\/plain)$/.test(file.type)) {
      setNotice({ kind: "error", text: "Anexe a decisão em PDF, imagem (PNG, JPG ou WEBP) ou texto. Arquivo Word precisa ser salvo como PDF antes." });
      return;
    }
    if (file.size > 15 * 1024 * 1024) { setNotice({ kind: "error", text: "O arquivo passa de 15 MB. Envie uma versão menor." }); return; }
    if (caseDocs.length >= 40) { setNotice({ kind: "error", text: "Este processo já tem 40 documentos anexados, o limite para a leitura pela IA." }); return; }
    setBusy("attach");
    setNotice({ kind: "info", text: "Anexando " + file.name + "…" });
    let path = "";
    try {
      const { data: org, error: oe } = await supabase.rpc("current_org_id");
      if (oe || !org) throw new Error("Não foi possível identificar o escritório desta sessão.");
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
      path = `${org}/documents/${crypto.randomUUID()}-${safeName(file.name.replace(/\.[^.]+$/, ""))}${ext}`;
      const up = await supabase.storage.from("lexoffice-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const ins = await supabase.from("documents").insert({
        org_id: org, client_id: proc.client_id || null, process_id: proc.id, name: file.name, file_path: path,
        mime_type: file.type, size_bytes: file.size, category: "Outros",
        notes: JSON.stringify({ origem: "analise_dos_autos" }), uploaded_by: u.user.id,
      });
      if (ins.error) { await supabase.storage.from("lexoffice-documents").remove([path]); throw ins.error; }
      await loadCaseDocs(proc.id);
      setNotice({ kind: "ok", text: "Documento anexado. A manifestação passa a considerá-lo." });
    } catch (error) {
      setNotice({ kind: "error", text: "Não foi possível anexar. " + ((error as { message?: string })?.message || "") });
    } finally { setBusy(""); }
  }
  useEffect(() => {
    if (procId) {
      setCaseNote("");
      loadCaseDocs(procId);
      loadProcess(procId);
      const u = new URL(window.location.href);
      u.searchParams.set("processo", procId);
      window.history.replaceState(null, "", u.toString());
    }
  }, [procId]);

  // Análise dos autos locais, independente da disponibilidade externa do DJEN.
  // Nunca confundir uma movimentação resumida com o inteiro teor da decisão.
  const processSummary = useMemo(() => {
    const recent = [...movs].sort((a,b) => String(b.movement_date).localeCompare(String(a.movement_date))).slice(0,12);
    const pending = deadlines.filter(d => !/complet|conclu|done|cancel/i.test(d.status));
    return { recent, pending, total: movs.length };
  }, [movs, deadlines]);
  const autoPhase = useMemo(() => detectPhase(movs), [movs]);
  const phase = (state.phase_override as PhaseKey) || autoPhase;
  const phaseIdx = PHASES.findIndex((p) => p.key === phase);
  // A orientação genérica não pode contradizer uma decisão já registrada.
  // Detecção textual é um alerta preliminar, não substitui leitura do inteiro teor.
  // Diretrizes universais: nenhuma estratégia sem polo confirmado e fonte verificável.
  const polo = norm(String(proc?.pole || "").trim());
  const poloReu = normalizeProcessPole(polo) === "defendant";
  const poloAutor = normalizeProcessPole(polo) === "author";
  const decisoes = useMemo(() => movs.filter((m) =>
    /decisao|despacho|sentenca|liminar|tutela|intimacao/.test(norm(`${m.title || ""} ${m.description || ""}`))
  ), [movs]);
  const tutelaIndeferida = useMemo(() => movs.some((m) => {
    const t = norm(`${m.title || ""} ${m.description || ""}`);
    return /(indeferid|nao concedid|negad|rejeitad)/.test(t)
      && /(tutela|liminar|antecipacao|medida liminar)/.test(t);
  }), [movs]);
  const guide = useMemo(() => {
    const base = GUIDE[phase];
    const fontes = decisoes.slice(0, 3).map((m) => `Movimentação de ${m.movement_date}: ${m.title || "decisão/intimação"}`);
    const verificar = [
      "Confirmar a parte representada, o tipo de ação e os pedidos antes de recomendar atos.",
      "Conferir o inteiro teor das decisões e intimações, seus destinatários e fundamentos.",
      "Identificar o prazo e sua natureza a partir da intimação oficial, sem presumir contagem.",
      ...fontes.map((f) => `Fonte para conferência: ${f}`),
    ];
    if (!poloAutor && !poloReu) return {
      ...base,
      foco: "Polo processual não confirmado. Não é seguro recomendar estratégia até identificar quem o escritório representa.",
      passos: verificar,
    };
    if (tutelaIndeferida) return {
      ...base,
      foco: poloReu
        ? "Atuação pela parte ré: há registro de liminar não concedida. Confirmar quem a requereu e o alcance da decisão."
        : "Atuação pela parte autora: há registro de liminar não concedida. Examinar fundamentos e medidas cabíveis.",
      passos: [
        ...verificar,
        poloReu
          ? "Verificar se o indeferimento beneficia a defesa; não recomendar recurso da ré sem identificar sucumbência ou interesse recursal."
          : "Avaliar eventual agravo de instrumento (CPC, art. 1.015, I) e prazo após leitura integral da decisão.",
        "Distinguir fatos comprovados, hipóteses e providências que dependem de validação jurídica.",
      ],
    };
    if (poloReu) return {
      ...base,
      foco: "Atuação pela parte ré: verificar o estado real da defesa e as decisões antes de recomendar providências.",
      passos: [...verificar, "Confirmar citação, contestação, provas e manifestações efetivamente pendentes."],
    };
    // Mesmo para o autor, não tratar um roteiro estático como decisão judicial ou prazo confirmado.
    return {
      ...base,
      foco: `Roteiro preliminar para a parte autora: ${base.foco} Confirmar nos autos antes de executar.`,
      passos: [...verificar, ...base.passos.map((p) => `Se aplicável após conferência: ${p}`)],
    };
  }, [phase, tutelaIndeferida, poloReu, poloAutor, decisoes]);
  const nextAction = useMemo(() => {
    if (!proc) return null;
    const role = poloAutor ? "autora" : poloReu ? "ré" : "não confirmado";
    const latest = processSummary.recent[0];
    const suggested = role === "não confirmado" ? [] : (
      phase === "replica" ? (poloAutor ? ["replica"] : ["manifestacao"]) :
      phase === "provas" ? ["especificacao_provas"] :
      phase === "instrucao" ? ["rol_testemunhas","quesitos","manifestacao_laudo"] :
      phase === "alegacoes" ? ["memoriais"] :
      phase === "recurso" ? (poloReu ? ["contrarrazoes","manifestacao"] : ["manifestacao","contrarrazoes"]) :
      phase === "cumprimento" ? ["cumprimento"] :
      phase === "sentenca" ? ["embargos","manifestacao"] :
      GUIDE[phase].minutas
    );
    return {role, latest, suggested};
  }, [proc, poloAutor, poloReu, phase, processSummary]);
  const suggestedChecks = useMemo(() => {
    const fromJudge = (analysis?.analise?.provas_que_pede || analysis?.provas || [])
      .map((p: any) => `Prova: ${p?.prova || p?.item || p}`)
      .filter((s: string) => !s.includes("undefined") && !s.includes("[object"))
      .slice(0, 6);
    return [...fromJudge, "Confirmar polo, inteiro teor das decisões e prazos antes de executar providências"];
  }, [analysis]);

  async function saveState(next: typeof state) {
    setState(next);
    if (!supabase || !proc) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("process_conduction")
      .upsert({
        process_id: proc.id,
        org_id: orgId,
        phase_override: next.phase_override,
        checklist: next.checklist,
        notes: next.notes,
        updated_by: u?.user?.id || null,
        updated_at: new Date().toISOString(),
      });
    if (error)
      setNotice({
        kind: "error",
        text: "Não foi possível salvar: " + error.message,
      });
  }
  function toggleCheck(item: string, origem?: string) {
    const exists = state.checklist.find((c) => c.item === item);
    const checklist = exists
      ? state.checklist.map((c) =>
          c.item === item ? { ...c, done: !c.done } : c,
        )
      : [...state.checklist, { item, done: true, origem }];
    saveState({ ...state, checklist });
  }
  function addCheck() {
    const t = newItem.trim();
    if (!t || state.checklist.some((c) => c.item === t)) return;
    saveState({
      ...state,
      checklist: [
        ...state.checklist,
        { item: t, done: false, origem: "manual" },
      ],
    });
    setNewItem("");
  }
  function removeCheck(item: string) {
    saveState({
      ...state,
      checklist: state.checklist.filter((c) => c.item !== item),
    });
  }

  async function runAnalysis() {
    if (!supabase || !proc) return;
    setBusy("analysis");
    setNotice({
      kind: "info",
      text: "Pesquisando as publicações públicas da vara no DJEN… pode levar até 1 minuto.",
    });
    const { data, error } = await supabase.functions.invoke("judge-analysis", {
      body: { process_id: proc.id },
      headers: { "x-region": "sa-east-1" },
    });
    setBusy("");
    if (error || data?.ok === false) {
      setNotice({
        kind: "error",
        text: error
          ? await fnError(error)
          : data?.error || "A análise não foi concluída.",
      });
      return;
    }
    setAnalysis(data.result);
    setAnalysisAt(data.created_at || new Date().toISOString());
    setNotice({ kind: "ok", text: "Perfil do juízo atualizado." });
  }

  function judgeGuidanceText() {
    if (!analysis) return "";
    const a=analysis.analise||{};
    const format=(v:any)=>Array.isArray(v)?v.map(x=>typeof x==="string"?x:JSON.stringify(x)).join("; "):typeof v==="string"?v:v?JSON.stringify(v):"";
    return [
      "ANÁLISE DO JUÍZO (publicações públicas, não substitui a análise dos autos):",
      analysis.vara?.nome ? "Vara: "+analysis.vara.nome : "",
      a.resumo ? "Síntese: "+format(a.resumo) : "",
      a.estrategia ? "Estratégia sugerida: "+format(a.estrategia) : "",
      a.provas_que_pede||analysis.provas ? "Provas observadas: "+format(a.provas_que_pede||analysis.provas) : "",
      a.alertas ? "Alertas: "+format(a.alertas) : "",
      analysis.dicas ? "Dicas: "+format(analysis.dicas) : "",
      a.confianca ? "Confiança: "+format(a.confianca) : "",
      "Usar apenas quando pertinente aos fatos e à fase deste processo. Não presumir decisões ou tendências individuais."
    ].filter(Boolean).join("\n");
  }

  async function runLegalJob(body: Record<string, unknown>) {
    if (!supabase) throw new Error("Conexão indisponível.");
    const jobKey="lexoffice:conduction:"+String(body.process_id)+":"+String(body.mode||body.title||"draft");
    let savedJob: {id:string;signature:string}|null=null;
    const signature=JSON.stringify(body);
    try{savedJob=JSON.parse(sessionStorage.getItem(jobKey)||"null");}catch{/* Ignore unavailable browser storage. */}
    let response = await supabase.functions.invoke("process-conduction-research", {body:savedJob?.signature===signature?{job_id:savedJob.id}:body});
    for (let step=0; step<24; step++) {
      if(response.error)throw new Error(await fnError(response.error));
      if(!response.data?.ok)throw new Error(response.data?.error||"Processamento não concluído.");
      if(!response.data.pending){try{sessionStorage.removeItem(jobKey);}catch{}return response.data;}
      try{sessionStorage.setItem(jobKey,JSON.stringify({id:response.data.job_id,signature}));}catch{}
      const labels: Record<string,string>={reading:"Lendo os autos por lotes",study:"Relacionando fatos, provas e estudo do juízo",report:"Preparando o relatório ao cliente",research:"Conferindo fontes oficiais",draft:"Redigindo a peça"};
      setNotice({kind:"info",text:(labels[response.data.stage]||"Processando")+"…"});
      response=await supabase.functions.invoke("process-conduction-research",{body:{job_id:response.data.job_id}});
    }
    throw new Error("O processamento exige acompanhamento adicional.");
  }

  async function makeDraft(kind: string) {
    if (!supabase || !proc) return;
    setDraftKind(kind);
    setBusy("draft");
    setNotice({ kind: "info", text: `Redigindo: ${DRAFTS[kind]}…` });
    setDraftResearch("");
    setDraftStudy("");
    setDraftProvider("");
    let result;
    try {
      result = {data:await runLegalJob({process_id:proc.id,kind,title:DRAFTS[kind],instructions:[caseNote.trim()?"FATOS E DECISÕES INFORMADOS PELA ADVOGADA (confirmar nos documentos anexados):\n"+caseNote.trim():"",draftExtra].filter(Boolean).join("\n\n")}),error:null};
    } catch (error) {
      setBusy("");
      setNotice({kind:"error",text:error instanceof Error?error.message:"Não foi possível confirmar a geração."});
      return;
    }
    const { data, error } = result;
    setBusy("");
    if (error || !data?.ok || !String(data?.text || "").trim()) {
      setNotice({
        kind: "error",
        text: error
          ? await fnError(error)
          : "A IA não conseguiu redigir agora. Tente de novo em instantes.",
      });
      return;
    }
    const text = String(data.text)
      .replace(/^```\w*|```$/g, "")
      .replace(/\*\*/g, "")
      .trim();
    setDraftText(text);
    setDraftResearch(String(data.research || ""));
    setDraftStudy(String(data.dossier || ""));
    setDraftProvider(`Claude · ${data.model} · ${data.documents_read?.length || 0} documentos lidos`);
    const { data: u } = await supabase.auth.getUser();
    const ins = await supabase
      .from("process_conduction_drafts")
      .insert({
        org_id: orgId,
        process_id: proc.id,
        kind,
        title: DRAFTS[kind],
        content: text,
        research_evidence: {
          study: data.dossier, research: data.research, sources: data.sources,
          provider: data.provider, model: data.model, providers: data.providers, documents_read: data.documents_read,
          judge_analysis_at: data.judge_analysis_at, generated_at: new Date().toISOString(),
        },
        created_by: u?.user?.id || null,
      })
      .select("id,kind,title,content,created_at")
      .single();
    if (!ins.error && ins.data) setDrafts((v) => [ins.data as any, ...v]);
    setNotice({
      kind: ins.error ? "error" : "ok",
      text: ins.error ? "A redação foi gerada, mas não foi salva. Copie o conteúdo antes de sair. " + ins.error.message :
        "Redação e fontes salvas para revisão jurídica.",
    });
  }

  async function downloadDraft() {
    if (!supabase || !draftText) return;
    const title = `${DRAFTS[draftKind] || "Minuta"} - ${proc?.cnj_number || ""}`;
    let blob: Blob = new Blob([]),
      ext = "docx";
    try {
      const { data, error } = await supabase.functions.invoke(
        "document-generate",
        { body: { action: "timbrado_docx", text: draftText } },
      );
      if (error || !(data instanceof Blob) || data.size < 2000)
        throw new Error("fallback");
      blob = new Blob([data], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    } catch {
      const esc = (s: string) =>
        s.replace(
          /[&<>]/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
        );
      blob = new Blob(
        [
          "﻿",
          `<html><head><meta charset="utf-8"><style>body{font-family:"Times New Roman";font-size:12pt;line-height:1.5}p{text-align:justify}</style></head><body>${draftText
            .split(/\n{2,}/)
            .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
            .join("")}</body></html>`,
        ],
        { type: "application/msword" },
      );
      ext = "doc";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName(title)}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function prepareClientReport() {
    if (!supabase || !proc || busy) return;
    setBusy("client-report");
    setNotice({kind:"info",text:"Lendo os autos para preparar o relatório ao cliente…"});
    try {
      const data=await runLegalJob({process_id:proc.id,mode:"client_report",title:"Relatório ao cliente",...(caseNote.trim()?{instructions:"FATOS E DECISÕES INFORMADOS PELA ADVOGADA (confirmar nos documentos anexados):\n"+caseNote.trim()}:{})});
      setClientReportText(data.text);
      setClientReportId(proc.id);
      setClientReportAt(new Date().toISOString());
      setReportPublished(false);
      setNotice({kind:"ok",text:"Confira e ajuste o relatório antes de baixar ou enviar ao App."});
    }catch(error){
      setNotice({kind:"error",text:error instanceof Error?error.message:"Falha ao preparar o relatório."});
    }finally{setBusy("");}
  }

  async function buildClientReportPdf() {
    if(!proc||clientReportId!==proc.id||!clientReportText.trim())throw new Error("Prepare o relatório deste processo.");
    const {jsPDF}=await import("jspdf");
    const pdf=new jsPDF({unit:"mm",format:"a4"});
    const {registerClientReportFonts}=await import("../lib/clientReportFonts");
    registerClientReportFonts(pdf);
    const margin=23,width=164;
    let y=24;
    const header=()=>{
      pdf.setFillColor(101,0,31);pdf.rect(0,0,210,13,"F");
      pdf.setTextColor(101,0,31);pdf.setFont("ClientReportSans","bold");pdf.setFontSize(13);
      pdf.text("Suzanne Figueiredo",margin,26);
      pdf.setFont("ClientReportSans","normal");pdf.setFontSize(10);
      pdf.text("Advocacia e Soluções Jurídicas",margin,33);
      pdf.setDrawColor(178,138,74);pdf.line(margin,38,187,38);y=49;
      pdf.setTextColor(35,30,27);
    };
    const line=(text:string,bold=false)=>{
      pdf.setFont("ClientReportSans",bold?"bold":"normal");pdf.setFontSize(bold?11:11);
      const clean=text.replace(/^#{1,6}\s*/, "").replace(/\*\*(.*?)\*\*/g,"$1").trim();
      const lines=pdf.splitTextToSize(clean,width);
      if(bold){
        if(y+lines.length*6+9>272){pdf.addPage();header();}
        pdf.setFillColor(233,223,201);pdf.roundedRect(margin-3,y-5,width+6,lines.length*6+5,1,1,"F");
        pdf.setTextColor(101,0,31);
      }else pdf.setTextColor(35,30,27);
      for(const row of lines){
        if(y>272){pdf.addPage();header();}
        pdf.text(String(row),margin,y);y+=6;
      }
      y+=bold?7:4;
    };
    header();
    line("Atualização do seu processo",true);
    line("Cliente: "+(proc.clients?.name||"Não informado"));
    line("Processo: "+(proc.cnj_number||proc.internal_number||"Não informado"));
    line("Relatório gerado em "+new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(new Date(clientReportAt||Date.now())));
    for(const paragraph of clientReportText.split(/\n+/).filter(p=>p.trim())){
      line(paragraph,/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]{5,}$/.test(paragraph.trim()));
    }
    for(let page=1;page<=pdf.getNumberOfPages();page++){
      pdf.setPage(page);pdf.setFont("ClientReportSans","normal");pdf.setFontSize(9);
      pdf.setTextColor(90,80,70);pdf.text("Documento confidencial · "+page+" / "+pdf.getNumberOfPages(),105,287,{align:"center"});
    }
    return pdf;
  }

  async function downloadClientJudgePdf() {
    try{
      const pdf=await buildClientReportPdf();
      pdf.save(safeName("Relatório ao cliente - "+(proc?.cnj_number||"processo"))+".pdf");
    }catch(error){setNotice({kind:"error",text:error instanceof Error?error.message:"Falha ao gerar PDF."});}
  }

  async function sendClientReport() {
    if(!supabase||!proc?.client_id||!proc.clients?.name||busy||reportPublished||clientReportId!==proc.id)return;
    if(!window.confirm("Enviar este relatório ao App de "+proc.clients.name+"?"))return;
    setBusy("publish-report");setNotice(null);
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)throw new Error("Entre novamente no LexOffice.");
      const pdf=await buildClientReportPdf(),blob=pdf.output("blob");
      const name=safeName("Relatório ao cliente - "+(proc.cnj_number||"processo"))+".pdf";
      const path=proc.client_id+"/"+crypto.randomUUID()+"-"+name;
      const bucket=supabase.storage.from("client-documents");
      const upload=await bucket.upload(path,blob,{contentType:"application/pdf",upsert:false});
      if(upload.error)throw upload.error;
      const document=await supabase.from("documents").insert({
        org_id:orgId,owner_user_id:user.id,client_id:proc.client_id,process_id:proc.id,
        name,file_path:path,mime_type:"application/pdf",size_bytes:blob.size,
        category:"client_portal",uploaded_by:user.id,
      }).select("id").single();
      if(document.error)throw document.error;
      const publication=await supabase.from("client_document_requests").insert({
        org_id:orgId,client_id:proc.client_id,title:"Atualização do seu processo",
        description:"Relatório disponibilizado pelo escritório.",status:"available",document_id:document.data.id,
        requested_by:user.id,requires_authorization:false,authorization_status:"not_required",reminder_enabled:false,
      }).select("id").single();
      if(publication.error)throw publication.error;
      setReportPublished(true);
      setNotice({kind:"ok",text:"Relatório disponível no App de "+proc.clients.name+"."});
    }catch(error){setNotice({kind:"error",text:"Não foi possível confirmar a publicação. "+((error as {message?:string})?.message||"")});}
    finally{setBusy("");}
  }

  async function downloadDraftPdf() {
    if(!draftText.trim())return;
    try {
      const {jsPDF}=await import("jspdf");
      const pdf=new jsPDF({unit:"mm",format:"a4"});
      const {registerClientReportFonts}=await import("../lib/clientReportFonts");
      registerClientReportFonts(pdf);
      const margin=23, width=164, bottom=273;
      let y=25;
      pdf.setFont("ClientReportSans","bold");pdf.setFontSize(11);
      pdf.text("SUZANNE FIGUEIREDO | ADVOCACIA E SOLUÇÕES JURÍDICAS",105,y,{align:"center"});
      y+=9;pdf.setDrawColor(178,138,74);pdf.line(margin,y,187,y);y+=12;
      pdf.setFont("ClientReportSans","normal");pdf.setFontSize(11);
      const lines=pdf.splitTextToSize(draftText.replace(/\r/g,""),width);
      for(const line of lines){
        if(y>bottom){pdf.addPage();y=25;}
        pdf.text(String(line),margin,y);y+=6;
      }
      pdf.save(safeName(`${DRAFTS[draftKind]||"Minuta"} - ${proc?.cnj_number||"processo"}`)+".pdf");
      setNotice({kind:"ok",text:"PDF gerado para revisão. Envie ao cliente somente após conferir o conteúdo e os dados sigilosos."});
    }catch(e){setNotice({kind:"error",text:"Não foi possível gerar o PDF: "+(e instanceof Error?e.message:String(e))});}
  }

  async function addDeadline() {
    if (!supabase || !proc || !newDl.title.trim() || !newDl.due) {
      setNotice({ kind: "error", text: "Informe o título e a data do prazo." });
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    const due = new Date(`${newDl.due}T23:59:00-03:00`).toISOString();
    const { error } = await supabase
      .from("process_deadlines")
      .insert({
        org_id: orgId,
        process_id: proc.id,
        client_id: proc.client_id || null,
        title: newDl.title.trim(),
        due_at: due,
        deadline_type: "processual",
        priority: daysLeft(due) <= 5 ? "urgent" : "high",
        status: "pending",
        remind_3_days: true,
        remind_1_day: true,
        remind_same_day: true,
        owner_user_id: u?.user?.id,
        source_kind: "conducao_processual",
      });
    if (error) {
      setNotice({
        kind: "error",
        text: "Não foi possível criar o prazo: " + error.message,
      });
      return;
    }
    setNewDl({ title: "", due: "" });
    setNotice({
      kind: "ok",
      text: "Prazo criado. Ele aparece também na Agenda e nos lembretes.",
    });
    loadProcess(proc.id);
  }
  async function finishDeadline(d: Deadline) {
    if (!supabase) return;
    const { error } = await supabase
      .from("process_deadlines")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", d.id);
    if (error) {
      setNotice({
        kind: "error",
        text: "Não foi possível concluir: " + error.message,
      });
      return;
    }
    setDeadlines((v) =>
      v.map((x) => (x.id === d.id ? { ...x, status: "completed" } : x)),
    );
  }

  const openDeadlines = deadlines.filter(
    (d) => !/complet|conclu|done|cancel/i.test(d.status),
  );
  const nextHearings = hearings.filter(
    (h) =>
      new Date(h.starts_at).getTime() > Date.now() - 86400000 &&
      !/cancel/i.test(h.status || ""),
  );
  const ai = analysis?.analise;
  const insights =
    analysis?.insights &&
    typeof analysis.insights === "object" &&
    !Array.isArray(analysis.insights)
      ? analysis.insights
      : null;
  const judgeDicas = Array.isArray(analysis?.dicas)
    ? analysis.dicas.filter((d: unknown) => typeof d === "string" && d.trim())
    : [];
  const allChecks = [
    ...new Set([...suggestedChecks, ...state.checklist.map((c) => c.item)]),
  ];

  return (
    <div className="documents-v2-page petition-page conducao-page">
      <header className="documents-v2-header">
        <div>
          <h1>Condução Processual</h1>
          <p>
            Depois do ajuizamento, a LEX acompanha o processo fase a fase de
            acordo com o perfil do juízo: orienta o próximo passo, controla
            prazos e provas e redige as minutas para a sua revisão.
          </p>
        </div>
      </header>

      {notice && (
        <div className={`documents-v2-notice pa-notice pa-${notice.kind}`}>
          {notice.kind === "error" ? (
            <AlertTriangle size={17} />
          ) : notice.kind === "ok" ? (
            <CheckCircle2 size={17} />
          ) : (
            <Loader2 size={17} className="spin" />
          )}
          <span>{notice.text}</span>
          <button
            className="pa-x"
            onClick={() => setNotice(null)}
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <section className="doc-upload-card">
        <div className="doc-section-title">
          <span className="doc-section-icon">
            <Search size={20} />
          </span>
          <div>
            <h2>Processo ajuizado</h2>
            <p>Somente processos ativos com número CNJ aparecem aqui.</p>
          </div>
        </div>
        <div className="doc-upload-grid">
          <label>
            <span>Buscar por número, cliente, assunto ou parte contrária</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Ex.: 5001234 ou nome do cliente"
            />
          </label>
          <label>
            <span>Processo</span>
            <select value={procId} disabled={busy!==""} onChange={(e) => setProcId(e.target.value)}>
              <option value="">Selecione…</option>
              {proc && !list.some((p) => p.id === proc.id) && (
                <option value={proc.id}>{procLabel(proc)}</option>
              )}
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {procLabel(p)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {proc && <div className="doc-library-card">
          <h3>Cliente e polo representado</h3>
          <div className="doc-upload-grid">
            <label><span>Buscar cliente</span><input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Digite Ana Maria"/></label>
            <label><span>Cliente vinculado</span>
              <select value={proc.client_id||""} disabled={busy!==""} onChange={e=>updateRepresentation({client_id:e.target.value||null})}>
                <option value="">Selecione o cliente</option>
                {clients.filter(c=>c.id===proc.client_id||norm(c.name).includes(norm(clientSearch))).sort((a,b)=>Number(b.id===proc.client_id)-Number(a.id===proc.client_id)).slice(0,100).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label><span>Polo representado pelo escritório</span>
              <select value={normalizeProcessPole(proc.pole)||""} disabled={busy!==""} onChange={e=>updateRepresentation({pole:e.target.value})}>
                <option value="">Selecione o polo</option>
                <option value="author">Autor(a) / Requerente / Exequente</option>
                <option value="defendant">Réu / Ré / Requerido(a) / Executado(a)</option>
              </select>
            </label>
          </div>
          <p className="pa-muted">Alterações salvas no processo para orientar as próximas providências e minutas.</p>
        </div>}
        {proc && (
          <p className="pa-muted cp-procline">
            <Gavel size={14} /> {proc.class_name || "Classe não informada"} ·{" "}
            {proc.subject || "Assunto não informado"} ·{" "}
            {proc.vara || analysis?.vara?.nome || "Vara não informada"}
            {proc.comarca ? ` · ${proc.comarca}` : ""}
            {proc.is_confidential ? " · Segredo de justiça" : ""}
          </p>
        )}
      </section>

      {proc && busy === "load" && (
        <div className="doc-empty">
          <Loader2 className="spin" size={18} /> Carregando o processo…
        </div>
      )}

      {proc&&<InternalNavigation variant="underline" aria-label="Área do processo">{[['providencias','Fase e providências'],['estrategia','Estratégia e juízo'],['catalogo','Todas as peças'],['minutas','Minutas']].map(([key,label])=><button key={key} type="button" aria-current={strategySection===key?'page':undefined} onClick={()=>setStrategySection(key)}>{label}</button>)}</InternalNavigation>}
      {proc && busy !== "load" && (
        <>
          {strategySection==='providencias' && <><section className="doc-library-card">
            <div className="doc-section-title">
              <span className="doc-section-icon"><FileCheck2 size={20}/></span>
              <div>
                <h2>Análise dos autos para manifestação</h2>
                <p>Dados cadastrados no LexOffice, sem depender do DJEN. Confira o inteiro teor antes de protocolar.</p>
              </div>
            </div>
            <p><b>Processo:</b> {proc.cnj_number || proc.internal_number || "Número não informado"} · <b>Parte representada:</b> {proc.pole || "Polo não confirmado"}</p>
            <p><b>Andamentos encontrados:</b> {processSummary.total} · <b>Prazos pendentes:</b> {processSummary.pending.length}</p>
            {processSummary.pending.length > 0 && <ul className="cp-steps">{processSummary.pending.slice(0,8).map(d=><li key={d.id}>{d.title} · {brDT(d.due_at)} · {d.status}</li>)}</ul>}
            <div className="cp-focus">
              <p><b>Polo do escritório:</b> {nextAction?.role || "não confirmado"} · <b>Fase identificada:</b> {PHASES.find(p=>p.key===phase)?.label}</p>
              <p><b>Próxima providência sugerida:</b> {guide.foco}</p>
              <p><b>Último andamento:</b> {nextAction?.latest ? `${brD(nextAction.latest.movement_date)} · ${nextAction.latest.title || "Movimentação"}` : "Não disponível"}</p>
              <p className="pa-muted">Recomendação preliminar: confirmar teor da intimação, prazo e posição processual antes de peticionar.</p>
              <h3>Peças possíveis para esta fase</h3>
              {nextAction?.suggested.length ? <div className="pa-row">{nextAction.suggested.map(k=><button key={k} type="button" onClick={()=>{setDraftKind(k);setStrategySection("minutas");}}>{DRAFTS[k]}</button>)}</div> : <p>Confirme primeiro o polo representado no cadastro.</p>}
            </div>
            <h3>Últimas movimentações registradas</h3>
            {processSummary.recent.length ? <ul className="cp-steps">{processSummary.recent.map(m=><li key={m.id}><b>{brD(m.movement_date)} · {m.title || "Movimentação"}</b>{m.description ? <p>{String(m.description).slice(0,700)}</p> : null}</li>)}</ul> : <p className="pa-muted">Nenhum andamento cadastrado. Importe os autos ou consulte a intimação oficial antes de definir providências.</p>}
            <div className="cp-focus">
              <h3>Complementar a análise</h3>
              <p className="pa-muted">Os andamentos acima vêm do sistema e podem estar desatualizados (por exemplo, uma decisão recente ainda não importada). Anexe a decisão e conte o que aconteceu: a manifestação passa a considerar os dois.</p>
              <label><span>Anexar decisão ou documento (PDF, imagem ou texto)</span>
                <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain" disabled={busy!==""} onChange={e=>{const f=e.target.files?.[0];e.target.value="";void attachDecision(f);}}/>
              </label>
              {caseDocs.length>0 && <p className="pa-muted"><b>Anexados a este processo ({caseDocs.length}):</b> {caseDocs.slice(0,6).map(d=>d.name).join(" · ")}{caseDocs.length>6?" …":""}</p>}
              <label><span>O que aconteceu no processo (decisões, fatos novos, o que a peça deve considerar)</span>
                <textarea rows={5} value={caseNote} onChange={e=>setCaseNote(e.target.value)} placeholder="Ex.: decisão de saneamento fixou os pontos controvertidos e deferiu a perícia; prazo de 15 dias para especificar provas."/>
              </label>
            </div>
            <div className="pa-row">
              <button type="button" className="doc-primary" onClick={()=>setStrategySection('minutas')}>Preparar manifestação</button>
              <button type="button" onClick={()=>setStrategySection('estrategia')}>Consultar perfil do juízo (opcional)</button>
            </div>
            <p className="pa-muted">A fase sugerida é preliminar. Prazos, polo e decisões exigem conferência na fonte oficial.</p>
          </section><section className="doc-library-card">
            <div className="doc-section-title">
              <span className="doc-section-icon">
                <Compass size={20} />
              </span>
              <div>
                <h2>Fase atual e próximo passo</h2>
                <p>
                  Fase identificada pelos andamentos ({movs.length} lidos). Você
                  pode corrigir se estiver diferente.
                </p>
              </div>
            </div>
            <ol className="cp-phases">
              {PHASES.map((p, i) => (
                <li
                  key={p.key}
                  className={
                    i < phaseIdx ? "done" : i === phaseIdx ? "now" : ""
                  }
                >
                  {p.label}
                </li>
              ))}
            </ol>
            <div className="pa-row">
              <label className="cp-inline">
                <span>Fase</span>
                <select
                  value={state.phase_override || ""}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      phase_override: e.target.value || null,
                    })
                  }
                >
                  <option value="">
                    Automática ({PHASES.find((p) => p.key === autoPhase)?.label}
                    )
                  </option>
                  {PHASES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="cp-focus">
              <b>Foco agora:</b> {guide.foco}
            </div>
            <ul className="cp-steps">
              {guide.passos.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            {ai?.proximo_passo_provavel && (
              <div className="cp-focus">
                <b>Próximo passo provável neste juízo:</b>{" "}
                {ai.proximo_passo_provavel}
              </div>
            )}
          </section></>}

          {strategySection==='estrategia' && <><section className="doc-library-card">
            <div className="doc-section-title">
              <span className="doc-section-icon">
                <Scale size={20} />
              </span>
              <div>
                <h2>Perfil do juízo</h2>
                <p>
                  Pesquisa pública da vara (DJEN/CNJ). Processos em segredo de
                  justiça não entram na base.{" "}
                  {analysisAt
                    ? `Última análise: ${brDT(analysisAt)}.`
                    : "Ainda não analisado."}
                </p>
              </div>
            </div>
            <div className="pa-row end">
              <button
                className="doc-primary"
                onClick={runAnalysis}
                disabled={busy !== ""}
              >
                {busy === "analysis" ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <RefreshCw size={17} />
                )}{" "}
                {analysis ? "Atualizar análise" : "Analisar o juízo"}
              </button>
            </div>
            <div className="pa-row">
              <button type="button" className="doc-primary" disabled={busy!==""}
                onClick={()=>{setDraftKind(nextAction?.suggested[0]||guide.minutas[0]||"manifestacao");setStrategySection("minutas");}}>
                <FileSignature size={17}/> Redigir peça com IA + análise do juízo
              </button>
              <button type="button" className="doc-refresh" onClick={()=>setStrategySection("catalogo")}>
                <FileSignature size={17}/> Ver todas as peças
              </button>
              <button type="button" className="doc-refresh" disabled={busy!==""} onClick={prepareClientReport}>
                <Download size={17}/> Preparar relatório ao cliente
              </button>
            </div>
            {clientReportId===proc.id&&clientReportText&&<section className="doc-library-card" aria-label="Revisão do relatório ao cliente">
              <h3>Relatório ao cliente</h3>
              {clientReportAt&&<p className="pa-muted">Gerado em {brDT(clientReportAt)}. Confira se houve novas movimentações antes do envio.</p>}
              <label>Conteúdo para revisão
                <textarea rows={18} value={clientReportText} onChange={e=>{setClientReportText(e.target.value);setReportPublished(false);}}/>
              </label>
              <div className="pa-row">
                <button className="doc-refresh" disabled={busy!==""||!clientReportText.trim()} onClick={downloadClientJudgePdf}>Baixar PDF</button>
                <button className="doc-primary" disabled={busy!==""||!proc.client_id||!proc.clients?.name||reportPublished||!clientReportText.trim()} onClick={sendClientReport}>{reportPublished?"Disponível no App":"Enviar ao App do Cliente"}</button>
              </div>
            </section>}
            {analysis && (
              <>
                <p className="pa-muted">
                  <b>{analysis.vara?.nome || "Vara"}</b> ·{" "}
                  {analysis.base?.publicacoes ?? 0} publicações lidas (
                  {analysis.base?.sentencas ?? 0} sentenças) · período{" "}
                  {brD(analysis.base?.periodo?.de)} a{" "}
                  {brD(analysis.base?.periodo?.ate)}
                  {analysis.juizes?.length
                    ? ` · Magistrado(a): ${analysis.juizes.map((j: any) => j.nome).join(", ")}`
                    : ""}
                  {ai?.confianca ? ` · Confiança: ${ai.confianca}` : ""}
                </p>
                {ai?.resumo && <p>{ai.resumo}</p>}
                {judgeDicas.length > 0 && (
                  <div
                    className="cp-judge-tips"
                    role="note"
                    aria-label="Dicas para este juízo"
                  >
                    <h3>Dicas para este juízo</h3>
                    <ul>
                      {judgeDicas.map((d: string, i: number) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pa-cols">
                  <div>
                    <h3>Provas que costuma determinar</h3>
                    {(ai?.provas_que_pede || []).length ? (
                      <ul>
                        {ai.provas_que_pede.map((p: any, i: number) => (
                          <li key={i}>
                            <b>{p.prova}</b>
                            {p.frequencia ? ` (${p.frequencia})` : ""}
                            {p.comentario ? ` — ${p.comentario}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (analysis.provas || []).length ? (
                      <ul>
                        {analysis.provas.map((p: any, i: number) => (
                          <li key={i}>
                            <b>{p.item}</b> ({p.vezes}x)
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="pa-muted">Sem padrão identificado.</p>
                    )}
                  </div>
                  <div>
                    <h3>Estratégia sugerida</h3>
                    {(ai?.estrategia || []).length ? (
                      <ul>
                        {ai.estrategia.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="pa-muted">
                        Sem leitura por IA nesta análise.
                      </p>
                    )}
                  </div>
                </div>
                {insights ? (
                  <div
                    className="cp-insights-grid"
                    aria-label="Indicadores das publicações públicas"
                  >
                    <article className="cp-insight-card">
                      <h3>Tutela de urgência</h3>
                      <p className="cp-insight-lead">
                        {insights.tutela?.taxa_deferimento_pct == null
                          ? "—"
                          : `${judgeNumber(insights.tutela.taxa_deferimento_pct, 0)}%`}{" "}
                        de deferimento
                      </p>
                      <p>
                        Deferidas:{" "}
                        <b>
                          {judgeNumber(insights.tutela?.deferidas, 0)} de{" "}
                          {judgeNumber(insights.tutela?.decididas, 0)}
                        </b>{" "}
                        decisões decididas.
                      </p>
                      {insights.tutela?.amostra_suficiente === false && (
                        <p className="cp-small-sample">Amostra pequena</p>
                      )}
                      <h4>Por tema</h4>
                      {Array.isArray(insights.tutela?.por_tema) &&
                      insights.tutela.por_tema.length > 0 ? (
                        <ul>
                          {insights.tutela.por_tema.map(
                            (item: any, i: number) => (
                              <li key={i}>
                                <b>{item?.tema || "Tema não informado"}</b>:{" "}
                                {judgeNumber(item?.deferidas, 0)} deferidas,{" "}
                                {judgeNumber(item?.indeferidas, 0)} indeferidas
                                (
                                {item?.taxa_deferimento_pct == null
                                  ? "—"
                                  : `${judgeNumber(item.taxa_deferimento_pct, 0)}%`}
                                )
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="pa-muted">Sem dados por tema.</p>
                      )}
                    </article>
                    <article className="cp-insight-card">
                      <h3>Tempo até a sentença</h3>
                      <p className="cp-insight-lead">
                        {judgeNumber(
                          insights.tempo_ate_sentenca?.mediana_meses,
                        )}{" "}
                        meses de mediana
                      </p>
                      <p>
                        Faixa central:{" "}
                        {judgeNumber(insights.tempo_ate_sentenca?.p25_meses)} a{" "}
                        {judgeNumber(insights.tempo_ate_sentenca?.p75_meses)}{" "}
                        meses.
                      </p>
                      {insights.tempo_ate_sentenca?.observacao && (
                        <small>
                          {String(insights.tempo_ate_sentenca.observacao)}
                        </small>
                      )}
                    </article>
                    <article className="cp-insight-card">
                      <h3>Valores</h3>
                      <p>
                        Mediana: <b>{judgeMoney(insights.valores?.mediana)}</b>
                      </p>
                      <p>
                        Mínimo: <b>{judgeMoney(insights.valores?.minimo)}</b>
                      </p>
                      <p>
                        Máximo: <b>{judgeMoney(insights.valores?.maximo)}</b>
                      </p>
                      <div className="cp-insight-subblock">
                        <h4>Dano moral</h4>
                        {insights.valores?.dano_moral ? (
                          <p>
                            Mediana:{" "}
                            <b>
                              {judgeMoney(insights.valores.dano_moral.mediana)}
                            </b>{" "}
                            · mínimo{" "}
                            {judgeMoney(insights.valores.dano_moral.minimo)} ·
                            máximo{" "}
                            {judgeMoney(insights.valores.dano_moral.maximo)} (
                            {judgeNumber(insights.valores.dano_moral.n, 0)}{" "}
                            valor(es)).
                          </p>
                        ) : (
                          <p className="pa-muted">
                            Sem valores de dano moral identificados.
                          </p>
                        )}
                      </div>
                    </article>
                    <article className="cp-insight-card">
                      <h3>Mais citados nas decisões favoráveis</h3>
                      {Array.isArray(insights.teses) &&
                      insights.teses.length > 0 ? (
                        <ul>
                          {insights.teses.map((tese: any, i: number) => (
                            <li key={i}>
                              {tese?.item || "Tese não informada"}
                              {tese?.vezes != null
                                ? ` (${judgeNumber(tese.vezes, 0)} citações)`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="pa-muted">
                          Sem teses recorrentes identificadas.
                        </p>
                      )}
                    </article>
                  </div>
                ) : (
                  <p className="pa-muted">
                    Os indicadores detalhados não estão disponíveis nesta
                    análise. Atualize a análise para consultá-los.
                  </p>
                )}
                {ai?.ritmo && (
                  <p className="pa-muted">
                    <b>Ritmo deste processo:</b> {ai.ritmo}
                  </p>
                )}
                {(ai?.alertas || []).length > 0 && (
                  <div className="pa-warn">
                    <AlertTriangle size={16} /> {ai.alertas.join(" · ")}
                  </div>
                )}
                {analysis.aviso && <p className="pa-muted">{analysis.aviso}</p>}
              </>
            )}
            <p className="cp-judge-disclaimer">
              <b>
                Tendência a partir de publicações públicas, não é previsão de
                resultado.
              </b>
            </p>
          </section></>}

          {strategySection==='providencias' && <><section className="doc-library-card">
            <div className="doc-section-title">
              <span className="doc-section-icon">
                <CalendarClock size={20} />
              </span>
              <div>
                <h2>Prazos e audiências</h2>
                <p>
                  Os prazos criados aqui entram na Agenda e nos lembretes
                  automáticos.
                </p>
              </div>
            </div>
            {openDeadlines.length === 0 && nextHearings.length === 0 && (
              <p className="pa-muted">
                Nenhum prazo em aberto nem audiência futura.
              </p>
            )}
            <ul className="cp-list">
              {openDeadlines.map((d) => {
                const n = daysLeft(d.due_at);
                return (
                  <li
                    key={d.id}
                    className={n < 0 ? "late" : n <= 3 ? "soon" : ""}
                  >
                    <span>
                      <b>{d.title}</b> · vence {brD(d.due_at)}{" "}
                      {n < 0
                        ? `(vencido há ${-n} dia(s))`
                        : n === 0
                          ? "(hoje)"
                          : `(em ${n} dia(s))`}
                    </span>
                    <button
                      className="doc-refresh"
                      onClick={() => finishDeadline(d)}
                    >
                      <CheckCircle2 size={15} /> Concluir
                    </button>
                  </li>
                );
              })}
              {nextHearings.map((h) => (
                <li key={h.id}>
                  <span>
                    <b>{h.title || h.hearing_type || "Audiência"}</b> ·{" "}
                    {brDT(h.starts_at)}
                    {h.location ? ` · ${h.location}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <div className="pa-row">
              <input
                className="cp-input"
                value={newDl.title}
                onChange={(e) => setNewDl({ ...newDl, title: e.target.value })}
                placeholder="Novo prazo (ex.: Réplica)"
              />
              <input
                className="cp-input"
                type="date"
                value={newDl.due}
                onChange={(e) => setNewDl({ ...newDl, due: e.target.value })}
              />
              <button className="doc-primary" onClick={addDeadline}>
                <Plus size={16} /> Adicionar prazo
              </button>
            </div>
          </section></>}

          {strategySection==='providencias' && <><section className="doc-library-card">
            <div className="doc-section-title">
              <span className="doc-section-icon">
                <ListChecks size={20} />
              </span>
              <div>
                <h2>Checklist de provas e providências</h2>
                <p>
                  Sugestões da fase atual e do perfil do juízo. Marque o que já
                  foi feito.
                </p>
              </div>
            </div>
            <div className="pa-docs">
              {allChecks.map((item) => {
                const c = state.checklist.find((x) => x.item === item);
                return (
                  <label key={item} className={c?.done ? "on" : ""}>
                    <input
                      type="checkbox"
                      checked={!!c?.done}
                      onChange={() =>
                        toggleCheck(
                          item,
                          suggestedChecks.includes(item)
                            ? "sugestao"
                            : "manual",
                        )
                      }
                    />
                    <b title={item}>{item}</b>
                    {c?.origem === "manual" && (
                      <button
                        className="pa-x"
                        onClick={(e) => {
                          e.preventDefault();
                          removeCheck(item);
                        }}
                        aria-label="Remover"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="pa-row">
              <input
                className="cp-input wide"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCheck();
                }}
                placeholder="Adicionar item (ex.: Ofício ao INSS)"
              />
              <button className="doc-refresh" onClick={addCheck}>
                <Plus size={16} /> Adicionar
              </button>
            </div>
            <label className="pa-block">
              <span>Anotações da condução</span>
              <textarea
                rows={3}
                value={state.notes}
                onChange={(e) => setState({ ...state, notes: e.target.value })}
                onBlur={() => saveState(state)}
                placeholder="Ex.: juiz costuma indeferir perícia; reforçar prova documental."
              />
            </label>
          </section></>}

          {strategySection==='catalogo' && <section className="doc-library-card">
            <div className="doc-section-title"><span className="doc-section-icon"><FileSignature size={20}/></span><div>
              <h2>Catálogo de peças processuais</h2>
              <p>Selecione qualquer peça para este processo. As opções recomendadas aparecem primeiro, mas a escolha é da advogada.</p>
            </div></div>
            <div className="cp-focus"><b>Peças sugeridas para a fase atual:</b> {nextAction?.suggested.map(k=>DRAFTS[k]).filter(Boolean).join(" · ")||"Confirme o polo e os atos do processo"}</div>
            {Object.entries(DRAFT_GROUPS).map(([group,keys])=><div key={group}>
              <h3>{group}</h3>
              <div className="cp-draft-buttons">
                {keys.map(k=><button key={k} type="button" disabled={busy!==""} className={nextAction?.suggested.includes(k)?"doc-primary":""}
                  onClick={()=>{setDraftKind(k);setStrategySection("minutas");}}>
                  <FileSignature size={15}/> {DRAFTS[k]} {nextAction?.suggested.includes(k)?"(sugerida)":""}
                </button>)}
              </div>
            </div>)}
            <p className="pa-muted">Catálogo de opções, não afirmação de cabimento. Verifique rito, fase, legitimidade, decisão e prazo antes de gerar ou protocolar.</p>
          </section>}
          {strategySection==='minutas' && <><section className="doc-library-card">
            <div className="doc-section-title">
              <span className="doc-section-icon">
                <FileSignature size={20} />
              </span>
              <div>
                <h2>Minutas</h2>
                <p>
                  A LEX redige com base na fase, nos andamentos e no perfil do
                  juízo. Nada é protocolado automaticamente: revise e protocole.
                </p>
              </div>
            </div>
            <div className="cp-draft-buttons">
              {[...new Set([...(nextAction?.suggested||[]),...guide.minutas])].map((k) => (
                <button
                  key={k}
                  className="doc-primary"
                  disabled={busy !== ""}
                  onClick={() => makeDraft(k)}
                >
                  {busy === "draft" && draftKind === k ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <FileSignature size={16} />
                  )}{" "}
                  {DRAFTS[k]}
                </button>
              ))}
              <select
                className="cp-input"
                value=""
                disabled={busy !== ""}
                onChange={(e) => e.target.value && makeDraft(e.target.value)}
              >
                <option value="">Outra peça…</option>
                {Object.entries(DRAFTS)
                  .filter(([k]) => ![...(nextAction?.suggested||[]),...guide.minutas].includes(k))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </div>
            <label className="pa-block">
              <span>Orientações para a minuta (opcional)</span>
              <div className="pa-row">
                <button type="button" className="doc-refresh" disabled={!analysis || busy!==""} onClick={()=>{
                  const t=judgeGuidanceText();
                  setDraftExtra(old=>old.includes("ANÁLISE DO JUÍZO (")?old:[old.trim(),t].filter(Boolean).join("\n\n"));
                  setNotice({kind:"ok",text:"Análise do juízo inserida nas orientações. Você pode editar antes de gerar a peça."});
                }}>
                  <Scale size={16}/> Inserir análise do juízo nas orientações
                </button>
                {!analysis && <span className="pa-muted">Atualize primeiro o perfil do juízo na aba Estratégia e juízo.</span>}
              </div>
              <textarea
                rows={7}
                value={draftExtra}
                onChange={(e) => setDraftExtra(e.target.value)}
                placeholder="Ex.: impugnar o laudo no ponto da incapacidade; pedir nova perícia."
              />
            </label>
            {draftProvider && <p role="status">{draftProvider}</p>}
            {draftStudy && <details><summary>Estudo dos autos e aplicação do perfil do juízo</summary><pre style={{whiteSpace:"pre-wrap"}}>{draftStudy}</pre></details>}
            {draftResearch && <details><summary>Pesquisa jurídica e fontes consultadas</summary><pre style={{whiteSpace:"pre-wrap"}}>{draftResearch}</pre></details>}
            {draftText && (
              <>
                <h3>{DRAFTS[draftKind]}</h3>
                <textarea
                  className="pa-petition"
                  style={{ minHeight: 420 }}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  spellCheck
                />
                <div className="pa-row">
                  <button
                    className="doc-refresh"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(draftText)
                        .then(() =>
                          setNotice({ kind: "ok", text: "Minuta copiada." }),
                        )
                    }
                  >
                    <Copy size={16} /> Copiar
                  </button>
                  <button className="doc-refresh" onClick={downloadDraftPdf}>
                    <Download size={16} /> Gerar PDF para compartilhar
                  </button>
                  <button className="doc-refresh" onClick={downloadDraft}>
                    <Download size={16} /> Baixar Word (timbrado)
                  </button>
                  <button
                    className="doc-primary"
                    onClick={() => window.location.assign("/revisao-peca")}
                  >
                    <FileCheck2 size={16} /> Revisar antes de protocolar
                  </button>
                  <button
                    className="doc-refresh"
                    onClick={async () => {
                      if (!supabase || !proc) return;
                      const { data: u } = await supabase.auth.getUser();
                      const r = await supabase
                        .from("process_conduction_drafts")
                        .insert({
                          org_id: orgId,
                          process_id: proc.id,
                          kind: draftKind,
                          title: DRAFTS[draftKind] + " (revisada)",
                          content: draftText,
                          created_by: u?.user?.id || null,
                        })
                        .select("id,kind,title,content,created_at")
                        .single();
                      if (r.error)
                        setNotice({ kind: "error", text: r.error.message });
                      else {
                        setDrafts((v) => [r.data as any, ...v]);
                        setNotice({
                          kind: "ok",
                          text: "Versão revisada salva.",
                        });
                      }
                    }}
                  >
                    <Save size={16} /> Salvar versão
                  </button>
                </div>
              </>
            )}
            {drafts.length > 0 && (
              <div className="cp-history">
                <h3>
                  <History size={15} /> Minutas anteriores
                </h3>
                <ul className="cp-list">
                  {drafts.map((d) => (
                    <li key={d.id}>
                      <span>
                        <b>{d.title}</b> · {brDT(d.created_at)}
                      </span>
                      <button
                        className="doc-refresh"
                        onClick={() => {
                          setDraftKind(d.kind);
                          setDraftText(d.content);
                        }}
                      >
                        Abrir
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section></>}
        </>
      )}

      {!proc && (
        <div className="doc-empty">
          Selecione um processo ajuizado para começar.
        </div>
      )}
    </div>
  );
}

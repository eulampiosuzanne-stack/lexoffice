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
  const [draftExtra, setDraftExtra] = useState("");
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
    const {data,error}=await supabase.from("processes").update(patch).eq("id",proc.id).eq("org_id",orgId).select("id,client_id,pole,clients(name)").single();
    if(error||!data) setNotice({kind:"error",text:"Não foi possível salvar: "+(error?.message||"sem permissão")});
    else {
      setProcs(prev=>prev.map(p=>p.id===proc.id?{...p,client_id:data.client_id,pole:data.pole,clients:data.clients as Proc["clients"]}:p));
      setNotice({kind:"ok",text:"Vínculo e polo atualizados."});
    }
    setBusy("");
  }

  async function loadProcess(id: string) {
    if (!supabase || !id) return;
    setBusy("load");
    setNotice(null);
    setDraftText("");
    setDraftKind("");
    const [m, d, h, a, c, dr] = await Promise.all([
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
    ]);
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
  useEffect(() => {
    if (procId) {
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
  const poloReu = /^(reu|requerido|demandado|executado|polo passivo|passivo|defendant|respondent)$/.test(polo);
  const poloAutor = /^(autor|autora|requerente|demandante|exequente|polo ativo|ativo|plaintiff|claimant)$/.test(polo);
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

  async function makeDraft(kind: string) {
    if (!supabase || !proc) return;
    setDraftKind(kind);
    setBusy("draft");
    setNotice({ kind: "info", text: `Redigindo: ${DRAFTS[kind]}…` });
    const juizo = analysis
      ? {
          vara: analysis.vara?.nome,
          resumo: analysis.analise?.resumo,
          provas_que_pede: analysis.analise?.provas_que_pede || analysis.provas,
          estrategia: analysis.analise?.estrategia,
          alertas: analysis.analise?.alertas,
          dicas: analysis.dicas,
          confianca: analysis.analise?.confianca,
          base: analysis.base,
          ritmo: analysis.ritmo,
          fontes: analysis.fontes,
        }
      : null;
    const input = JSON.stringify({
      peca: DRAFTS[kind],
      fase_atual: PHASES[phaseIdx].label,
      processo: {
        numero: proc.cnj_number,
        classe: proc.class_name,
        assunto: proc.subject,
        area: proc.area,
        vara: proc.vara || analysis?.vara?.nome,
        comarca: proc.comarca,
        cliente: proc.clients?.name,
        polo_do_cliente: proc.pole,
        parte_contraria: proc.opposing_party,
      },
      andamentos_recentes: movs
        .slice(0, 15)
        .map((m) => ({
          data: String(m.movement_date).slice(0, 10),
          titulo: m.title,
          descricao: String(m.description || "").slice(0, 700),
        })),
      perfil_do_juizo: juizo,
      recomendacao_da_conducao: {
        providencia: guide.foco,
        passos: guide.passos,
        polo_representado: poloAutor ? "autor" : poloReu ? "réu" : "não confirmado",
        ultima_movimentacao: processSummary.recent[0] || null,
        prazos_pendentes: processSummary.pending.slice(0,10),
        peca_recomendada: nextAction?.suggested.includes(kind) || guide.minutas.includes(kind),
      },
      orientacoes_da_advogada: draftExtra || null,
    });
    const instructions = `Você é advogada sênior do escritório Suzanne Figueiredo — Advocacia e Soluções Jurídicas (OAB/MG). Redija a peça processual pedida, completa, em português jurídico formal, pronta para revisão: endereçamento ao juízo, qualificação resumida por referência ("já qualificada nos autos"), fatos processuais relevantes, fundamentação, pedidos e fecho com local, data e "Suzanne Figueiredo — OAB/MG [●]". Considere expressamente a recomendação da condução processual e, quando disponível, a análise do juízo (perfil, provas, alertas e estratégia). Não trate padrões estatísticos do juízo como fatos deste processo; não afirme cabimento sem conferir os atos e o prazo. Quando não houver perfil do juízo, informe a limitação sem inventá-lo. Ajuste a estratégia ao perfil do juízo quando informado.\n\nBANCO DE PEÇAS OURO DA LEXOFFICE: antes de redigir, escolha silenciosamente apenas os recursos que aumentem a compreensão do caso: síntese processual; alegação × resposta; decisão/sentença × erro/vício × reforma pretendida; linha do tempo; fato × prova × consequência; pontos controvertidos × prova necessária × finalidade; quadro financeiro ou gráfico somente quando números forem probatórios; quesito pericial × resposta × documento contrário × impugnação; requisitos de tutela/liminar; testemunha × fato a provar; e, em memoriais, controvérsia × decisão anterior × prova produzida × razão para acolhimento. Use tabelas simples, listas curtas e blocos de síntese compatíveis com Word. Não use recurso visual decorativo.\n\nOs modelos são referência de arquitetura e Visual Law, não fonte de verdade. Nunca transporte nomes, fatos, valores, artigos ou jurisprudência de outro caso. Use somente os dados deste processo. Não invente fatos, datas, valores, nomes, documentos, artigos ou precedentes. Onde faltar dado, use [●]. Não cite precedente não fornecido. Texto sem markdown e sem asteriscos; títulos em CAIXA ALTA.`;
    const { data, error } = await supabase.functions.invoke(
      "ai-provider-gateway",
      {
        body: {
          org_id: orgId,
          provider: "auto",
          purpose: "process_conduction_draft",
          agent_key: "process_conduction",
          instructions,
          input,
        },
      },
    );
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
    const { data: u } = await supabase.auth.getUser();
    const ins = await supabase
      .from("process_conduction_drafts")
      .insert({
        org_id: orgId,
        process_id: proc.id,
        kind,
        title: DRAFTS[kind],
        content: text,
        created_by: u?.user?.id || null,
      })
      .select("id,kind,title,content,created_at")
      .single();
    if (!ins.error && ins.data) setDrafts((v) => [ins.data as any, ...v]);
    setNotice({
      kind: "ok",
      text: "Minuta pronta. Revise antes de protocolar.",
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

  async function downloadClientJudgePdf() {
    if (!proc || !analysis) {
      setNotice({kind:"error",text:"Atualize a análise do juízo antes de gerar o relatório."});
      return;
    }
    if(!supabase || !orgId){setNotice({kind:"error",text:"Não foi possível identificar a organização para a análise de IA."});return;}
    setBusy("client-report");
    setNotice({kind:"info",text:"Consultando os registros processuais e o Perfil do Juízo para preparar o relatório..."});
    try {
      const {data:source,error:sourceError}=await Promise.all([
        supabase.from("process_movements").select("movement_date,title,description").eq("process_id",proc.id).order("movement_date",{ascending:false}).limit(150),
        supabase.from("process_deadlines").select("title,description,due_at,status,priority").eq("process_id",proc.id).order("due_at",{ascending:true}).limit(100),
        supabase.from("process_hearings").select("title,starts_at,status").eq("process_id",proc.id).order("starts_at",{ascending:true}).limit(30)
      ]).then(results=>({data:results.map(x=>x.data||[]),error:results.find(x=>x.error)?.error}));
      if(sourceError)throw sourceError;
      const material={
        processo:{numero:proc.cnj_number,cliente:proc.clients?.name,classe:proc.class_name,assunto:proc.subject,vara:proc.vara,polo:proc.pole},
        movimentos:source[0],prazos:source[1],audiencias:source[2],perfil_do_juizo:analysis,
        limitacao:"A consulta contém registros do LexOffice, não comprova acesso ao inteiro teor dos autos. Não declarar leitura integral."
      };
      const result=await supabase.functions.invoke("ai-provider-gateway",{body:{
        org_id:orgId,provider:"auto",purpose:"process_client_integrated_report",agent_key:"process_conduction",
        instructions:"Você é analista jurídica do escritório. Gere um relatório INFORMATIVO para cliente em português formal, baseado exclusivamente no JSON fornecido. Integre a situação INDIVIDUAL do processo e o perfil PÚBLICO do juízo, sem confundir tendências da vara com decisões do processo. Use seções: DECISÕES E PRAZOS IDENTIFICADOS; PROVAS E QUESTÕES QUE EXIGEM CONFERÊNCIA; PERFIL DO JUÍZO E REPERCUSSÕES NO CASO; PROVIDÊNCIAS PROPOSTAS; LIMITAÇÕES DAS FONTES. Só declare decisão, prazo, valor, contrato ou prova se constar expressamente dos dados recebidos; cite data e título/descrição do registro em cada afirmação relevante. Se não houver teor integral de decisão ou contrato, diga que não foi possível verificar. Não invente jurisprudência. Não afirme ter lido autos completos. Não exponha estratégia sigilosa, previsões de resultado ou mensagens privadas. Não inclua nome, timbre ou título geral. Não use markdown.",
        input:JSON.stringify(material)
      }});
      if(result.error || !result.data?.ok || !String(result.data.text||"").trim())throw result.error||new Error("A IA não retornou uma análise válida.");
      const integrated=String(result.data.text).trim();
      const {jsPDF}=await import("jspdf");
      const pdf=new jsPDF({unit:"mm",format:"a4"});
      const left=22,right=188,width=166;
      let y=48, page=0;
      const plain=(v:unknown):string=>{
        if(v==null)return "";
        const str=Array.isArray(v)?v.map(plain).filter(Boolean).join("; "):typeof v==="string"?v:typeof v==="number"?String(v):"";
        return str.replace(/\\\\n/g," ").replace(/\\s+/g," ").trim();
      };
      const newPage=()=>{
        if(page)pdf.addPage();
        page++;
        pdf.setFillColor(248,246,240);pdf.rect(0,0,210,297,"F");
        pdf.setFillColor(32,32,32);pdf.rect(0,0,210,33,"F");
        pdf.setTextColor(233,223,201);pdf.setFont("times","bold");pdf.setFontSize(15);
        pdf.text("SF",left,17);
        pdf.setTextColor(255,255,255);pdf.setFontSize(11);
        pdf.text("SUZANNE FIGUEIREDO",36,15);
        pdf.setFont("times","normal");pdf.setFontSize(8);
        pdf.text("ADVOCACIA E SOLUÇÕES JURÍDICAS",36,21);
        pdf.setDrawColor(178,138,74);pdf.setLineWidth(.6);pdf.line(left,36,right,36);
        pdf.setDrawColor(218,210,195);pdf.setLineWidth(.2);pdf.line(left,278,right,278);
        pdf.setFontSize(8);pdf.setTextColor(110,104,95);
        pdf.text("RELATÓRIO INFORMATIVO | CONFERÊNCIA JURÍDICA ANTES DO ENVIO",left,285);
        pdf.text(String(page),right,285,{align:"right"});
        y=48;
      };
      const room=(n:number)=>{if(y+n>270)newPage();};
      const text=(value:unknown,opts?:{bold?:boolean;size?:number;indent?:number})=>{
        const v=plain(value);if(!v)return;
        const size=opts?.size||10.5,indent=opts?.indent||0;
        pdf.setFont("times",opts?.bold?"bold":"normal");pdf.setFontSize(size);
        pdf.setTextColor(42,39,36);
        const lines=pdf.splitTextToSize(v,width-indent);
        for(const line of lines){room(6.3);pdf.text(String(line),left+indent,y);y+=5.7;}
        y+=3.5;
      };
      const heading=(number:string,title:string)=>{
        room(23);y+=6;
        pdf.setFillColor(178,138,74);pdf.rect(left,y-5,9,9,"F");
        pdf.setFont("times","bold");pdf.setFontSize(9);pdf.setTextColor(255,255,255);
        pdf.text(number,left+4.5,y+1,{align:"center"});
        pdf.setFontSize(12);pdf.setTextColor(32,32,32);pdf.text(title,left+14,y+1);
        y+=13;
      };
      const field=(label:string,value:unknown)=>{
        room(18);
        pdf.setFont("times","bold");pdf.setFontSize(8.5);pdf.setTextColor(110,104,95);
        pdf.text(label.toUpperCase(),left,y);y+=6;
        text(plain(value)||"Não informado",{size:10});
      };
      const note=(label:string,value:unknown)=>{
        const v=plain(value);if(!v)return;
        room(20);text(label,{bold:true,size:10});text(v);
      };
      newPage();
      text("RELATÓRIO DE ACOMPANHAMENTO",{bold:true,size:17});
      text("Informações processuais e panorama público do juízo",{size:11});
      y+=4;
      field("Cliente",proc.clients?.name);
      field("Número do processo",proc.cnj_number||proc.internal_number);
      field("Unidade judicial",analysis.vara?.nome||proc.vara);
      heading("01","Situação processual registrada");
      field("Fase indicada no sistema",PHASES[phaseIdx]?.label||"A confirmar");
      const latest=processSummary.recent[0];
      if(latest){
        const dt=latest.movement_date?new Date(latest.movement_date).toLocaleDateString("pt-BR"):"";
        field("Último andamento disponível",[dt,latest.title].filter(Boolean).join(" | "));
      }else field("Último andamento disponível","Não informado");
      heading("02","Perfil público da unidade judicial");
      text("Base da pesquisa: "+String(analysis.base?.publicacoes??"não informado")+" publicações e "+String(analysis.base?.sentencas??"não informado")+" sentenças.",{bold:true});
      const summary=plain(analysis.analise?.resumo).replace(/^Trata-se de análise jurídica direcionada à Dra\\.? Suzanne Figueiredo referente ao processo de busca e apreensão em andamento na 2ª Vara Cível de Igarapé\\.?\\s*/i,"");
      if(summary)text(summary);
      else text("A síntese da análise do juízo não está disponível.");
      const provas=analysis.analise?.provas_que_pede||analysis.provas;
      note("Elementos probatórios observados nas publicações",provas);
      note("Padrões processuais observados",analysis.ritmo?.resumo||analysis.ritmo?.descricao);
      const tips=analysis.dicas;
      if(typeof tips==="string"||Array.isArray(tips))note("Observações adicionais da análise pública",tips);
      heading("03","Análise integrada do processo e do juízo");
      for(const part of integrated.split(/\\n+/).map(v=>v.trim()).filter(Boolean)){
        if(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ,:;–-]{8,}$/.test(part) && part.length<110)text(part,{bold:true,size:11});
        else text(part);
      }
      heading("04","Esclarecimentos à cliente");
      text("As informações acima refletem registros disponíveis no sistema e observações de publicações públicas da unidade judicial. Não representam decisão específica no seu processo, nem permitem prever seu resultado.");
      text("A equipe jurídica deve conferir as movimentações, intimações e prazos diretamente nos autos antes de indicar qualquer providência.");
      pdf.save(safeName("Relatorio ao cliente - "+(proc.cnj_number||"processo"))+".pdf");
      setNotice({kind:"ok",text:"PDF gerado para revisão jurídica antes do envio à cliente."});
    }catch(e){
      setNotice({kind:"error",text:"Falha ao gerar PDF: "+(e instanceof Error?e.message:String(e))});
    }finally{setBusy("");}
  }

  async function downloadDraftPdf() {
    if(!draftText.trim())return;
    try {
      const {jsPDF}=await import("jspdf");
      const pdf=new jsPDF({unit:"mm",format:"a4"});
      const margin=23, width=164, bottom=273;
      let y=25;
      pdf.setFont("times","bold");pdf.setFontSize(11);
      pdf.text("SUZANNE FIGUEIREDO | ADVOCACIA E SOLUÇÕES JURÍDICAS",105,y,{align:"center"});
      y+=9;pdf.setDrawColor(178,138,74);pdf.line(margin,y,187,y);y+=12;
      pdf.setFont("times","normal");pdf.setFontSize(11);
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
            <select value={procId} onChange={(e) => setProcId(e.target.value)}>
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
                {clients.filter(c=>c.id===proc.client_id||norm(c.name).includes(norm(clientSearch))).slice(0,100).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label><span>Polo representado pelo escritório</span>
              <select value={/^(defendant|respondent|reu|requerido|demandado|executado|polo passivo|passivo)$/i.test(proc.pole||"")?"reu":/^(plaintiff|claimant|autor|autora|requerente|demandante|exequente|polo ativo|ativo)$/i.test(proc.pole||"")?"autor":""} disabled={busy!==""} onChange={e=>updateRepresentation({pole:e.target.value})}>
                <option value="">Selecione o polo</option>
                <option value="autor">Autor(a) / Requerente / Exequente</option>
                <option value="reu">Réu / Ré / Requerido(a) / Executado(a)</option>
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
              <button type="button" className="doc-refresh" disabled={!analysis || busy!==""} onClick={downloadClientJudgePdf}>
                <Download size={17}/> Gerar PDF para envio ao cliente
              </button>
            </div>
            <p className="pa-muted">O relatório para o cliente apresenta um resumo informativo do juízo e do andamento, sem expor a minuta ou a estratégia interna. O PDF da peça continua na aba Minutas.</p>
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

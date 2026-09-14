import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Building2,
  CheckCircle2,
  Globe2,
  Instagram,
  Landmark,
  Linkedin,
  MapPinned,
  MessageCircle,
  Play,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import "./prospecting.css";

type Model = {
  key: string;
  name: string;
  goal: string;
  audience: string;
  source: string;
  channel: string;
  steps: string[];
  prompt: string;
};
const models: Model[] = [
  {
    key: "familia_preventivo",
    name: "Família — conteúdo preventivo",
    goal: "Educação e entrada voluntária",
    audience: "Pessoas buscando orientação familiar",
    source: "Meta Lead Ads / landing page",
    channel: "meta_whatsapp",
    steps: [
      "D0 conteúdo solicitado",
      "D1 confirmação",
      "D3 material educativo",
      "D7 convite para avaliação",
    ],
    prompt:
      "Acolha, explique informação geral, não prometa resultado e convide para consulta somente quando houver interesse expresso.",
  },
  {
    key: "bancario_serasa",
    name: "Bancário — reorganização de dívidas",
    goal: "Revisão responsável de contratos",
    audience: "Pessoas que solicitaram análise financeira",
    source: "Landing page / mídia paga",
    channel: "meta_whatsapp",
    steps: [
      "D0 confirmação do pedido",
      "D1 checklist documental",
      "D3 lembrete útil",
      "D7 encerramento cordial",
    ],
    prompt:
      "Faça triagem de direito bancário com linguagem clara. Não prometa redução de dívida. Colete instituição, contrato e objetivo, com consentimento.",
  },
  {
    key: "consumidor",
    name: "Consumidor — cobrança e contrato",
    goal: "Triagem de relação de consumo",
    audience: "Interessados vindos de formulário",
    source: "Google Ads / formulário",
    channel: "meta_whatsapp",
    steps: [
      "D0 acolhimento",
      "D2 checklist de provas",
      "D5 convite para consulta",
    ],
    prompt:
      "Identifique fornecedor, data, valor, tentativa de solução e documentos. Informe que a análise depende do caso concreto.",
  },
  {
    key: "parceiro_psico",
    name: "Parceria — psicólogos e terapeutas",
    goal: "Rede de indicação ética",
    audience: "Profissionais e clínicas",
    source: "CNPJ / Google Maps / Doctoralia",
    channel: "whatsapp",
    steps: [
      "D0 apresentação institucional",
      "D4 conteúdo de valor",
      "D10 convite para reunião",
      "D20 encerramento",
    ],
    prompt:
      "Proponha parceria institucional sem comissão, sem pressão e sem abordar pacientes. Destaque rede de apoio e encaminhamento responsável.",
  },
  {
    key: "parceiro_adv",
    name: "Parceria — advocacia complementar",
    goal: "Indicação cruzada entre especialidades",
    audience: "Advogados de outras áreas",
    source: "OAB / LinkedIn / Google",
    channel: "whatsapp",
    steps: [
      "D0 apresentação",
      "D5 áreas complementares",
      "D12 convite para conversa",
    ],
    prompt:
      "Apresente cooperação respeitando sigilo, conflitos e regras da OAB. Não ofereça compra de indicação.",
  },
  {
    key: "parceiro_contabil",
    name: "Parceria — contadores",
    goal: "Divórcio, patrimônio e empresas",
    audience: "Escritórios contábeis",
    source: "CNPJ / Google Maps / LinkedIn",
    channel: "whatsapp",
    steps: ["D0 apresentação", "D4 caso de uso genérico", "D10 reunião"],
    prompt:
      "Convide para uma rede técnica entre jurídico e contabilidade, sem compartilhar dados de clientes e sem prometer vantagens.",
  },
  {
    key: "cartorios",
    name: "Rede — cartórios e tabelionatos",
    goal: "Mapeamento e relacionamento institucional",
    audience: "Cartórios da região",
    source: "CNJ / Google Maps",
    channel: "whatsapp",
    steps: [
      "D0 contato institucional",
      "D7 atualização de referência",
      "D20 manutenção da rede",
    ],
    prompt:
      "Solicite apenas informações públicas e canais oficiais. Não peça indicação privilegiada nem dados de usuários.",
  },
  {
    key: "empresas_b2b",
    name: "B2B — preventivo empresarial",
    goal: "Diagnóstico jurídico empresarial",
    audience: "Empresas por CNAE, porte e região",
    source: "Receita/CNPJ / Maps / LinkedIn",
    channel: "meta_whatsapp",
    steps: [
      "D0 diagnóstico opt-in",
      "D2 checklist",
      "D6 conteúdo setorial",
      "D12 convite",
    ],
    prompt:
      "Conduza diagnóstico B2B objetivo. Identifique área, porte e dor declarada; não use medo de processo e não prometa resultado.",
  },
  {
    key: "processual_preventivo",
    name: "Monitoramento processual preventivo",
    goal: "Atender clientes já contratantes",
    audience: "Clientes com autorização de monitoramento",
    source: "Tribunais / Escavador",
    channel: "meta_whatsapp",
    steps: [
      "Evento detectado",
      "Confirmação humana",
      "Aviso ao cliente",
      "Tarefa interna",
    ],
    prompt:
      "Resuma a movimentação sem alarmismo. Este fluxo é para cliente autorizado, nunca para abordar parte recém-processada.",
  },
  {
    key: "rede_apoio",
    name: "Rede de apoio e encaminhamento",
    goal: "Referência interna para urgências",
    audience: "CRAS, delegacias, ONGs e serviços",
    source: "Diretórios oficiais / Maps",
    channel: "whatsapp",
    steps: [
      "Cadastro interno",
      "Validação trimestral",
      "Uso em encaminhamento",
    ],
    prompt:
      "Organize dados públicos de acolhimento. Não envie campanhas; use somente como diretório interno.",
  },
  {
    key: "conteudo_instagram",
    name: "Instagram — conteúdo com opt-in",
    goal: "Converter interesse em conversa consentida",
    audience: "Pessoas que responderam anúncio ou formulário",
    source: "Instagram / Meta Lead Ads",
    channel: "meta_whatsapp",
    steps: [
      "D0 entrega do conteúdo",
      "D2 qualificação",
      "D5 caso educativo",
      "D9 convite",
    ],
    prompt:
      "Continue somente com quem solicitou contato. Use Lead Ads, mensagens iniciadas e formulários; não extraia seguidores.",
  },
  {
    key: "comunidade",
    name: "Comunidades — Telegram/WhatsApp",
    goal: "Conteúdo e entrada voluntária",
    audience: "Membros que aderirem por formulário",
    source: "Bot Telegram / formulário",
    channel: "whatsapp",
    steps: ["Boas-vindas", "Conteúdo semanal", "CTA opcional", "Saída simples"],
    prompt:
      "Não raspe membros ou telefones de grupos. Publique conteúdo autorizado e mova apenas opt-ins para o CRM.",
  },
];
const sources = [
  ["CNPJ/CNAE", "Receita e dados empresariais", "ready", Building2],
  ["Google Maps", "Empresas e profissionais locais", "setup", MapPinned],
  ["Meta Lead Ads", "Facebook e Instagram consentidos", "shared", Instagram],
  ["LinkedIn", "Parcerias e B2B por APIs permitidas", "setup", Linkedin],
  ["Telegram", "Bot em grupos autorizados", "setup", MessageCircle],
  ["Cartórios", "Diretórios oficiais", "ready", Landmark],
  ["Doctoralia", "Pesquisa pública e parceria", "review", Search],
  ["Tribunais", "Clientes autorizados", "ready", Scale],
  ["Serasa", "Exige contrato e base legal", "review", ShieldCheck],
  ["Rede de apoio", "CRAS, delegacias e ONGs", "ready", Users],
] as const;

export default function Prospecting() {
  const [orgId, setOrgId] = useState(""),
    [modelKey, setModelKey] = useState(models[0].key),
    [listId, setListId] = useState(""),
    [name, setName] = useState(""),
    [lists, setLists] = useState<any[]>([]),
    [campaigns, setCampaigns] = useState<any[]>([]),
    [connections, setConnections] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const model = useMemo(
    () => models.find((x) => x.key === modelKey)!,
    [modelKey],
  );
  async function load() {
    if (!supabase) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
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
    const [{ data: l }, { data: c }, { data: w }] = await Promise.all([
      supabase
        .from("marketing_lists")
        .select("id,name")
        .eq("org_id", p.org_id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("marketing_campaigns")
        .select("id,name,status,channel,created_at,settings")
        .eq("org_id", p.org_id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("whatsapp_connections")
        .select(
          "id,provider_type,status,display_phone_number,verified_name,is_active",
        )
        .eq("org_id", p.org_id),
    ]);
    setLists(l || []);
    setCampaigns(c || []);
    setConnections(w || []);
    setBusy(false);
  }
  useEffect(() => {
    load();
  }, []);
  async function createCampaign() {
    if (!supabase || !orgId || !listId) return;
    setBusy(true);
    setNotice("");
    const { error } = await supabase
      .from("marketing_campaigns")
      .insert({
        org_id: orgId,
        name: name.trim() || model.name,
        channel: model.channel,
        list_id: listId,
        status: "draft",
        daily_limit: 30,
        min_interval_seconds: 60,
        max_interval_seconds: 180,
        stop_on_reply: true,
        respect_opt_out: true,
        settings: {
          prospeccao_model: model.key,
          goal: model.goal,
          audience: model.audience,
          source: model.source,
          ai_prompt: model.prompt,
          cadence: model.steps,
          compliance_mode: true,
          approval_required: true,
          batch_size: 10,
          batch_pause_minutes: 20,
          send_start_time: "09:00",
          send_end_time: "18:00",
          pause_on_failure_spike: true,
        },
      });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice(
        "Rascunho criado na fila compartilhada do LexOffice. Revise e aprove antes de iniciar.",
      );
      setName("");
      await load();
    }
  }
  const connected = connections.some(
    (x) => x.status === "connected" && x.is_active !== false,
  );
  return (
    <div className="prospecting">
      <div className="page-head">
        <div>
          <h1>Cockpit de Prospecção</h1>
          <p>
            Captação consentida, parcerias B2B, régua e agente de IA na
            infraestrutura do LexOffice.
          </p>
        </div>
        <button className="integration-action" onClick={load} disabled={busy}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      <div className={`prospecting-shared ${connected ? "ok" : ""}`}>
        <Globe2 />
        <div>
          <b>
            {connected
              ? "Conexão compartilhada ativa"
              : "Conexão compartilhada aguardando validação"}
          </b>
          <span>
            Meta/WhatsApp, organização, CRM e agente são os mesmos do LexOffice.
            Nenhuma credencial é copiada.
          </span>
        </div>
      </div>
      <section>
        <div className="prospecting-title">
          <div>
            <span>MOTORES</span>
            <h2>Fontes e conectores</h2>
          </div>
          <small>“Configurar” exige credencial, contrato ou autorização.</small>
        </div>
        <div className="source-grid">
          {sources.map(([title, desc, status, Icon]) => (
            <article key={title}>
              <Icon />
              <div>
                <b>{title}</b>
                <p>{desc}</p>
              </div>
              <span className={status}>
                {status === "ready"
                  ? "Disponível"
                  : status === "shared"
                    ? "Via LexOffice"
                    : status === "review"
                      ? "Validar acesso"
                      : "Configurar"}
              </span>
            </article>
          ))}
        </div>
      </section>
      <section>
        <div className="prospecting-title">
          <div>
            <span>12 MODELOS PRONTOS</span>
            <h2>Escolha a campanha; a régua já vem configurada</h2>
          </div>
        </div>
        <div className="model-layout">
          <div className="model-list">
            {models.map((x) => (
              <button
                key={x.key}
                className={x.key === modelKey ? "active" : ""}
                onClick={() => setModelKey(x.key)}
              >
                <b>{x.name}</b>
                <small>{x.goal}</small>
              </button>
            ))}
          </div>
          <div className="model-editor">
            <div className="model-meta">
              <span>{model.source}</span>
              <span>
                {model.channel === "meta_whatsapp"
                  ? "WhatsApp oficial"
                  : "WhatsApp compartilhado"}
              </span>
            </div>
            <h2>{model.name}</h2>
            <p>
              <b>Público:</b> {model.audience}
            </p>
            <h3>Régua sugerida</h3>
            <ol>
              {model.steps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
            <h3>Prompt do agente</h3>
            <div className="prompt-box">
              <Bot size={18} />
              <p>{model.prompt}</p>
            </div>
            <div className="integration-form">
              <label>
                Nome
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={model.name}
                />
              </label>
              <label>
                Lista consentida
                <select
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {lists.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="integration-action"
                onClick={createCampaign}
                disabled={busy || !listId}
              >
                <Play size={16} />
                Criar rascunho
              </button>
            </div>
            {notice && <div className="integration-notice">{notice}</div>}
          </div>
        </div>
      </section>
      <section>
        <div className="prospecting-title">
          <div>
            <span>OPERAÇÃO</span>
            <h2>Campanhas recentes</h2>
          </div>
        </div>
        <div className="signature-list">
          {campaigns.length ? (
            campaigns.map((c) => (
              <div className="signature-row" key={c.id}>
                <div>
                  <b>{c.name}</b>
                  <small>
                    {c.channel} • {c.settings?.source || "origem não informada"}
                  </small>
                </div>
                <span
                  className={`status-dot ${c.status === "active" ? "ok" : ""}`}
                >
                  {c.status}
                </span>
              </div>
            ))
          ) : (
            <div className="integration-empty">
              <CheckCircle2 />
              <p>Nenhuma campanha criada.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

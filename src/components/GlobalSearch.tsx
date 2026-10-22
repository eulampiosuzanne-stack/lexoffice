import "./GlobalSearch.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type SearchItem = {
  id: string;
  kind: "Funcionalidade" | "Cliente" | "Processo" | "Lead";
  title: string;
  detail: string;
  path: string;
};

const moduleRows = [
  ["service-settings", "Atendimento automático", "IA geral, retorno humano e acompanhamento", "/configuracoes/atendimento"],
  ["inicio", "Início e prioridades", "Resumo diário do escritório", "/"],
  ["donna", "Donna · Briefing", "Resumo executivo e organização do dia", "/donna"],
  ["atendimento", "Conversas e atendimento", "WhatsApp e mensagens recebidas", "/whatsapp"],
  ["clientes", "Clientes", "Cadastro, perfil, documentos e onboarding", "/clientes"],
  ["leads", "Leads e oportunidades", "Acompanhar contatos no CRM", "/crm"],
  ["processos", "Processos", "Casos, prazos, andamentos e audiências", "/processos"],
  ["agenda", "Agenda", "Compromissos e horários disponíveis", "/agenda"],
  ["documentos", "Documentos", "Gerar, localizar e enviar arquivos", "/documentos"],
  ["assinaturas", "Assinaturas", "Enviar e acompanhar assinaturas", "/assinaturas"],
  ["financeiro", "Financeiro", "Honorários, parcelas e recebimentos", "/financeiro"],
  ["propostas", "Propostas de honorários", "Analisar perfil e montar proposta", "/perfil-cliente"],
  ["jurimetria", "Analisar caso antes de ajuizar", "Jurimetria e estratégia inicial", "/jurimetria"],
  ["revisao", "Revisar peça antes do protocolo", "Tipografia, prova e conferência final", "/revisao-peca"],
  ["sherlock", "Sherlock", "Consultas e investigação autorizada", "/consultas"],
  ["config", "Central de configurações", "Onde ajustar cada funcionalidade", "/configuracoes/central"],
] as const;

const modules: SearchItem[] = moduleRows.map(([id, title, detail, path]) => ({
  id, title, detail, path, kind: "Funcionalidade",
}));

const clean = (value: string) => value.replace(/[%,()]/g, " ").trim();

export default function GlobalSearch() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<SearchItem[]>([]);
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const moduleResults = useMemo(
    () => normalized ? modules.filter((item) => `${item.title} ${item.detail}`.toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 6) : [],
    [normalized],
  );

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        root.current?.querySelector<HTMLInputElement>("input")?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", shortcut);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", shortcut);
    };
  }, []);

  useEffect(() => {
    if (!supabase || normalized.length < 2) {
      setRecords([]);
      setLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const term = clean(query);
      const [clients, processes, leads] = await Promise.all([
        supabase.from("clients").select("id,name,cpf_cnpj,phone").or(`name.ilike.%${term}%,cpf_cnpj.ilike.%${term}%,phone.ilike.%${term}%`).limit(6),
        supabase.from("processes").select("id,cnj_number,internal_number,subject").or(`cnj_number.ilike.%${term}%,internal_number.ilike.%${term}%,subject.ilike.%${term}%`).limit(6),
        supabase.from("leads").select("id,name,phone,stage_key").or(`name.ilike.%${term}%,phone.ilike.%${term}%`).limit(6),
      ]);
      if (!active) return;
      const next: SearchItem[] = [
        ...(clients.data || []).map((x: any) => ({ id: x.id, kind: "Cliente" as const, title: x.name, detail: x.cpf_cnpj || x.phone || "Cadastro de cliente", path: `/clientes/${encodeURIComponent(x.id)}` })),
        ...(processes.data || []).map((x: any) => ({ id: x.id, kind: "Processo" as const, title: x.cnj_number || x.internal_number || x.subject || "Processo", detail: x.subject || "Acompanhamento processual", path: `/processos/${encodeURIComponent(x.id)}` })),
        ...(leads.data || []).map((x: any) => ({ id: x.id, kind: "Lead" as const, title: x.name, detail: x.phone || x.stage_key || "Oportunidade", path: `/crm?buscar=${encodeURIComponent(x.name)}` })),
      ];
      setRecords(next);
      setLoading(false);
    }, 280);
    return () => { active = false; window.clearTimeout(timer); };
  }, [normalized, query]);

  const results = [...moduleResults, ...records].slice(0, 15);
  const choose = (item: SearchItem) => {
    if (item.kind === "Funcionalidade") navigate(item.path);
    else window.location.assign(item.path);
    setOpen(false);
    setQuery("");
  };
  return (
    <div className="global-search" ref={root}>
      <label className="global-search-field">
        {loading ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
        <span className="sr-only">Buscar na LexOffice</span>
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && results[0]) choose(results[0]);
          }}
          placeholder="Buscar cliente, processo, lead ou função..."
          aria-label="Busca global"
          aria-expanded={open}
          aria-controls="global-search-results"
        />
        <kbd aria-hidden="true">Ctrl K</kbd>
        {query && <button type="button" aria-label="Limpar busca" onClick={() => setQuery("")}><X size={15} /></button>}
      </label>
      {open && query.trim() && (
        <div id="global-search-results" className="global-search-results" role="listbox" aria-label="Resultados da busca">
          {results.length ? results.map((item) => (
            <button type="button" role="option" key={`${item.kind}-${item.id}`} onClick={() => choose(item)}>
              <span><small>{item.kind}</small><b>{item.title}</b><em>{item.detail}</em></span>
              <ArrowRight size={16} />
            </button>
          )) : !loading && <p>Nenhum resultado encontrado. Tente nome, CPF, telefone, processo ou função.</p>}
        </div>
      )}
    </div>
  );
}

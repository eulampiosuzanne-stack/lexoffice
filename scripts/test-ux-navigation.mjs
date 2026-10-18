import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
const search = read("src/components/GlobalSearch.tsx");
const clients = read("src/pages/Clients.tsx");
const processes = read("src/pages/Processes.tsx");
const crm = read("src/pages/CRM.tsx");
const portal = read("src/pages/ClientPortal.tsx");
const css = read("src/lexoffice-neon-premium.css");

const tests = [
  ["busca global renderizada", app.includes("<GlobalSearch />")],
  ["busca consulta clientes", search.includes('from("clients")')],
  ["busca consulta processos", search.includes('from("processes")')],
  ["busca consulta leads", search.includes('from("leads")')],
  ["busca navega para resultado", search.includes("window.location.assign(item.path)")],
  ["clientes recebem filtro da busca", clients.includes('get("buscar")')],
  ["processos recebem filtro da busca", processes.includes("get('buscar')") || processes.includes('get("buscar")')],
  ["CRM recebe filtro da busca", crm.includes("visibleLeads") && crm.includes("crm-search")],
  ["menu agrupado por relacionamento", app.includes('label: "Relacionamento"')],
  ["menu agrupado por gestão jurídica", app.includes('label: "Gestão jurídica"')],
  ["agenda direta no celular", app.includes('to="/agenda"') && app.includes("Agenda")],
  ["contexto da tela exibido", app.includes("ux-context-bar")],
  ["portal resume situação atual", portal.includes("cp-focus-grid")],
  ["onboarding atualiza após carregar", portal.includes("[onboarding]")],
  ["busca responsiva estilizada", css.includes(".global-search-results")],
];

let failed = 0;
for (const [name, ok] of tests) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);

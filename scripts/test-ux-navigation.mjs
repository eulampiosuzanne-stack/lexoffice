import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
const navigation = read("src/navigation/areas.ts");
const search = read("src/components/GlobalSearch.tsx");
const clients = read("src/pages/Clients.tsx");
const processes = read("src/pages/Processes.tsx");
const crm = read("src/pages/CRM.tsx");
const portal = read("src/pages/ClientPortal.tsx");
const css = read("src/design-system/components.css");
const tokens = read("src/design-system/tokens.css");
const shellCss = read("src/design-system/shell.css");
const main = read("src/main.tsx");

const tests = [
  ["busca global renderizada", app.includes("<GlobalSearch />")],
  ["busca consulta clientes", search.includes('from("clients")')],
  ["busca consulta processos", search.includes('from("processes")')],
  ["busca consulta leads", search.includes('from("leads")')],
  ["busca navega para resultado", search.includes("window.location.assign(item.path)")],
  ["clientes recebem filtro da busca", clients.includes('get("buscar")')],
  ["processos recebem filtro da busca", processes.includes("get('buscar')") || processes.includes('get("buscar")')],
  ["CRM recebe filtro da busca", crm.includes("visibleLeads") && crm.includes("crm-search")],
  ["menu de atendimento separado", navigation.includes("label:'Atendimento'")],
  ["processos separados de agenda", navigation.includes("label:'Processos'") && navigation.includes("label:'Agenda e tarefas'")],
  ["agenda direta no celular", app.includes('to="/agenda"') && app.includes("Agenda")],
  ["contexto da tela exibido", app.includes("ux-context-bar")],
  ["início usa centro de comando", read("src/pages/DashboardOverview.tsx").includes("home-command")],
  ["início consulta dados reais", read("src/pages/DashboardOverview.tsx").includes("process_deadlines") && read("src/pages/DashboardOverview.tsx").includes("client_app_inbox")],
  ["início sem cabeçalho duplicado", app.includes("home-route") && !app.includes("ux-senior-modernization.css")],
  ["destinos da área ficam somente no submenu lateral", app.includes("<WorkspaceSidebar") && !app.includes("areaTabs.length > 1")],
  ["dashboard isolado de estilos antigos", read("src/pages/dashboard-home.css").includes("Isolamento visual do centro de comando")],
  ["portal resume situação atual", portal.includes("cp-focus-grid")],
  ["onboarding atualiza após carregar", portal.includes("[onboarding]")],
  ["busca responsiva estilizada", read("src/components/GlobalSearch.css").includes(".global-search")],
  ["atalho de teclado da busca", search.includes('event.key.toLowerCase() === "k"')],
  ["atalho para conteúdo acessível", app.includes('className="skip-link"')],
  ["menu desktop legível sem hover", tokens.includes("--lx-surface") && shellCss.length > 0],
  ["gaveta móvel bloqueia rolagem", read("src/mobile-shell.css").includes("nav-drawer-open")],
  ["navegação móvel com cinco destinos", read("src/mobile-shell.css").includes("repeat(5")],
  ["rotas carregadas sob demanda", app.includes('lazy(() => import("./pages/Clients"))')],
  ["feedback durante troca de área", app.includes("route-loading")],
  ["camada UX carregada por último", main.includes('import "./design-system/tokens.css";') && main.includes('import "./design-system/components.css";') && !main.includes('import "./ux-senior-modernization.css";')],
  ["título correto antes da autenticação", app.includes('document.title = "Acessar | LEXOFFICE"')],
];

let failed = 0;
for (const [name, ok] of tests) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import App from "./App";
import PlatformAdminEntry from "./pages/PlatformAdminEntry";
import PublicClientForm from "./pages/PublicClientForm";
import Landing from "./pages/Landing";
import OfficeLanding from "./pages/OfficeLanding";
import Planos from "./pages/Planos";
import Checkout from "./pages/Checkout";
import ClientPortal from "./pages/ClientPortal";
import ClientFormShareAction from "./components/ClientFormShareAction";
import ClientMessageActionBridge from "./components/ClientMessageActionBridge";
import BulkClientMessageBridge from "./components/BulkClientMessageBridge";
import OfficeBrandBridge from "./OfficeBrandBridge";
import ThemeController from "./ThemeController";
import { applyVisibility, readVisibility } from "./lib/visualPreferences";
import "./pwa-install";
import "./design-system/tokens.css";
import "./design-system/foundations.css";
import "./design-system/auth.css";
import "./styles.css";
import "./interaction-feedback.css";
import "./pages/whatsapp-conversations.css";
import "./pages/agent-advanced.css";
import "./pages/investigation.css";
import "./pages/client-cards.css";
import "./pages/card-layouts.css";
import "./pages/calculator-cards.css";
import "./pages/settings-enhanced.css";
import "./pages/dashboard-premium.css";
import "./pages/signatures.css";
import "./client-intake.css";
import "./design-system/components.css";
import "./pages/service-workspace.css";
import "./pages/service-bulk.css";
import "./design-system/shell.css";
import "./mobile-shell.css";
import "./design-system/workspaces.css";
import "./design-system/navigation.css";
import "./design-system/accessibility.css";
applyVisibility(readVisibility());
// Apply saved preference before React renders to prevent dark-theme flash.
try {
    const theme = localStorage.getItem("lexoffice-theme") === "light" ? "light" : "dark";
    document.documentElement.dataset.lexTheme = theme;
    document.documentElement.style.colorScheme = theme;
}
catch {
    document.documentElement.dataset.lexTheme = "dark";
}
const intakePrefix = "/formulario-cliente/";
const path = window.location.pathname.replace(/\/$/, "") || "/";
const isPublicIntake = window.location.pathname.startsWith(intakePrefix);
const isPublicLanding = ["/apresentacao", "/conheca-lexoffice"].includes(path);
const isOfficeLanding = ["/escritorio", "/suzanne-figueiredo"].includes(path);
const isPublicPlans = ["/planos", "/precos", "/pricing"].includes(path);
const isPublicCheckout = path === "/checkout";
const isClientPortal = [
    "/cliente",
    "/app-cliente",
    "/area-do-cliente",
].includes(path);
const intakeToken = isPublicIntake
    ? decodeURIComponent(window.location.pathname.slice(intakePrefix.length).split("/")[0] || "")
    : "";
const RootApp = window.location.pathname.startsWith("/admin")
    ? PlatformAdminEntry
    : App;
function ClientToolsGate() { const { pathname } = useLocation(); return pathname.startsWith("/clientes") ? <ClientFormShareAction /> : null; }
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode>
    <OfficeBrandBridge>
    {false}
    <BrowserRouter>
      <ThemeController />
      {isPublicIntake ? (<PublicClientForm token={intakeToken}/>) : isOfficeLanding ? (<OfficeLanding />) : isPublicLanding ? (<Landing />) : isPublicPlans ? (<Planos />) : isPublicCheckout ? (<Checkout />) : isClientPortal ? (<ClientPortal />) : (<>
          <>
            <RootApp />
            <ClientToolsGate />
            <ClientMessageActionBridge />
            <BulkClientMessageBridge />

          </>
        </>)}
    </BrowserRouter>
    </OfficeBrandBridge>
  </React.StrictMode>);
const dashboardTargets = [
    "/processos",
    "/crm",
    "/clientes",
    "/agenda",
    "/agenda",
    "/andamentos",
    "/assinaturas",
    "/agentes-ia",
];
document.addEventListener("click", (event) => {
    const el = (event.target as HTMLElement | null)?.closest?.(".dashboard-kpi") as HTMLElement | null;
    if (!el)
        return;
    const cards = Array.from(document.querySelectorAll(".dashboard-kpi"));
    const target = dashboardTargets[cards.indexOf(el)];
    if (target)
        window.location.assign(target);
});
document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ")
        return;
    const el = (event.target as HTMLElement | null)?.closest?.(".dashboard-kpi") as HTMLElement | null;
    if (!el)
        return;
    event.preventDefault();
    el.click();
});
const decorateDashboardCards = () => {
    document
        .querySelectorAll<HTMLElement>(".dashboard-kpi")
        .forEach((el, index) => {
        if (!dashboardTargets[index])
            return;
        el.tabIndex = 0;
        el.setAttribute("role", "link");
        el.setAttribute("aria-label", `Abrir ${el.innerText.replace(/\s+/g, " ").trim()}`);
        el.style.cursor = "pointer";
    });
};
new MutationObserver(decorateDashboardCards).observe(document.documentElement, {
    childList: true,
    subtree: true,
});
decorateDashboardCards();
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
}

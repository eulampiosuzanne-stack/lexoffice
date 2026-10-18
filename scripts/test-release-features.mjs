import fs from "node:fs";
const read = (p) => fs.readFileSync(p, "utf8");
const onboarding = read("src/components/ClientOnboardingPanel.tsx");
const portal = read("src/pages/ClientPortal.tsx");
const fees = read("src/pages/PerfilCliente.tsx");
const review = read("src/pages/RevisaoPeca.tsx");
const app = read("src/App.tsx");
const css = read("src/lexoffice-neon-premium.css");
const checks = [
  ["onboarding iniciado somente pelo escritório", onboarding.includes("Iniciar onboarding")],
  ["cliente confirma ciência", portal.includes("Li e estou ciente")],
  ["urgência limitada a duas hipóteses", portal.includes("Perigo iminente de morte") && portal.includes("Risco à integridade física") && !portal.includes("Intimação ou documento com prazo")],
  ["cartão recorrente é recomendado", fees.includes("CARTÃO COM COBRANÇA RECORRENTE — RECOMENDADA")],
  ["boleto exige liberação", fees.includes("boletoReleased") && fees.includes("Liberar boleto excepcionalmente")],
  ["sem início antes da entrada", fees.includes("Sem confirmação da entrada")],
  ["cartilha de pagamento", fees.includes("Cartilha de Pagamento de Honorários")],
  ["revisão aceita somente docx e pdf", review.includes('["docx", "pdf"]')],
  ["limite de revisão 20 MB", review.includes("20 * 1024 * 1024")],
  [
    "revisão não inventa resultado",
    review
      .toLowerCase()
      .replace(/\s+/g, " ")
      .includes("nenhuma fonte, jurisprudência, fato ou nota foi inventada"),
  ],
  ["rota Revisão da Peça", app.includes('path="/revisao-peca"')],
  ["tema global com tokens", css.includes("--lx-bg: #05050a") && css.includes("--lx-gold: #d4af37")],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);

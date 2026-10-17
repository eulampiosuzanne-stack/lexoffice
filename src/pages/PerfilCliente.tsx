import { useEffect, useMemo, useState } from "react";
import "./integrations.css";
import { supabase } from "../lib/supabase";
const money = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const DEFAULT_IDEAL_CLIENT_PROFILE =
  "Cliente com renda minimamente estável, entrada disponível e parcela mensal de até 15% da renda, preferencialmente com histórico positivo de pagamentos. A classificação é apenas uma referência interna e não garante o pagamento.";
const normalizeFinancialProfile = (value?: string | null) =>
  !value || value.startsWith("Demanda compatível com as áreas de atuação")
    ? DEFAULT_IDEAL_CLIENT_PROFILE
    : value;
export default function PerfilCliente() {
  const [expectations, setExpectations] = useState(false),
    [documentsReady, setDocumentsReady] = useState(false),
    [history, setHistory] = useState("desconhecido"),
    [name, setName] = useState(""),
    [income, setIncome] = useState(3000),
    [kind, setKind] = useState("Ação de alimentos"),
    [claim, setClaim] = useState(5000),
    [fees, setFees] = useState(5000),
    [installments, setInstallments] = useState(12),
    [entryMode, setEntryMode] = useState<"percent" | "fixed">("percent"),
    [entryPct, setEntryPct] = useState(20),
    [entryAmount, setEntryAmount] = useState(1000),
    [cashDiscount, setCashDiscount] = useState(0),
    [cardInstallments, setCardInstallments] = useState(12),
    [cardMarkup, setCardMarkup] = useState(12),
    [boletoMarkup, setBoletoMarkup] = useState(25),
    [hasCounteroffer, setHasCounteroffer] = useState(false),
    [counterEntry, setCounterEntry] = useState(0),
    [counterInstallments, setCounterInstallments] = useState(1),
    [counterInstallmentAmount, setCounterInstallmentAmount] = useState(0),
    [notes, setNotes] = useState(""),
    [notice, setNotice] = useState(""),
    [idealClientProfile, setIdealClientProfile] = useState("");
  const monthlyCap = 15;
  useEffect(() => {
    (async () => {
      const savedProfile = localStorage.getItem(
        "lexoffice_ideal_client_profile",
      );
      if (savedProfile)
        setIdealClientProfile(normalizeFinancialProfile(savedProfile));
      if (!supabase) return;
      const { data: orgId } = await supabase.rpc("current_org_id");
      if (!orgId) return;
      const { data } = await supabase
        .from("organization_settings")
        .select("ideal_client_profile")
        .eq("org_id", orgId)
        .maybeSingle();
      if (data?.ideal_client_profile) {
        const financialProfile = normalizeFinancialProfile(
          data.ideal_client_profile,
        );
        setIdealClientProfile(financialProfile);
        localStorage.setItem(
          "lexoffice_ideal_client_profile",
          financialProfile,
        );
      }
    })();
  }, []);
  const recommendation = useMemo(() => {
    const base = Math.max(0, fees),
      salary = Math.max(0, income),
      calculatedEntry =
        entryMode === "fixed"
          ? Math.max(0, entryAmount)
          : Math.ceil((base * entryPct) / 100 / 50) * 50,
      entry = Math.min(base, calculatedEntry),
      cap = (salary * monthlyCap) / 100;
    const suggestedMonths =
      cap > 0 ? clamp(Math.ceil((base * 1.25 - entry) / cap), 1, 24) : 12;
    return { entry, suggestedMonths, capacity: cap };
  }, [fees, income, entryMode, entryPct, entryAmount]);
  const cash = Math.max(0, fees) * (1 - clamp(cashDiscount, 0, 100) / 100);
  const cardMonths = clamp(Math.round(cardInstallments) || 1, 1, 24),
    cardTotal = Math.max(0, fees) * (1 + Math.max(0, cardMarkup) / 100),
    cardMonthly = cardTotal / cardMonths;
  const boleto = Math.max(0, fees) * (1 + Math.max(0, boletoMarkup) / 100);
  const entry = Math.min(boleto, recommendation.entry),
    balance = Math.max(0, boleto - entry),
    months = clamp(Math.round(installments) || 1, 1, 60),
    monthly = balance / months;
  const boletoIncomePct = income > 0 ? (monthly / income) * 100 : null,
    cardIncomePct = income > 0 ? (cardMonthly / income) * 100 : null,
    cashIncomePct = income > 0 ? (cash / income) * 100 : null;
  const paymentRisk = (percentage: number | null) => {
    if (percentage === null) return "Não calculado";
    if (history === "pendencias" || percentage > 20) return "Risco crítico";
    if (percentage > 15) return "Risco elevado";
    if (percentage > 10) return "Risco moderado";
    return "Baixo risco";
  };
  const overCapacity =
      recommendation.capacity > 0 && monthly > recommendation.capacity,
    cardOverCapacity =
      recommendation.capacity > 0 && cardMonthly > recommendation.capacity;
  const profile =
    history === "pendencias"
      ? "Risco comercial elevado — exige decisão da advogada"
      : !expectations || !documentsReady
        ? "Avaliação necessária"
        : overCapacity && cardOverCapacity
          ? "Capacidade mensal incompatível com as opções atuais"
          : overCapacity || cardOverCapacity
            ? "Compatibilidade parcial — escolha a condição mais sustentável"
            : "Potencialmente compatível, sujeito à avaliação da advogada";
  const rationale = [
    !expectations
      ? "Expectativas e limites de atendimento ainda não foram confirmados."
      : "Expectativas de atendimento esclarecidas.",
    !documentsReady
      ? "Documentação ainda não conferida."
      : "Documentação conferida.",
    `No cartão, a parcela compromete ${cardIncomePct === null ? "percentual não calculado" : cardIncomePct.toFixed(1) + "%"} da renda; no boleto, ${boletoIncomePct === null ? "percentual não calculado" : boletoIncomePct.toFixed(1) + "%"}.`,
    history === "desconhecido"
      ? "Não há histórico suficiente para estimar pontualidade; não é possível concluir que pagará em dia."
      : history === "positivo"
        ? "Há histórico positivo informado, sujeito à conferência."
        : "Há pendências relatadas; exija análise individual antes de aceitar parcelamento.",
  ].join(" ");
  const suggestedCount =
    recommendation.capacity > 0
      ? clamp(Math.ceil(balance / recommendation.capacity), 1, 60)
      : months;
  const suggestedMonthly = balance / suggestedCount;
  const counterMonths = clamp(Math.round(counterInstallments) || 1, 1, 60),
    counterTotal =
      Math.max(0, counterEntry) +
      counterMonths * Math.max(0, counterInstallmentAmount);
  const feasibleBoleto = income > 0 && monthly <= recommendation.capacity;
  const feasibleCard = income > 0 && cardMonthly <= recommendation.capacity;
  const best =
    feasibleBoleto && (!feasibleCard || monthly <= cardMonthly)
      ? "Boleto parcelado, se a entrada for viável"
      : feasibleCard
        ? "Cartão parcelado, por ter parcela mensal mais compatível"
        : "À vista, somente se houver disponibilidade, ou revisão das condições parceladas";
  const why = `À vista: ${money(cash)}, equivalente a ${cashIncomePct === null ? "—" : cashIncomePct.toFixed(1) + "%"} de uma renda mensal declarada. Cartão: total de ${money(cardTotal)}, acréscimo de ${money(cardTotal - Math.max(0, fees))} (${cardMarkup}%), em ${cardMonths} parcela(s) de ${money(cardMonthly)}, comprometendo ${cardIncomePct === null ? "—" : cardIncomePct.toFixed(1) + "%"} da renda por mês. Boleto: total de ${money(boleto)}, acréscimo de ${money(boleto - Math.max(0, fees))} (${boletoMarkup}%), entrada de ${money(entry)} e ${months} parcela(s) de ${money(monthly)}, comprometendo ${boletoIncomePct === null ? "—" : boletoIncomePct.toFixed(1) + "%"} da renda por mês.`;
  const customerSuggestion = `Podemos apresentar três alternativas: à vista por ${money(cash)}; cartão em ${cardMonths} parcela(s) de aproximadamente ${money(cardMonthly)}, total de ${money(cardTotal)}; ou boleto com entrada de ${money(entry)} e ${months} parcela(s) de aproximadamente ${money(monthly)}, total de ${money(boleto)}. A escolha final depende da aprovação do escritório e da condição mais segura para o cliente.`;
  const proposal = `PROPOSTA DE HONORÁRIOS ADVOCATÍCIOS\nSuzanne Figueiredo Advocacia e Soluções Jurídicas\n\nInteressado(a): ${name.trim() || "[nome do cliente]"}\nDemanda: ${kind}\nValor informado da ação: ${money(claim)}\n\nOPÇÃO 1 · PAGAMENTO À VISTA\nHonorários: ${money(cash)}${cashDiscount > 0 ? ` (desconto de ${cashDiscount}% sobre o valor-base)` : ""}\n\nOPÇÃO 2 · CARTÃO PARCELADO\nHonorários totais: ${money(cardTotal)}\nAcréscimo da modalidade: ${money(cardTotal - Math.max(0, fees))} (${cardMarkup}%)\n${cardMonths} parcela(s) de aproximadamente ${money(cardMonthly)}.\n\nOPÇÃO 3 · BOLETO PARCELADO\nHonorários totais: ${money(boleto)}\nAcréscimo da modalidade: ${money(boleto - Math.max(0, fees))} (${boletoMarkup}%)\nEntrada: ${money(entry)}\nSaldo: ${money(balance)}\n${months} parcelas de aproximadamente ${money(monthly)}; eventual diferença de arredondamento será ajustada na última parcela.${hasCounteroffer ? `\n\nCONTRAPROPOSTA APRESENTADA PELO CLIENTE\nEntrada: ${money(counterEntry)}\n${counterMonths} parcela(s) de ${money(counterInstallmentAmount)}\nTotal da contraproposta: ${money(counterTotal)}\nSituação: pendente de análise e aprovação expressa do escritório.` : ""}\n\n${notes.trim() ? notes.trim() + "\n\n" : ""}Proposta sujeita à aprovação do escritório, formalização contratual e verificação de conformidade com a tabela da OAB aplicável. O valor da causa não equivale aos honorários.\n\nValidade e início dos serviços: conforme contrato a ser celebrado.`;
  function copy() {
    navigator.clipboard
      .writeText(proposal)
      .then(() =>
        setNotice("Proposta copiada. Confira antes de enviar ao cliente."),
      )
      .catch(() => setNotice("Não foi possível copiar automaticamente."));
  }
  function print() {
    const w = window.open("", "_blank");
    if (!w) {
      setNotice("Permita janelas pop-up para gerar a proposta em PDF.");
      return;
    }
    const safe = proposal
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    w.document.write(
      "<html><head><title>Proposta de honorários</title><style>body{font:15px/1.7 Georgia,serif;max-width:760px;margin:60px auto;color:#30221e}pre{white-space:pre-wrap;font:inherit}h1{color:#743128}</style></head><body><h1>SUZANNE FIGUEIREDO ADVOCACIA</h1><hr/><pre>" +
        safe +
        "</pre></body></html>",
    );
    w.document.close();
    w.focus();
    w.print();
  }
  return (
    <div className="module-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">FINANCEIRO · JORNADA COMERCIAL</span>
          <h1>Propostas comerciais</h1>
          <p>
            Qualificação financeira, análise de comprometimento da renda e três
            formas de pagamento prontas para apresentar.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <h2>Dados da negociação</h2>
          <label>
            Nome do cliente
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
            />
          </label>
          <label>
            Renda mensal declarada (R$)
            <input
              type="number"
              min="0"
              value={income}
              onChange={(e) => setIncome(+e.target.value)}
            />
          </label>
          <label>
            Tipo de ação
            <input value={kind} onChange={(e) => setKind(e.target.value)} />
          </label>
          <label>
            Valor da ação / valor da causa (R$)
            <input
              type="number"
              min="0"
              value={claim}
              onChange={(e) => setClaim(+e.target.value)}
            />
          </label>
          <label>
            Honorários-base propostos pelo escritório (R$)
            <input
              type="number"
              min="0"
              value={fees}
              onChange={(e) => setFees(+e.target.value)}
            />
          </label>
          <h3>Parâmetros ajustáveis</h3>
          <label>
            Forma de definir a entrada
            <select
              value={entryMode}
              onChange={(e) =>
                setEntryMode(e.target.value as "percent" | "fixed")
              }
            >
              <option value="percent">Percentual dos honorários-base</option>
              <option value="fixed">Valor fixo em dinheiro</option>
            </select>
          </label>
          {entryMode === "percent" ? (
            <label>
              Entrada sugerida (% dos honorários-base)
              <input
                type="number"
                min="0"
                max="100"
                value={entryPct}
                onChange={(e) => setEntryPct(+e.target.value)}
              />
            </label>
          ) : (
            <label>
              Entrada sugerida (R$)
              <input
                type="number"
                min="0"
                value={entryAmount}
                onChange={(e) => setEntryAmount(+e.target.value)}
              />
            </label>
          )}
          <label>
            Desconto opcional para pagamento à vista (%)
            <input
              type="number"
              min="0"
              max="100"
              value={cashDiscount}
              onChange={(e) => setCashDiscount(+e.target.value)}
            />
          </label>
          <label>
            Parcelas no cartão
            <input
              type="number"
              min="1"
              max="24"
              value={cardInstallments}
              onChange={(e) => setCardInstallments(+e.target.value)}
            />
          </label>
          <label>
            Acréscimo/juros do cartão (%)
            <input
              type="number"
              min="0"
              value={cardMarkup}
              onChange={(e) => setCardMarkup(+e.target.value)}
            />
          </label>
          <label>
            Parcelas do boleto
            <input
              type="number"
              min="1"
              max="60"
              value={installments}
              onChange={(e) => setInstallments(+e.target.value)}
            />
          </label>
          <label>
            Acréscimo no boleto parcelado (%)
            <input
              type="number"
              min="0"
              value={boletoMarkup}
              onChange={(e) => setBoletoMarkup(+e.target.value)}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={hasCounteroffer}
              onChange={(e) => setHasCounteroffer(e.target.checked)}
            />{" "}
            Cliente apresentou contraproposta
          </label>
          {hasCounteroffer && (
            <div className="integration-card wide">
              <h3>Contraproposta do cliente</h3>
              <label>
                Entrada oferecida (R$)
                <input
                  type="number"
                  min="0"
                  value={counterEntry}
                  onChange={(e) => setCounterEntry(+e.target.value)}
                />
              </label>
              <label>
                Quantidade de parcelas
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={counterInstallments}
                  onChange={(e) => setCounterInstallments(+e.target.value)}
                />
              </label>
              <label>
                Valor de cada parcela (R$)
                <input
                  type="number"
                  min="0"
                  value={counterInstallmentAmount}
                  onChange={(e) => setCounterInstallmentAmount(+e.target.value)}
                />
              </label>
              <p>
                <strong>
                  Total oferecido pelo cliente: {money(counterTotal)}
                </strong>
              </p>
              <small>
                A contraproposta ficará registrada na prévia como pendente de
                análise; ela não será aceita automaticamente.
              </small>
            </div>
          )}
          <label>
            Condições e observações
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: despesas não incluídas, validade da proposta, escopo dos serviços"
            />
          </label>
        </section>
        <section className="panel">
          <h2>Simulação assistida</h2>
          <p>
            A renda é apenas referência de planejamento, não prova de capacidade
            de pagamento. A sugestão usa uma regra transparente, sem decisão
            automática de aceitação.
          </p>
          <div className="integration-card">
            <b>Valor da causa informado</b>
            <h2>{money(claim)}</h2>
            <p>Honorários-base definidos pelo escritório: {money(fees)}</p>
          </div>
          <div className="integration-card">
            <b>1. Pagamento à vista</b>
            <h2>{money(cash)}</h2>
            <p>
              Pagamento único
              {cashDiscount > 0 ? ` com ${cashDiscount}% de desconto` : ""}.
              Compromete o equivalente a{" "}
              {cashIncomePct === null ? "—" : cashIncomePct.toFixed(1) + "%"} de
              uma renda mensal declarada.
            </p>
          </div>
          <div className="integration-card">
            <b>2. Cartão parcelado (+{cardMarkup}%)</b>
            <h2>{money(cardTotal)}</h2>
            <p>
              Acréscimo/juros: {money(cardTotal - Math.max(0, fees))}.{" "}
              {cardMonths} parcela(s) de {money(cardMonthly)}, equivalentes a{" "}
              {cardIncomePct === null ? "—" : cardIncomePct.toFixed(1) + "%"} da
              renda mensal.
            </p>
          </div>
          <div className="integration-card">
            <b>3. Boleto parcelado (+{boletoMarkup}%)</b>
            <h2>{money(boleto)}</h2>
            <p>
              Acréscimo: {money(boleto - Math.max(0, fees))}. Entrada{" "}
              {money(entry)} + {months} parcelas de aproximadamente{" "}
              {money(monthly)}, equivalentes a{" "}
              {boletoIncomePct === null
                ? "—"
                : boletoIncomePct.toFixed(1) + "%"}{" "}
              da renda mensal.
            </p>
          </div>
          {hasCounteroffer && (
            <div className="integration-card">
              <b>Contraproposta do cliente · pendente</b>
              <h2>{money(counterTotal)}</h2>
              <p>
                Entrada {money(counterEntry)} + {counterMonths} parcela(s) de{" "}
                {money(counterInstallmentAmount)}.
              </p>
            </div>
          )}
          <div className="integration-card">
            <b>Sugestão de parcelamento</b>
            <p>
              Referência mensal: {money(recommendation.capacity)} ({monthlyCap}%
              da renda declarada).
            </p>
            <p>
              Entrada de referência: {money(recommendation.entry)}.
              Aproximadamente {recommendation.suggestedMonths} parcelas para se
              aproximar do limite mensal informado, até 24 meses.
            </p>
            {(overCapacity || cardOverCapacity) && (
              <p role="alert">
                Pelo menos uma das parcelas supera o limite mensal de
                referência. Revise as condições antes de oferecê-las.
              </p>
            )}
          </div>
          <div className="integration-card">
            <h3>Análise de capacidade e risco de pagamento</h3>
            <p>
              <strong>Cartão:</strong> {paymentRisk(cardIncomePct)} · parcela de{" "}
              {cardIncomePct === null ? "—" : cardIncomePct.toFixed(1) + "%"} da renda.
            </p>
            <p>
              <strong>Boleto:</strong> {paymentRisk(boletoIncomePct)} · parcela de{" "}
              {boletoIncomePct === null ? "—" : boletoIncomePct.toFixed(1) + "%"} da renda.
            </p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={expectations}
                onChange={(e) => setExpectations(e.target.checked)}
              />{" "}
              Cliente compreende escopo, prazos e regras de atendimento
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={documentsReady}
                onChange={(e) => setDocumentsReady(e.target.checked)}
              />{" "}
              Documentação e viabilidade jurídica conferidas
            </label>
            <label>
              Histórico de compromissos documentado
              <select
                value={history}
                onChange={(e) => setHistory(e.target.value)}
              >
                <option value="desconhecido">Sem histórico verificável</option>
                <option value="positivo">Compromissos cumpridos</option>
                <option value="pendencias">Pendências a esclarecer</option>
              </select>
            </label>
            <h3>{profile}</h3>
            <p>{rationale}</p>
            <p>
              <strong>Perfil financeiro indicado pelo escritório:</strong>{" "}
              {idealClientProfile || DEFAULT_IDEAL_CLIENT_PROFILE}
            </p>
            <p>
              A Lex não promete que o cliente pagará em dia. O resultado é uma
              estimativa baseada na renda, no comprometimento mensal, na
              documentação e no histórico informado. A decisão final permanece
              com a advogada.
            </p>
          </div>
          <div className="integration-card">
            <h3>Recomendação de viabilidade comercial</h3>
            <p>
              <strong>Melhor alternativa preliminar: {best}</strong>
            </p>
            <p>{why}</p>
            <p>
              <strong>Mensagem sugerida para o cliente:</strong>{" "}
              {customerSuggestion}
            </p>
            <p>
              Esta comparação é calculada por regras financeiras transparentes.
              Não verifica despesas, limite do cartão, disponibilidade de caixa
              ou crédito e não substitui avaliação individual da advogada.
            </p>
          </div>
          <h3>Prévia da proposta</h3>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              lineHeight: 1.6,
              padding: 16,
              border: "1px solid #c8ad75",
              borderRadius: 10,
            }}
          >
            {proposal}
          </pre>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-primary" type="button" onClick={copy}>
              Copiar para WhatsApp
            </button>
            <button className="btn-secondary" type="button" onClick={print}>
              Imprimir / salvar PDF
            </button>
          </div>
          {notice && <p role="status">{notice}</p>}
        </section>
      </div>
    </div>
  );
}

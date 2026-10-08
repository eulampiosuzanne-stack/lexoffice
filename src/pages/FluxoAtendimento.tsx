import { UserRound, UserPlus, Bot, MessageCircle, Scale, FileText, ShieldAlert, Handshake } from "lucide-react";

type Step = {
  title: string;
  description: string;
  icon: typeof MessageCircle;
};

const leadSteps: Step[] = [
  {
    title: "O chatbot recebe o contato",
    description:
      "A pessoa escolhe que ainda não é cliente e informa o que precisa. O menu inicia a conversa e organiza a primeira triagem.",
    icon: MessageCircle,
  },
  {
    title: "Helena faz a triagem com IA",
    description:
      "A IA Helena (OpenAI, com o modelo definido nas configurações) identifica o nome, a área jurídica, a cidade, se já existe processo, a urgência e um breve relato. Ela encaminha o contato para o agente adequado.",
    icon: Bot,
  },
  {
    title: "Comercial e Agenda dão sequência",
    description:
      "O agente Comercial acompanha a possível contratação. Quando necessário, o agente de Agenda consulta a disponibilidade real e segue as regras cadastradas para a consulta.",
    icon: Handshake,
  },
  {
    title: "A Dra. Suzanne assume quando necessário",
    description:
      "Pedido para falar com a advogada, situação urgente ou sensível, dúvida relevante, negociação fora das regras ou falha de ferramenta interrompe a automação e encaminha a conversa para a Dra. Suzanne ou sua equipe.",
    icon: Scale,
  },
];

const clientSteps: Step[] = [
  {
    title: "O chatbot recebe a solicitação",
    description:
      "A pessoa escolhe “Sou cliente” e indica o assunto: processo, andamento, documento, pagamento, agenda ou falar com a equipe.",
    icon: MessageCircle,
  },
  {
    title: "Helena reconhece e encaminha",
    description:
      "A IA de triagem identifica que a pessoa já é cliente e envia a conversa ao agente responsável, sem iniciar uma abordagem comercial.",
    icon: Bot,
  },
  {
    title: "O agente especializado atende",
    description:
      "Andamentos: agente processual. Agenda: agente de relacionamento. Pagamentos: agente financeiro. Cada agente usa a OpenAI e o modelo definido nas configurações do escritório.",
    icon: FileText,
  },
  {
    title: "A Dra. Suzanne recebe os casos que pedem intervenção",
    description:
      "Pedidos de atendimento humano, urgências, decisões ou prazos que exijam revisão, divergências financeiras e falhas são encaminhados para a Dra. Suzanne ou sua equipe.",
    icon: ShieldAlert,
  },
];

function FlowSection({
  title,
  subtitle,
  icon: Icon,
  steps,
}: {
  title: string;
  subtitle: string;
  icon: typeof UserRound;
  steps: Step[];
}) {
  return (
    <section
      aria-labelledby={title.replace(/\s+/g, "-").toLowerCase()}
      style={{
        background: "#17130f",
        border: "2px solid #8d682d",
        borderRadius: 18,
        padding: "clamp(20px, 4vw, 32px)",
        marginTop: 22,
        color: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          aria-hidden="true"
          style={{
            width: 54,
            height: 54,
            minWidth: 54,
            display: "grid",
            placeItems: "center",
            borderRadius: 14,
            background: "#332515",
            color: "#f0c66e",
          }}
        >
          <Icon size={28} />
        </span>
        <div>
          <h2
            id={title.replace(/\s+/g, "-").toLowerCase()}
            style={{ margin: 0, fontSize: "clamp(23px, 4vw, 30px)", color: "#f0c66e" }}
          >
            {title}
          </h2>
          <p style={{ margin: "5px 0 0", fontSize: 17, lineHeight: 1.5, color: "#f2eee8" }}>
            {subtitle}
          </p>
        </div>
      </div>

      <ol
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 245px), 1fr))",
          gap: 14,
          padding: 0,
          margin: "24px 0 0",
          listStyle: "none",
        }}
      >
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <li
              key={step.title}
              style={{
                minHeight: 208,
                padding: 20,
                borderRadius: 14,
                border: "1px solid #57452c",
                background: "#0c0b0a",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <span
                  aria-label={`Etapa ${index + 1}`}
                  style={{
                    width: 38,
                    height: 38,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "50%",
                    background: "#f0c66e",
                    color: "#17130f",
                    fontSize: 20,
                    fontWeight: 800,
                  }}
                >
                  {index + 1}
                </span>
                <StepIcon size={25} color="#d6a94e" aria-hidden="true" />
              </div>
              <h3 style={{ margin: "0 0 9px", fontSize: 20, lineHeight: 1.35 }}>
                {step.title}
              </h3>
              <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "#e9e3da" }}>
                {step.description}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function FluxoAtendimento() {
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 0 36px", color: "#fff" }}>
      <header style={{ marginBottom: 20 }}>
        <p style={{ margin: "0 0 7px", color: "#f0c66e", fontSize: 15, fontWeight: 800, letterSpacing: 1 }}>
          COMO O ATENDIMENTO ACONTECE
        </p>
        <h1 style={{ margin: 0, fontSize: "clamp(30px, 5vw, 40px)", lineHeight: 1.2 }}>
          Fluxo de Atendimento
        </h1>
        <p style={{ maxWidth: 800, margin: "10px 0 0", fontSize: 18, lineHeight: 1.6, color: "#f2eee8" }}>
          Veja onde o chatbot começa, como a inteligência artificial encaminha cada assunto e quando a conversa passa para atendimento humano.
        </p>
      </header>

      <FlowSection
        title="Leads"
        subtitle="Pessoas que ainda não são clientes."
        icon={UserPlus}
        steps={leadSteps}
      />
      <FlowSection
        title="Clientes"
        subtitle="Pessoas que já têm atendimento ou processo no escritório."
        icon={UserRound}
        steps={clientSteps}
      />

      <aside
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 13,
          marginTop: 22,
          padding: 20,
          borderLeft: "5px solid #7b2941",
          borderRadius: 12,
          background: "#211217",
          color: "#fff",
          fontSize: 17,
          lineHeight: 1.6,
        }}
      >
        <ShieldAlert size={24} color="#f0c66e" aria-hidden="true" />
        <p style={{ margin: 0 }}>
          A IA ajuda na triagem e nas tarefas configuradas. Orientações jurídicas sensíveis e situações que exigem decisão da advogada precisam de revisão humana.
        </p>
      </aside>
    </main>
  );
}

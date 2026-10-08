import { ArrowRight, Bot, Clock3, MessageCircle, ShieldAlert, UserRound, UsersRound, Workflow } from "lucide-react";

const gold = "#d1aa68";
const panel: React.CSSProperties = {
  background: "linear-gradient(145deg, #171411, #0e0c0b)",
  border: "1px solid rgba(209,170,104,.32)",
  borderRadius: 18,
  padding: 22,
  color: "#f5f0e7",
};
const title: React.CSSProperties = { margin: "0 0 8px", fontSize: 23, color: "#fff" };
const copy: React.CSSProperties = { margin: 0, fontSize: 17, lineHeight: 1.6, color: "#e7e0d5" };
const badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 12px",
  border: "1px solid rgba(209,170,104,.45)",
  borderRadius: 999,
  color: gold,
  fontWeight: 750,
  fontSize: 14,
};
const items = {
  lead: ["Escolhe uma área de atuação", "Informa o nome completo", "Conta o caso em poucas palavras", "O Lex registra o lead pelo telefone", "A equipe recebe o pedido"],
  client: ["O Lex procura o telefone no cadastro", "Se necessário, pede nome e número do processo", "Consulta o último andamento disponível", "A Helena explica em linguagem simples", "A Dra. Suzanne recebe os casos encaminhados"],
};
function Steps({ values }: { values: string[] }) {
  return <ol style={{ margin: "16px 0 0", paddingLeft: 26, display: "grid", gap: 12 }}>
    {values.map((value, index) => <li key={value} style={{ paddingLeft: 5, fontSize: 17, lineHeight: 1.5 }}>
      <span style={{ color: gold, fontWeight: 800 }}>{index + 1}. </span>{value}
    </li>)}
  </ol>;
}
export default function FluxoAtendimento() {
  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 16px 48px", color: "#f5f0e7" }}>
    <header style={{ marginBottom: 22 }}>
      <span style={badge}><Workflow size={18}/> ATENDIMENTO NO WHATSAPP</span>
      <h1 style={{ margin: "14px 0 6px", fontSize: 32, color: "#fff" }}>Fluxo de Atendimento</h1>
      <p style={{ ...copy, color: "#cfc6b8" }}>Veja o caminho de Leads e Clientes, e quando a conversa chega à Dra. Suzanne.</p>
    </header>

    <section style={{ ...panel, marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <MessageCircle size={26} color={gold} aria-hidden="true"/>
        <div>
          <h2 style={title}>Menu de entrada</h2>
          <p style={copy}>A primeira mensagem mostra a logo do escritório e três opções: <b>SOU CLIENTE</b>, <b>NÃO SOU CLIENTE</b> e <b>OUTROS</b>. O menu inicial não oferece “Falar com a Dra.”.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            {["SOU CLIENTE", "NÃO SOU CLIENTE", "OUTROS"].map((label) => <span key={label} style={{ ...badge, minHeight: 46, borderRadius: 12, color: "#fff", background: "#241b18", fontSize: 16 }}>{label}</span>)}
          </div>
        </div>
      </div>
    </section>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 18 }}>
      <section style={panel}>
        <span style={badge}><UsersRound size={18}/> LEADS</span>
        <h2 style={{ ...title, marginTop: 14 }}>Quem ainda não é cliente</h2>
        <p style={copy}>A pessoa escolhe uma área, informa o nome e descreve brevemente o caso. O Lex registra o lead pelo telefone para evitar cadastro duplicado.</p>
        <Steps values={items.lead}/>
        <div style={{ marginTop: 20, padding: 16, borderLeft: "4px solid #6c2638", background: "rgba(108,38,56,.2)", borderRadius: 8 }}>
          <b style={{ display: "flex", alignItems: "center", gap: 8, color: "#f0cbd3", fontSize: 17 }}><Bot size={19}/> Atuação da Helena</b>
          <p style={{ ...copy, marginTop: 8 }}>A Helena conduz a triagem e confirma o recebimento. Ela não inventa honorários, disponibilidade ou resultado.</p>
        </div>
      </section>

      <section style={panel}>
        <span style={badge}><UserRound size={18}/> CLIENTES</span>
        <h2 style={{ ...title, marginTop: 14 }}>Quem já tem cadastro</h2>
        <p style={copy}>A busca começa pelo telefone. Se não localizar ou houver mais de um processo, o atendimento pede nome e número do processo. Se não encontrar, encaminha à Dra. Suzanne.</p>
        <Steps values={items.client}/>
        <div style={{ marginTop: 20, padding: 16, borderLeft: "4px solid #6c2638", background: "rgba(108,38,56,.2)", borderRadius: 8 }}>
          <b style={{ display: "flex", alignItems: "center", gap: 8, color: "#f0cbd3", fontSize: 17 }}><Bot size={19}/> Atuação da Helena</b>
          <p style={{ ...copy, marginTop: 8 }}>A Helena consulta o último andamento disponível e o traduz em linguagem simples. Honorários só são informados quando constarem no sistema.</p>
        </div>
      </section>
    </div>

    <section style={{ ...panel, marginTop: 18 }}>
      <h2 style={title}>Quando a conversa passa para a Dra. Suzanne</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,230px),1fr))", gap: 14, marginTop: 16 }}>
        {[
          ["Cliente não localizado", "A busca não encontrou cadastro ou processo."],
          ["Pedido de ligação", "A solicitação é encaminhada sem prometer horário."],
          ["Urgência fora do horário", "A Dra. recebe o aviso imediato antes de outro atendimento."],
          ["Cliente VIP", "Recebe saudação pelo nome e segue direto para a Dra."],
          ["Outros assuntos", "A pessoa envia um resumo breve e a conversa é encaminhada."],
        ].map(([heading, detail]) => <article key={heading} style={{ padding: 16, borderRadius: 14, background: "#211b18", border: "1px solid rgba(255,255,255,.08)" }}>
          <b style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, color: "#fff" }}><ArrowRight size={18} color={gold}/>{heading}</b>
          <p style={{ ...copy, marginTop: 8, fontSize: 16 }}>{detail}</p>
        </article>)}
      </div>
    </section>

    <section style={{ ...panel, marginTop: 18, borderColor: "rgba(108,38,56,.75)" }}>
      <h2 style={title}>Horários e mensagens</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 18 }}>
        <p style={copy}><Clock3 size={18} color={gold} style={{ verticalAlign: "middle", marginRight: 8 }}/>Atendimento regular: segunda a sexta, das 12h às 18h. Fora desse horário, sábado, domingo e feriado, a mensagem informa que pode haver taxa adicional e oferece retorno no próximo dia útil ou aviso urgente à Dra.</p>
        <p style={copy}><ShieldAlert size={18} color={gold} style={{ verticalAlign: "middle", marginRight: 8 }}/>Botões e texto livre só são enviados dentro da janela permitida pela Meta. Fora dela, a conversa só pode ser iniciada por um modelo aprovado. Se um envio interativo falhar durante a janela, as opções serão enviadas em texto numerado.</p>
      </div>
    </section>
    <p style={{ margin: "18px 4px 0", color: "#bcb2a4", fontSize: 14, lineHeight: 1.5 }}>Os botões da Meta são apresentados com o estilo próprio do WhatsApp. A logo aparece no cabeçalho da mensagem inicial quando houver um link público HTTPS válido.</p>
  </main>;
}

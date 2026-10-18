import { useEffect, useState } from "react";
import { CheckCircle2, Send, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";

const defaults = {
  welcome_message:
    "Seja bem-vindo(a) ao escritório Suzanne Figueiredo — Advocacia e Soluções Jurídicas. A partir de agora, seu atendimento será acompanhado de forma organizada, segura e transparente.",
  team_message:
    "Dra. Suzanne é responsável pela condução jurídica. Dra. Gláucia acompanha o atendimento, o financeiro e a organização documental.",
  service_rules:
    "Atendimento em dias úteis. Mensagens são registradas e respondidas conforme a prioridade. Urgência é exclusivamente perigo iminente de morte ou risco à integridade física.",
  process_tracking:
    "As principais informações, documentos, recados, compromissos e etapas do caso ficam disponíveis no aplicativo do cliente.",
  next_steps:
    "Conferência dos dados e documentos; definição da estratégia; assinatura dos instrumentos aplicáveis; providência judicial ou extrajudicial; acompanhamento e comunicação das movimentações.",
  lawyer_name: "Dra. Suzanne Figueiredo",
  meeting_notes:
    "A primeira reunião poderá ser agendada no aplicativo, conforme os horários disponíveis na Agenda Google da LEX.",
};

export default function ClientOnboardingPanel({ client }: { client: any }) {
  const [row, setRow] = useState<any>(null);
  const [form, setForm] = useState<any>(defaults);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    if (!supabase || !client?.id) return;
    const { data } = await supabase
      .from("client_onboarding")
      .select("*")
      .eq("client_id", client.id)
      .maybeSingle();
    setRow(data || null);
    if (data?.content) setForm({ ...defaults, ...data.content });
  }
  useEffect(() => {
    void load();
  }, [client?.id]);

  async function save(send = false) {
    if (!supabase || !client?.id) return;
    setBusy(true);
    setNotice("");
    const { data: orgId } = await supabase.rpc("current_org_id");
    const payload = {
      org_id: orgId,
      client_id: client.id,
      status: send ? "sent" : row?.status || "draft",
      content: form,
      sent_at: send ? new Date().toISOString() : row?.sent_at || null,
      updated_at: new Date().toISOString(),
    };
    const result = row?.id
      ? await supabase
          .from("client_onboarding")
          .update(payload)
          .eq("id", row.id)
          .select()
          .single()
      : await supabase
          .from("client_onboarding")
          .insert(payload)
          .select()
          .single();
    if (result.error) {
      setBusy(false);
      setNotice("Não foi possível salvar: " + result.error.message);
      return;
    }
    setRow(result.data);
    if (!send) {
      setBusy(false);
      setNotice("Onboarding salvo como rascunho.");
      return;
    }
    const phone = String(client.whatsapp || client.phone || "").replace(
      /\D/g,
      "",
    );
    if (!phone) {
      setBusy(false);
      setNotice(
        "Onboarding iniciado, mas o cliente não possui WhatsApp cadastrado.",
      );
      return;
    }
    const url = "https://lexoffice.univittagroup.com.br/cliente";
    const message = `Olá, ${client.name}! ✨\n\nSeu onboarding com o escritório foi iniciado. Há uma nova mensagem de boas-vindas, apresentação da equipe, regras de atendimento e próximos passos no aplicativo.\n\nAcesse: ${url}\n\nApós a leitura, confirme “Li e estou ciente”.`;
    const { data, error } = await supabase.functions.invoke(
      "whatsapp-operator-send",
      {
        body: {
          message,
          targets: [
            {
              phone: phone.startsWith("55") ? phone : `55${phone}`,
              name: client.name,
            },
          ],
          agent_key: "client_schedule_relationship",
          keep_ai_active: true,
        },
      },
    );
    setBusy(false);
    if (error || !data?.ok) {
      let reason = data?.results?.find((r: any) => !r.ok)?.error || data?.error || "";
      if (!reason && error) {
        try {
          const body = await (error as any).context?.json?.();
          reason = body?.error || "";
        } catch {
          /* sem detalhe adicional */
        }
        reason = reason || (error as any).message || "";
      }
      setNotice(
        "Onboarding salvo, mas o WhatsApp não foi enviado" +
          (reason ? `. Motivo: ${reason}` : "."),
      );
      return;
    }
    setNotice("Onboarding iniciado e link enviado ao cliente.");
  }

  const fields: [string, string, number][] = [
    ["welcome_message", "Mensagem personalizada de boas-vindas", 3],
    ["team_message", "Apresentação do escritório e da equipe", 3],
    ["service_rules", "Horários e regras de atendimento", 3],
    ["process_tracking", "Como acompanhar o processo", 3],
    ["next_steps", "Próximos passos", 4],
    ["meeting_notes", "Primeira reunião", 2],
  ];
  return (
    <section className="integration-panel onboarding-panel">
      <div className="integration-head">
        <div>
          <span className="integration-pill">
            <Sparkles size={14} /> ONBOARDING
          </span>
          <h3>Entrada do cliente no escritório</h3>
          <p>
            Você inicia o processo. O cliente recebe o link, lê as orientações e
            confirma a ciência no aplicativo.
          </p>
        </div>
        <span className="status-dot">
          {row?.status === "acknowledged"
            ? "CONCLUÍDO"
            : row?.status === "sent"
              ? "ENVIADO"
              : row
                ? "RASCUNHO"
                : "NÃO INICIADO"}
        </span>
      </div>
      <div className="integration-form">
        <label>
          Advogada responsável
          <input
            value={form.lawyer_name}
            onChange={(e) => setForm({ ...form, lawyer_name: e.target.value })}
          />
        </label>
        {fields.map(([key, label, rows]) => (
          <label className="wide" key={key}>
            {label}
            <textarea
              rows={rows}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="signature-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => save(false)}
        >
          Salvar rascunho
        </button>
        <button className="primary" disabled={busy} onClick={() => save(true)}>
          <Send size={15} /> Iniciar onboarding
        </button>
        {row?.acknowledged_at && (
          <span>
            <CheckCircle2 size={15} /> Ciente em{" "}
            {new Date(row.acknowledged_at).toLocaleString("pt-BR")}
          </span>
        )}
      </div>
      {notice && <div className="integration-notice">{notice}</div>}
    </section>
  );
}

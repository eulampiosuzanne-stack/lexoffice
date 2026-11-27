import { useCallback, useEffect, useRef, useState } from "react";
import { FileSearch, Send, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { documentRequestDescription, documentRequestMessage, parseDocumentList } from "../lib/documentRequests";

type Request = { id: string; title: string; description?: string | null; status: string; created_at: string };
type Props = { orgId: string; processId: string; clientId?: string | null; clientName?: string | null; cnj?: string | null };

export default function ProcessDocumentRequests({ orgId, processId, clientId, clientName, cnj }: Props) {
  const [rows, setRows] = useState<Request[]>([]);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("client_document_requests")
      .select("id,title,description,status,created_at")
      .eq("process_id", processId)
      .neq("status", "available") // "available" é documento que o escritório entregou, não pedido
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) setNotice("Não foi possível carregar os pedidos: " + error.message);
    setRows((data as Request[]) || []);
  }, [processId]);
  useEffect(() => { void load(); }, [load]);

  async function send() {
    if (!supabase || !clientId || !orgId || lock.current) return;
    const titles = parseDocumentList(text, rows.filter((r) => r.status === "pending").map((r) => r.title));
    if (!titles.length) { setNotice("Escreva ao menos um documento que ainda não tenha sido pedido."); return; }
    if (!window.confirm(`Pedir a ${clientName || "este cliente"}:\n\n• ${titles.join("\n• ")}\n\nO aviso vai AGORA pelo aplicativo e pelo WhatsApp, e a Helena cobra se não for enviado.`)) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    const { data: u } = await supabase.auth.getUser();
    const description = documentRequestDescription(cnj || "", due, note);
    const { error } = await supabase.from("client_document_requests").insert(
      titles.map((title) => ({
        org_id: orgId, client_id: clientId, process_id: processId, title, description,
        status: "pending", requested_by: u?.user?.id || null,
        requires_authorization: false, authorization_status: "not_required", reminder_enabled: true,
      })),
    );
    if (error) setNotice("Não foi possível pedir: " + error.message);
    else {
      const warning = await notify(titles, u?.user?.id || "");
      setText(""); setNote(""); setDue("");
      setNotice(`${titles.length} documento(s) pedido(s). ${warning}`);
      await load();
    }
    lock.current = false;
    setBusy(false);
  }

  // Uma linha na fila envia o WhatsApp e o banco espelha no aplicativo (com notificação no celular).
  async function notify(titles: string[], userId: string): Promise<string> {
    if (!supabase || !clientId) return "";
    const { data: c } = await supabase.from("clients").select("name,whatsapp,phone").eq("id", clientId).maybeSingle();
    const phone = String(c?.whatsapp || c?.phone || "").replace(/\D/g, "");
    const message = documentRequestMessage(c?.name || clientName || "", titles, due, note);
    if (phone.length < 10) {
      const { error } = await supabase.from("client_office_messages").insert({
        org_id: orgId, client_id: clientId, title: "Documento solicitado", body: message,
        category: "documentos", priority: "normal", requires_ack: false, sent_by: userId,
        source_channel: "manual_app", metadata: { process_id: processId },
      });
      return error
        ? "O pedido ficou salvo, mas o aviso não foi criado: " + error.message
        : "Avisado só pelo aplicativo: o cliente está sem WhatsApp no cadastro.";
    }
    const { data, error } = await supabase.from("notification_queue").insert({
      org_id: orgId, owner_user_id: userId, client_id: clientId, process_id: processId,
      channel: "whatsapp", destination: phone, message, status: "pending",
      scheduled_at: new Date().toISOString(), send_to_client_app: true,
      payload: { source: "document_request", agent_key: "customer_success", category: "documentos", title: "Documento solicitado" },
    }).select("status").single();
    if (error) return "O pedido ficou salvo no aplicativo, mas o aviso não foi criado: " + error.message;
    return data?.status === "cancelled"
      ? "Atenção: o WhatsApp está bloqueado para este cliente. O pedido ficou no aplicativo."
      : "Aviso no aplicativo e WhatsApp na fila de envio.";
  }

  async function cancel(r: Request) {
    if (!supabase || busy || !window.confirm(`Cancelar o pedido "${r.title}"? Ele sai do aplicativo do cliente.`)) return;
    setBusy(true);
    const { data, error } = await supabase.from("client_document_requests").delete()
      .eq("id", r.id).eq("status", "pending").select("id");
    setNotice(error ? "Não foi possível cancelar: " + error.message : data?.length ? "Pedido cancelado." : "O pedido já mudou de situação; confira a lista.");
    await load();
    setBusy(false);
  }

  return (
    <section className="doc-library-card">
      <div className="doc-section-title">
        <span className="doc-section-icon"><FileSearch size={20} /></span>
        <div>
          <h2>Pedir documentos ao cliente</h2>
          <p>Use quando o juiz determinar a juntada. Avisa pelo aplicativo e WhatsApp, e a Helena cobra o envio (até 3 vezes).</p>
        </div>
      </div>
      {!clientId ? (
        <p>Vincule o cliente a este processo (no alto da página) para pedir documentos.</p>
      ) : (
        <>
          <label className="pa-block">
            <span>Documentos (um por linha)</span>
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Comprovante de residência atualizado\nExtratos bancários dos últimos 3 meses"} />
          </label>
          <label className="pa-block">
            <span>Recado para o cliente (opcional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: o juiz pediu para continuar o processo." />
          </label>
          <div className="pa-row">
            <label className="cp-inline"><span>Enviar até</span>
              <input className="cp-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
            <button type="button" className="doc-primary" disabled={busy || !text.trim()} onClick={() => void send()}>
              <Send size={16} /> Pedir ao cliente
            </button>
          </div>
        </>
      )}
      {notice && <p role="status"><b>{notice}</b></p>}
      <h3>Pedidos deste processo</h3>
      {rows.length === 0 && <p className="pa-muted">Nenhum documento pedido ainda.</p>}
      <ul className="cp-list">
        {rows.map((r) => (
          <li key={r.id}>
            <span>
              <b>{r.title}</b> · {r.status === "pending" ? "aguardando o cliente" : "recebido (confira na aba Documentos)"} · pedido em {new Date(r.created_at).toLocaleDateString("pt-BR")}
            </span>
            {r.status === "pending" && (
              <button type="button" className="doc-refresh" disabled={busy} onClick={() => void cancel(r)}>
                <Trash2 size={15} /> Cancelar
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

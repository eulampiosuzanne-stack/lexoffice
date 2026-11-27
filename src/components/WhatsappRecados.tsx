import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Recado = { id: string; contact_name?: string | null; phone?: string | null; is_client: boolean; body: string; created_at: string; read_at?: string | null };

/** Recados que a Helena anotou pelo WhatsApp (clientes ou não). */
export default function WhatsappRecados({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<Recado[]>([]);
  const [showRead, setShowRead] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !orgId) return;
    const { data, error: e } = await supabase
      .from("whatsapp_recados")
      .select("id,contact_name,phone,is_client,body,created_at,read_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    setError(e ? "Não foi possível carregar os recados do WhatsApp." : "");
    if (!e) setRows((data as Recado[]) || []);
  }, [orgId]);
  useEffect(() => {
    void load();
    const again = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", again);
    const timer = window.setInterval(again, 60000);
    return () => { document.removeEventListener("visibilitychange", again); window.clearInterval(timer); };
  }, [load]);

  async function markRead(id: string) {
    if (!supabase) return;
    const { error: e } = await supabase.from("whatsapp_recados").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (e) setError("Não foi possível marcar como lido.");
    else await load();
  }

  const unread = rows.filter((r) => !r.read_at);
  const list = showRead ? rows : unread;
  return (
    <div className="app-message-secondary client-area">
      <section className="panel">
        <div className="app-message-secondary-heading">
          <h2>Recados do WhatsApp {unread.length > 0 && `(${unread.length})`}</h2>
          {rows.length > unread.length && (
            <button type="button" className="app-message-button" onClick={() => setShowRead((v) => !v)}>
              {showRead ? "Só os novos" : "Ver os já lidos"}
            </button>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        {!error && list.length === 0 && <p>Nenhum recado novo.</p>}
        {list.map((r) => (
          <article key={r.id} className="integration-card">
            <p><b>{r.contact_name || r.phone || "Contato"}</b> · {r.is_client ? "cliente" : "não é cliente"} · {new Date(r.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.body}</p>
            <div className="app-message-actions">
              {!r.read_at && (
                <button type="button" className="app-message-button app-message-primary" onClick={() => void markRead(r.id)}>Marcar como lido</button>
              )}
              {r.phone && (
                <Link className="app-message-button" to={`/whatsapp?phone=${r.phone.replace(/\D/g, "")}`}>Abrir conversa</Link>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

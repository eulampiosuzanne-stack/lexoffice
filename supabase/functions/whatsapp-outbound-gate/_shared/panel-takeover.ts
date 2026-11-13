/** Only conversations explicitly managed from painel-sf opt into these rules. */
export const panelManaged = (conversation: any) => conversation?.chatbot_context?._painel_sf_takeover?.version === 1;

export async function panelTakeover(db: any, conversation: any, action: "timeout" | "keyword" = "timeout", keyword: string | null = null) {
  if (!panelManaged(conversation)) return { managed: false };
  const result = await db.rpc("painel_sf_conversation_control", {
    p_conversation_id: conversation.id, p_action: action, p_expected_updated_at: null, p_keyword: keyword,
  });
  if (result.error || !result.data || result.data.id !== conversation.id) throw new Error("panel_takeover_state_unavailable");
  return { managed: true, ...result.data };
}

export async function resumePanelTakeovers(db: any) {
  const { data, error } = await db.from("whatsapp_conversations").select("id,chatbot_context")
    .eq("chatbot_context->_painel_sf_takeover->>version", "1").neq("status", "closed")
    .or("chatbot_context->_painel_sf_takeover->>active.eq.true,conversation_owner.eq.HUMAN,bot_ativo.eq.false")
    .order("updated_at", { ascending: true }).limit(100);
  if (error) throw new Error("panel_takeover_scan_failed");
  let resumed = 0;
  for (const conversation of data || []) {
    try { const result = await panelTakeover(db, conversation); if (result.resumed) resumed++; }
    catch { console.error("panel_takeover_resume_failed", conversation.id); }
  }
  return resumed;
}

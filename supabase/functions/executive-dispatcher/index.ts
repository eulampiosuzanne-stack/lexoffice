import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const dayKey = () => new Date().toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method !== "POST")
    return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey)
    return json({ ok: false, error: "server_configuration" }, 500);
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const supplied = req.headers.get("x-dispatcher-token") || "";
  const { data: secretRow } = await db
    .from("system_runtime_secrets")
    .select("secret")
    .eq("key", "datajud_sync_token")
    .maybeSingle();
  if (!supplied || !secretRow?.secret || supplied !== secretRow.secret)
    return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const orgId = String(body.org_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(orgId))
    return json({ ok: false, error: "org_id_required" }, 400);
  const bucket = new Date(
    Math.floor(Date.now() / 300000) * 300000,
  ).toISOString();
  const idempotencyKey = `executive:${orgId}:${bucket}`;
  const { data: runId, error: claimError } = await db.rpc(
    "lexoffice_executive_dispatch",
    {
      p_org_id: orgId,
      p_idempotency_key: idempotencyKey,
    },
  );
  if (claimError || !runId)
    return json({ ok: false, error: "claim_failed" }, 500);
  const { data: claimed } = await db
    .from("executive_dispatch_runs")
    .select("status,started_at")
    .eq("id", runId)
    .single();
  if (claimed?.status !== "running")
    return json({
      ok: true,
      run_id: runId,
      status: claimed?.status || "duplicate",
      idempotent: true,
    });

  const recordAction = async (input: {
    type: string;
    title: string;
    description: string;
    risk: "safe" | "controlled" | "sensitive";
    status: "awaiting_approval" | "executed";
    payload?: Record<string, unknown>;
    result?: Record<string, unknown>;
  }) => {
    const key = `${input.type}:${orgId}:${dayKey()}`;
    const { data, error } = await db
      .from("executive_action_queue")
      .upsert(
        {
          org_id: orgId,
          source_run_id: runId,
          action_type: input.type,
          title: input.title,
          description: input.description,
          risk_level: input.risk,
          status: input.status,
          payload: input.payload || {},
          result: input.result || {},
          auto_authorized: input.status === "executed",
          requires_suzanne: input.status === "awaiting_approval",
          idempotency_key: key,
          executed_at:
            input.status === "executed" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,idempotency_key", ignoreDuplicates: true },
      )
      .select("id,action_type,status,risk_level,title")
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const executeApproved = async () => {
    const executed: any[] = [];
    const { data: approved } = await db
      .from("executive_action_queue")
      .select("id,action_type,payload")
      .eq("org_id", orgId)
      .eq("status", "approved")
      .order("approved_at", { ascending: true })
      .limit(20);
    for (const action of approved || []) {
      const { data: locked } = await db
        .from("executive_action_queue")
        .update({ status: "executing", updated_at: new Date().toISOString() })
        .eq("id", action.id)
        .eq("status", "approved")
        .select("id")
        .maybeSingle();
      if (!locked) continue;
      try {
        if (action.action_type === "enable_chatbot_flow") {
          const { error } = await db
            .from("whatsapp_chatbot_flow_config")
            .update({ enabled: true, updated_at: new Date().toISOString() })
            .eq("org_id", orgId);
          if (error) throw error;
        } else if (action.action_type === "review_unattended_conversations") {
          // A aprovação registra a decisão; mensagens continuam dependendo da revisão individual.
        } else {
          throw new Error("unsupported_action");
        }
        await db
          .from("executive_action_queue")
          .update({
            status: "executed",
            result: { ok: true, executed_by: "executive_dispatcher" },
            executed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            error: null,
          })
          .eq("id", action.id);
        executed.push({
          id: action.id,
          type: action.action_type,
          status: "executed",
        });
      } catch (error) {
        await db
          .from("executive_action_queue")
          .update({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            updated_at: new Date().toISOString(),
          })
          .eq("id", action.id);
      }
    }
    return executed;
  };

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await db
        .from("executive_dispatch_runs")
        .update({ attempt })
        .eq("id", runId);
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const approvedActions = await executeApproved();
      const [
        connections,
        agents,
        conversations,
        failedMessages,
        failedJobs,
        overdueCollections,
        pendingReviews,
        flow,
      ] = await Promise.all([
        db
          .from("whatsapp_connections")
          .select(
            "id,display_name,status,external_instance_id,is_active,last_error",
          )
          .eq("org_id", orgId)
          .eq("is_active", true),
        db
          .from("ai_agent_policies")
          .select("agent_key,display_name,active")
          .eq("org_id", orgId),
        db
          .from("whatsapp_conversations")
          .select(
            "id,status,unread_count,last_message_at,conversation_owner,bot_ativo",
          )
          .eq("org_id", orgId)
          .neq("status", "closed")
          .limit(1000),
        db
          .from("whatsapp_messages")
          .select("id")
          .eq("org_id", orgId)
          .eq("status", "failed")
          .gte("created_at", oneHourAgo)
          .limit(500),
        db
          .from("ai_agent_jobs")
          .select("id")
          .eq("org_id", orgId)
          .eq("status", "failed")
          .gte("created_at", oneHourAgo)
          .limit(500),
        db
          .from("collection_schedule")
          .select("id")
          .eq("org_id", orgId)
          .eq("status", "pending")
          .lt("scheduled_at", new Date().toISOString())
          .limit(500),
        db
          .from("human_review_queue")
          .select("id")
          .eq("org_id", orgId)
          .in("status", ["pending", "open"])
          .limit(500),
        db
          .from("whatsapp_chatbot_flow_config")
          .select("enabled,version")
          .eq("org_id", orgId)
          .maybeSingle(),
      ]);
      const alerts: any[] = [];
      const actions: any[] = [...approvedActions];
      const conversationsData = conversations.data || [];
      const humanBotConflicts = conversationsData.filter(
        (c: any) => c.conversation_owner === "HUMAN" && c.bot_ativo === true,
      );
      const unattended = conversationsData.filter(
        (c: any) =>
          Number(c.unread_count) > 0 &&
          c.last_message_at &&
          c.last_message_at < tenMinutesAgo,
      );
      const glaucia = (connections.data || []).find(
        (c: any) => c.external_instance_id === "glaucia",
      );

      if (humanBotConflicts.length) {
        const ids = humanBotConflicts.map((c: any) => c.id);
        const { error } = await db
          .from("whatsapp_conversations")
          .update({ bot_ativo: false, updated_at: new Date().toISOString() })
          .in("id", ids)
          .eq("org_id", orgId);
        if (error) throw error;
        const action = await recordAction({
          type: "enforce_human_takeover",
          title: "Silêncio da IA aplicado",
          description:
            "Conflitos entre atendimento humano e chatbot foram interrompidos automaticamente.",
          risk: "safe",
          status: "executed",
          payload: { conversation_ids: ids },
          result: { conversations_updated: ids.length },
        });
        if (action) actions.push(action);
      }
      if (unattended.length) {
        alerts.push({
          type: "unattended_conversations",
          severity: "attention",
          count: unattended.length,
        });
        const action = await recordAction({
          type: "review_unattended_conversations",
          title: "Revisar conversas aguardando",
          description:
            "A análise ou o envio em massa depende de aprovação de Suzanne.",
          risk: "controlled",
          status: "awaiting_approval",
          payload: { count: unattended.length },
        });
        if (action) actions.push(action);
      }
      if (flow.data?.enabled !== true) {
        alerts.push({ type: "chatbot_flow_disabled", severity: "attention" });
        const action = await recordAction({
          type: "enable_chatbot_flow",
          title: "Ativar fluxo do chatbot",
          description:
            "A ativação afeta o atendimento aos clientes e exige aprovação de Suzanne.",
          risk: "sensitive",
          status: "awaiting_approval",
          payload: { current_version: flow.data?.version ?? null },
        });
        if (action) actions.push(action);
      }
      for (const connection of connections.data || [])
        if (connection.status !== "connected")
          alerts.push({
            type: "whatsapp_disconnected",
            severity: "failure",
            name: connection.display_name,
          });
      if (!glaucia || glaucia.status !== "connected")
        alerts.push({ type: "glaucia_disconnected", severity: "failure" });
      if (humanBotConflicts.length)
        alerts.push({
          type: "human_bot_conflict",
          severity: "failure",
          count: humanBotConflicts.length,
          corrected: true,
        });
      if ((failedMessages.data || []).length)
        alerts.push({
          type: "failed_messages",
          severity: "failure",
          count: failedMessages.data!.length,
        });
      if ((failedJobs.data || []).length)
        alerts.push({
          type: "failed_agent_jobs",
          severity: "failure",
          count: failedJobs.data!.length,
        });
      if ((overdueCollections.data || []).length)
        alerts.push({
          type: "overdue_collections",
          severity: "attention",
          count: overdueCollections.data!.length,
        });
      if ((pendingReviews.data || []).length)
        alerts.push({
          type: "human_review_pending",
          severity: "attention",
          count: pendingReviews.data!.length,
        });

      const checks = {
        checked_at: new Date().toISOString(),
        whatsapp_connections: (connections.data || []).length,
        glaucia_connected: Boolean(glaucia && glaucia.status === "connected"),
        agents_active: (agents.data || []).filter((a: any) => a.active).length,
        open_conversations: conversationsData.length,
        unattended: unattended.length,
        human_bot_conflicts: humanBotConflicts.length,
        failed_messages: (failedMessages.data || []).length,
        failed_agent_jobs: (failedJobs.data || []).length,
        overdue_collections: (overdueCollections.data || []).length,
        pending_human_reviews: (pendingReviews.data || []).length,
        chatbot_enabled: flow.data?.enabled ?? null,
        chatbot_version: flow.data?.version ?? null,
      };
      const { error: updateError } = await db
        .from("executive_dispatch_runs")
        .update({
          status: alerts.some((a) => a.severity === "failure" && !a.corrected)
            ? "attention"
            : "completed",
          finished_at: new Date().toISOString(),
          checks,
          actions,
          alerts,
          error: null,
        })
        .eq("id", runId);
      if (updateError) throw updateError;
      return json({
        ok: true,
        run_id: runId,
        status: "completed",
        checks,
        alerts,
        actions,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < 3) await sleep(attempt * 750);
    }
  }
  await db
    .from("executive_dispatch_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: lastError || "dispatcher_failed",
      attempt: 3,
    })
    .eq("id", runId);
  return json({ ok: false, run_id: runId, error: "dispatcher_failed" }, 500);
});

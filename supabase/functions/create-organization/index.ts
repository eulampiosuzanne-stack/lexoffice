import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Payload = { name: string; org_name: string; email: string; password: string };

const allowedOrigins = new Set([
  "https://lexoffice-ashy.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = allowedOrigins.has(origin) ? origin : "https://lexoffice-ashy.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin") || "";
    if (origin && !allowedOrigins.has(origin)) return new Response("Origin not allowed", { status: 403 });
    return new Response("ok", { status: 200, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigins.has(origin)) return jsonResponse(req, { error: "Origin not allowed" }, 403);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse(req, { error: "Configuração do Supabase ausente." }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return jsonResponse(req, { error: "Não autenticado." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const token = authHeader.slice("Bearer ".length).trim();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const caller = authData?.user;
    if (authError || !caller) return jsonResponse(req, { error: "Sessão inválida." }, 401);

    const { data: callerProfile, error: callerProfileError } = await admin
      .from("profiles")
      .select("id,org_id,role_key,status")
      .eq("id", caller.id)
      .maybeSingle();

    if (callerProfileError || !callerProfile || callerProfile.status !== "active") {
      return jsonResponse(req, { error: "Usuário sem perfil ativo." }, 403);
    }
    if (!["owner", "admin"].includes(String(callerProfile.role_key || "").toLowerCase())) {
      return jsonResponse(req, { error: "Sem permissão para criar organização." }, 403);
    }

    const { name, org_name, email, password } = (await req.json()) as Payload;
    if (!name || !org_name || !email || !password) return jsonResponse(req, { error: "Campos obrigatórios ausentes." }, 400);
    if (password.length < 8) return jsonResponse(req, { error: "A senha deve ter pelo menos 8 caracteres." }, 400);

    const normalizedEmail = email.trim().toLowerCase();
    const baseSlug = slugify(org_name) || "escritorio";

    const { data: existingProfile } = await admin.from("profiles").select("id").eq("email", normalizedEmail).maybeSingle();
    if (existingProfile) return jsonResponse(req, { error: "Já existe um usuário com este e-mail." }, 409);

    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { name: name.trim() },
    });
    if (userError || !userData.user) return jsonResponse(req, { error: userError?.message ?? "Falha ao criar usuário." }, 400);

    const userId = userData.user.id;
    const uniqueSlug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: org_name.trim(), slug: uniqueSlug, plan: "starter", status: "active", settings: {} })
      .select("id")
      .single();

    if (orgError || !org) {
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse(req, { error: orgError?.message ?? "Falha ao criar organização." }, 400);
    }

    const { data: role, error: roleError } = await admin
      .from("roles")
      .insert({ org_id: org.id, key: "owner", name: "Proprietário", is_system: true })
      .select("id")
      .single();

    if (roleError || !role) {
      await admin.from("organizations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse(req, { error: roleError?.message ?? "Falha ao criar cargo." }, 400);
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      org_id: org.id,
      role_id: role.id,
      role_key: "owner",
      name: name.trim(),
      email: normalizedEmail,
      status: "active",
    });

    if (profileError) {
      await admin.from("roles").delete().eq("id", role.id);
      await admin.from("organizations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse(req, { error: profileError.message }, 400);
    }

    await admin.from("audit_logs").insert({
      org_id: callerProfile.org_id,
      user_id: caller.id,
      action: "organization.create",
      entity_type: "organization",
      entity_id: org.id,
      metadata: { created_org_id: org.id, created_user_id: userId, created_email: normalizedEmail },
    }).catch(() => undefined);

    return jsonResponse(req, { ok: true, user_id: userId, org_id: org.id }, 201);
  } catch (error) {
    console.error("create-organization", error);
    return jsonResponse(req, { error: "Erro interno." }, 500);
  }
});

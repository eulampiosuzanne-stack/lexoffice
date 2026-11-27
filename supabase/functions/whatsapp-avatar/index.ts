// Foto do perfil do WhatsApp para a Caixa de Entrada (somente leitura na Uazapi; não envia mensagem).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "method" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = jwt ? (await db.auth.getUser(jwt)).data.user : null;
  if (!user) return out({ error: "unauthorized" }, 401);
  const me = (await db.from("profiles").select("org_id,status").eq("id", user.id).maybeSingle()).data;
  if (!me || me.status !== "active") return out({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x: unknown) => typeof x === "string").slice(0, 30);
  if (!ids.length) return out({ photos: {} });
  const { data: contacts, error } = await db.from("whatsapp_contacts").select("id,phone").eq("org_id", me.org_id).in("id", ids);
  if (error) return out({ error: "contacts" }, 500);
  const secret = async (k: string) => String((await db.from("system_runtime_secrets").select("secret").eq("key", k).maybeSingle()).data?.secret || "").trim();
  const base = (await secret("uazapi_base_url")).replace(/\/+$/, ""), token = await secret("uazapi_instance_token");
  if (!/^https:\/\//.test(base) || !token) return out({ error: "uazapi" }, 503);
  const photos: Record<string, string> = {};
  let failed = 0;
  const queue = [...(contacts || [])];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const number = String(c.phone || "").replace(/\D/g, "");
      if (!number) continue;
      try {
        const r = await fetch(base + "/chat/details", { method: "POST", headers: { token, "Content-Type": "application/json" }, body: JSON.stringify({ number, preview: true }), signal: AbortSignal.timeout(15000) });
        if (!r.ok) { failed++; continue; }
        const d = await r.json();
        const url = String(d?.imagePreview || d?.image || "");
        if (!/^https:\/\//.test(url)) continue;
        photos[c.id] = url;
        await db.from("whatsapp_contacts").update({ profile_picture_url: url }).eq("id", c.id).eq("org_id", me.org_id);
      } catch { failed++; }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out({ photos, failed });
});

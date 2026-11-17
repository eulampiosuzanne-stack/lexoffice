import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://lexoffice-ashy.vercel.app",
  "https://lex.suzannefigueiredoadvocacia.com.br",
  "https://lexoffice-app.vercel.app",
  "https://lexoffice.univittagroup.com.br",
  "http://localhost:5173",
  "http://localhost:4173",
]);
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://lexoffice-ashy.vercel.app",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}
function admin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || key; } catch {}
  return createClient(url, key, { auth: { persistSession: false } });
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
const text = (v: unknown, max = 255) => String(v ?? "").trim().slice(0, max);
const nullable = (v: unknown, max = 255) => { const s = text(v, max); return s || null; };
const marital = new Set(["single", "married", "divorced", "widowed", "separated"]);
const dateOk = (v: unknown) => { const s = text(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

const evidenceBucket = "lexoffice-documents";
const maxEvidenceBytes = 20 * 1024 * 1024;
const evidenceMime: Record<string, string> = {
  png: "image/png", pdf: "application/pdf", mp3: "audio/mpeg", m4a: "audio/mp4",
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav",
  webm: "audio/webm", aac: "audio/aac", flac: "audio/flac",
};

Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método inválido." }), { status: 405, headers });
  try {
    const multipart = req.headers.get("content-type")?.startsWith("multipart/form-data");
    const limit = multipart ? maxEvidenceBytes + 512 * 1024 : 256 * 1024;
    const reader = req.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > limit) {
          await reader.cancel();
          return new Response(JSON.stringify({ error: "O envio excede o limite de tamanho." }), { status: 413, headers });
        }
        chunks.push(value);
      }
    }
    const buffered = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffered.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const input = new Response(buffered, { headers: req.headers });
    const form = multipart ? await input.formData() : null;
    const body = form ? JSON.parse(String(form.get("submission") || "{}")) : await input.json().catch(() => ({}));
    const action = text(body?.action, 20);
    const rawToken = text(body?.token, 200);
    if (!rawToken) return new Response(JSON.stringify({ error: "Link inválido." }), { status: 400, headers });
    const hash = await sha256(rawToken);
    const db = admin();
    const { data: link, error: linkError } = await db.from("client_intake_links")
      .select("id,org_id,owner_user_id,expires_at,used_at,revoked_at,client_id")
      .eq("token_hash", hash).maybeSingle();
    if (linkError || !link || link.revoked_at || link.used_at || new Date(link.expires_at).getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: "Este link é inválido, já foi utilizado ou expirou." }), { status: 410, headers });
    }
    if (action === "validate") {
      const { data: org } = await db.from("organization_settings").select("organization_name,trade_name").eq("org_id", link.org_id).maybeSingle();
      return new Response(JSON.stringify({ ok: true, expires_at: link.expires_at, organization_name: org?.trade_name || org?.organization_name || "LEXOFFICE" }), { headers });
    }
    if (action !== "submit") return new Response(JSON.stringify({ error: "Ação inválida." }), { status: 400, headers });

    const data = body?.data || {};
    const name = text(data.name, 180);
    if (name.length < 2) return new Response(JSON.stringify({ error: "Informe o nome completo." }), { status: 400, headers });
    const email = nullable(data.email, 254)?.toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return new Response(JSON.stringify({ error: "Informe um e-mail válido." }), { status: 400, headers });
    const maritalStatus = marital.has(text(data.marital_status, 30)) ? text(data.marital_status, 30) : null;
    const addressInput = data.address && typeof data.address === "object" ? data.address : {};
    const address = {
      zip: nullable(addressInput.zip, 12), street: nullable(addressInput.street, 180), number: nullable(addressInput.number, 30),
      complement: nullable(addressInput.complement, 120), neighborhood: nullable(addressInput.neighborhood, 120), city: nullable(addressInput.city, 120), state: nullable(addressInput.state, 2)?.toUpperCase() || null,
    };

    const payload = {
      org_id: link.org_id, owner_user_id: link.owner_user_id, name,
      cpf_cnpj: nullable(data.cpf_cnpj, 30), rg: nullable(data.rg, 40), birth_date: dateOk(data.birth_date),
      gender: nullable(data.gender, 40), mother_name: nullable(data.mother_name, 180), marital_status: maritalStatus,
      profession: nullable(data.profession, 120), phone: nullable(data.phone, 40), whatsapp: nullable(data.whatsapp, 40),
      email, status: "active", notes: nullable(data.notes, 12000), address,
    };
    const attachments = form?.getAll("evidence") ?? [];
    if (attachments.length > 8 || attachments.some(file => !(file instanceof File) || !file.size) ||
        attachments.reduce((total, file) => total + (file instanceof File ? file.size : 0), 0) > maxEvidenceBytes) {
      return new Response(JSON.stringify({ error: "Envie até 8 arquivos, somando no máximo 20 MB." }), { status: 400, headers });
    }
    const evidence = [];
    for (const file of attachments as File[]) {
      const extension = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || "";
      const mime = Object.hasOwn(evidenceMime, extension) ? evidenceMime[extension] : null;
      if (!mime || (file.type && file.type !== "application/octet-stream" && file.type !== mime &&
          !(mime.startsWith("audio/") && (file.type.startsWith("audio/") || file.type === "video/webm")))) {
        return new Response(JSON.stringify({ error: "Envie imagens PNG, PDFs ou arquivos de áudio." }), { status: 400, headers });
      }
      evidence.push({
        file,
        row: { name: text(file.name, 220), file_path: `${link.org_id}/documents/${crypto.randomUUID()}.${extension}`, mime_type: mime, size_bytes: file.size },
      });
    }
    const uploaded: string[] = [];
    const storage = db.storage.from(evidenceBucket);
    for (const { file, row } of evidence) {
      const { error } = await storage.upload(row.file_path, file, { contentType: row.mime_type, upsert: false });
      if (error) {
        if (uploaded.length) await storage.remove(uploaded);
        return new Response(JSON.stringify({ error: "Não foi possível anexar as provas. Tente novamente." }), { status: 500, headers });
      }
      uploaded.push(row.file_path);
    }
    const { error: writeError } = await db.rpc("save_client_intake_submission", {
      p_link_id: link.id, p_data: payload, p_files: evidence.map(({ row }) => row),
    });
    if (writeError) {
      // A transport failure can leave the commit outcome unknown. Preserve files in that case.
      if (uploaded.length && writeError.code && !writeError.code.startsWith("PGRST")) await storage.remove(uploaded);
      const expired = writeError.message === "intake_link_unavailable";
      return new Response(JSON.stringify({ error: expired
        ? "Este formulário já foi enviado ou expirou."
        : "Não foi possível confirmar o envio do cadastro." }), { status: expired ? 409 : 500, headers });
    }
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (e) {
    console.error("client-intake-public", e);
    return new Response(JSON.stringify({ error: "Não foi possível processar o formulário." }), { status: 500, headers });
  }
});

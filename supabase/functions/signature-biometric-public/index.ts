import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { MIN_FACE_ATTEMPTS_FOR_REVIEW, nextAttempts, reviewAllowed, cleanKind, decideSubmit, livenessReportText } from "./_shared/review-policy.mjs";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const FACE_LIMIT = 0.55;
async function sha256Hex(data: Uint8Array | string) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function b64ToBytes(s: string) {
  const raw = String(s || "").replace(/^data:[^;]+;base64,/, "");
  const bin = atob(raw); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const fmtDoc = (v: unknown) => { const d = digits(v); if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"); if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5"); return String(v ?? ""); };
const maskPhone = (p: string) => { const d = digits(p).replace(/^55/, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) *****-${d.slice(-4)}` : "—"; };
const brDate = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(d);
function db() { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }); }

// ---------- Carimbo do tempo (RFC 3161, FreeTSA - gratuito, sem ICP-Brasil) ----------
const TSA_URL = "https://freetsa.org/tsr";
const TSA_NAME = "FreeTSA (freetsa.org) – padrão RFC 3161";
const VERIFY_HOST = "lexoffice-ashy.vercel.app";

// Verificação pública pelo código impresso no documento (sem login).
async function verifyPublic(body: any) {
  const raw = String(body.code || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  if (raw.length !== 10) return J({ ok: false, found: false, error: "Código inválido. Ele tem 10 caracteres, como ABCDE-12345." }, 400);
  const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
  const a = db();
  const { data: r } = await a.from("lex_signature_requests").select("id,status,title,signer_name,signer_cpf,signed_at,signed_sha256,source_sha256,evidence").eq("verification_code", code).eq("status", "signed").maybeSingle();
  if (!r) return J({ ok: true, found: false });
  const ev = r.evidence || {};
  const cpf = fmtDoc(r.signer_cpf);
  return J({
    ok: true, found: true, code, title: r.title, signer_name: r.signer_name,
    signer_cpf_masked: cpf ? cpf.replace(/^\d{3}\.\d{3}/, "***.***") : null,
    signed_at: r.signed_at, signed_sha256: r.signed_sha256, source_sha256: r.source_sha256,
    method: "Assinatura eletrônica avançada (Lei 14.063/2020, art. 4º, II) com código por WhatsApp, prova de vida e reconhecimento facial",
    manual_review: Boolean(ev.manual_review),
    timestamp: ev.timestamp_pdf ? { provider: ev.timestamp_pdf.provider, gen_time: ev.timestamp_pdf.gen_time } : (ev.timestamp ? { provider: ev.timestamp.provider, gen_time: ev.timestamp.gen_time } : null),
  });
}
function hexToBytes(h: string) { const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
function tsQuery(sha256hex: string) {
  const nonce = crypto.getRandomValues(new Uint8Array(8)); nonce[0] = (nonce[0] & 0x7f) | 0x01;
  const head = [0x30, 0x43, 0x02, 0x01, 0x01, 0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];
  return new Uint8Array([...head, ...hexToBytes(sha256hex), 0x02, 0x08, ...nonce, 0x01, 0x01, 0xff]);
}
function tsParse(b: Uint8Array): { ok: boolean; genTime: Date | null } {
  if (b.length < 10 || b[0] !== 0x30) return { ok: false, genTime: null };
  const off = b[1] & 0x80 ? 2 + (b[1] & 0x7f) : 2;
  if (b[off] !== 0x30 || b[off + 2] !== 0x02 || b[off + 3] !== 0x01) return { ok: false, genTime: null };
  const status = b[off + 4];
  if (status !== 0 && status !== 1) return { ok: false, genTime: null };
  for (let i = off; i < b.length - 17; i++) {
    if (b[i] !== 0x18) continue;
    const L = b[i + 1]; if (L < 15 || L > 24) continue;
    const s = new TextDecoder().decode(b.slice(i + 2, i + 2 + L));
    const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/);
    if (m) return { ok: true, genTime: new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ""}Z`) };
  }
  return { ok: true, genTime: null };
}
// Pede o carimbo; se o serviço estiver fora, devolve null e a assinatura segue normalmente.
async function stampHash(sha256hex: string): Promise<{ token: Uint8Array; genTime: Date | null } | null> {
  try {
    const r = await fetch(TSA_URL, { method: "POST", headers: { "Content-Type": "application/timestamp-query" }, body: tsQuery(sha256hex), signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const token = new Uint8Array(await r.arrayBuffer());
    const p = tsParse(token);
    return p.ok ? { token, genTime: p.genTime } : null;
  } catch (e) { console.error("tsa", e); return null; }
}
async function storeStamp(a: any, path: string, st: { token: Uint8Array; genTime: Date | null }, digest: string) {
  const up = await a.storage.from("lexoffice-documents").upload(path, new Blob([st.token], { type: "application/timestamp-reply" }), { contentType: "application/timestamp-reply", upsert: true });
  if (up.error) { console.error("tsa-upload", up.error); return null; }
  return { provider: TSA_NAME, gen_time: st.genTime ? st.genTime.toISOString() : null, sha256: digest, token_path: path };
}

// v29 (30/10/2026): mensagens da assinatura são transacionais (pedidas pelo escritório ou pelo cliente):
// não podem ser barradas pela chave geral da IA desligada. Por isso seguem como envio do escritório.
async function sendWhatsApp(orgId: string, phone: string, message: string, key: string) {
  const u = Deno.env.get("SUPABASE_URL")!, sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${u}/functions/v1/whatsapp-outbound-gate`, { method: "POST", headers: { Authorization: `Bearer ${sk}`, apikey: sk, "Content-Type": "application/json" }, body: JSON.stringify({ org_id: orgId, conversation_id: null, phone, agent_key: "system", idempotency_key: key, message, format_agent_reply: false, operator_send: true }) });
  const d = await r.json().catch(() => ({}));
  return r.ok && d?.allowed !== false && !d?.error;
}

// Cartilha (guia rápido com desenhos) enviada logo depois do link + código, só em "create"/"resend".
// Mesmo canal de WhatsApp (whatsapp-outbound-gate, que aceita image+caption). Falha aqui NUNCA trava a assinatura:
// link e código já foram enviados; a falha é só registrada. Não é usada nos lembretes automáticos.
const GUIDE_URL = "https://lexoffice-ashy.vercel.app/cartilhas/assinatura-biometrica.png";
const GUIDE_CAPTION = "Guia rápido para assinar pelo celular";
async function sendGuide(orgId: string, phone: string, key: string) {
  try {
    // Só envia se a cartilha já estiver publicada (o site devolve index.html para caminhos que não existem).
    const head = await fetch(GUIDE_URL, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    if (!head.ok || !/image\/png/i.test(head.headers.get("content-type") || "")) { console.error("signature guide skipped: image not published", head.status); return false; }
    const u = Deno.env.get("SUPABASE_URL")!, sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(`${u}/functions/v1/whatsapp-outbound-gate`, { method: "POST", headers: { Authorization: `Bearer ${sk}`, apikey: sk, "Content-Type": "application/json" }, body: JSON.stringify({ org_id: orgId, conversation_id: null, phone, agent_key: "system", idempotency_key: key, message: GUIDE_CAPTION, image: GUIDE_URL, caption: GUIDE_CAPTION, format_agent_reply: false, operator_send: true }), signal: AbortSignal.timeout(20000) });
    const d = await r.json().catch(() => ({}));
    const sent = r.ok && d?.allowed !== false && !d?.error;
    if (!sent) console.error("signature guide not sent", r.status, String(d?.error || d?.reason || "").slice(0, 200));
    return sent;
  } catch (e) { console.error("signature guide failed", e instanceof Error ? e.message : e); return false; }
}

// v26 (13/10/2026) — pedido da Dra. Suzanne: envio do link e lembretes de assinatura também aparecem no aplicativo do cliente.
// Um aviso por link (source = principal do lote); cada reenvio/lembrete atualiza o mesmo aviso com o link novo e dispara push de novo.
// Só publica se o cliente tiver o app ativo (regra dentro de lexoffice_client_app_publish). Falha aqui nunca impede o WhatsApp.
async function appNotify(a: any, row: any, title: string, body: string, kind: string) {
  try {
    if (!row?.client_id) return null;
    const { data: id, error } = await a.rpc("lexoffice_client_app_publish", { p_org: row.org_id, p_client: row.client_id, p_title: title, p_body: body, p_category: "documentos", p_priority: "high", p_requires_ack: false, p_source_table: "lex_signature_requests", p_source_id: row.id, p_metadata: { kind, signature_request_id: row.id } });
    if (error) { console.error("app-notify", error.message); return null; }
    if (id) await a.from("client_office_messages").update({ push_status: "pending", push_attempts: 0, push_error: null, sent_at: new Date().toISOString() }).eq("id", id);
    return id || null;
  } catch (e) { console.error("app-notify", e instanceof Error ? e.message : e); return null; }
}
function appBody(members: any[], link: string, reminder: boolean) {
  const docs = members.length > 1 ? `${members.length} documentos aguardam a sua assinatura:\n${members.slice(0, 15).map((m: any) => "• " + m.title).join("\n")}` : `O documento "${members[0]?.title || "enviado pelo escritório"}" aguarda a sua assinatura.`;
  return `${reminder ? "Lembrete: " : ""}${docs}\n\nToque no link para assinar pelo celular com biometria facial (código, foto do RG ou CNH e selfie; leva poucos minutos):\n${link}\n\nO link é pessoal. Se já assinou, desconsidere este aviso.`;
}

let fontCache: any = null;
async function fonts(a: any) {
  if (fontCache) return fontCache;
  try {
    const out: any = {};
    for (const [k, f] of Object.entries({ r: "Tinos-Regular.ttf", b: "Tinos-Bold.ttf", i: "Tinos-Italic.ttf" })) {
      const { data } = await a.storage.from("lexoffice-documents").download(`_system/fonts/${f}`);
      if (!data) return null;
      out[k] = new Uint8Array(await data.arrayBuffer());
    }
    fontCache = out; return out;
  } catch { return null; }
}

async function buildSigned(a: any, row: any, original: Uint8Array, ev: any, selfie: Uint8Array, idPhoto: Uint8Array) {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const fb = await fonts(a);
  let R: any, B: any, I: any;
  if (fb) { pdf.registerFontkit(fontkit); R = await pdf.embedFont(fb.r, { subset: true }); B = await pdf.embedFont(fb.b, { subset: true }); I = await pdf.embedFont(fb.i, { subset: true }); }
  else { R = await pdf.embedFont(StandardFonts.Helvetica); B = await pdf.embedFont(StandardFonts.HelveticaBold); I = await pdf.embedFont(StandardFonts.HelveticaOblique); }
  const ink = rgb(0.1, 0.1, 0.1), brand = rgb(0.43, 0.1, 0.19), gold = rgb(0.72, 0.54, 0.22), muted = rgb(0.38, 0.38, 0.4), ok = rgb(0.1, 0.45, 0.2), warn = rgb(0.6, 0.38, 0.05);
  const signedAt = new Date(ev.signed_at);
  const when = brDate(signedAt);
  const stamp = `Assinado eletronicamente por ${row.signer_name} (CPF ${fmtDoc(row.signer_cpf)}) em ${when} • Código de verificação ${row.verification_code} • Verifique em ${VERIFY_HOST}/verificar • Certificado na última página`;
  for (const p of pdf.getPages()) {
    const { width } = p.getSize();
    let size = 6.6; while (R.widthOfTextAtSize(stamp, size) > width - 40 && size > 4.5) size -= 0.2;
    p.drawText(stamp, { x: (width - R.widthOfTextAtSize(stamp, size)) / 2, y: 10, size, font: R, color: brand });
  }
  const page = pdf.addPage([595.28, 841.89]);
  const W = 595.28, ML = 56, CW = W - ML * 2;
  let y = 790;
  page.drawText("SUZANNE FIGUEIREDO", { x: ML, y, size: 13, font: B, color: brand });
  page.drawText("ADVOCACIA E SOLUÇÕES JURÍDICAS", { x: ML, y: y - 14, size: 8, font: R, color: muted });
  page.drawLine({ start: { x: ML, y: y - 26 }, end: { x: W - ML, y: y - 26 }, thickness: 0.8, color: gold });
  // QR code de verificação pública (canto superior direito).
  try {
    const mod: any = await import("https://esm.sh/qrcode-generator@1.4.4");
    const qrcode = mod.default || mod;
    const qr = qrcode(0, "M");
    qr.addData(`${APP}/verificar/${encodeURIComponent(row.verification_code)}`);
    qr.make();
    const n = qr.getModuleCount(), size = 74, cell = size / n, qx = W - ML - size, qy = y + 30;
    page.drawRectangle({ x: qx - 3, y: qy - size - 3, width: size + 6, height: size + 6, color: rgb(1, 1, 1) });
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) page.drawRectangle({ x: qx + c * cell, y: qy - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: ink });
    const cap = "Verifique a autenticidade";
    page.drawText(cap, { x: qx + (size - R.widthOfTextAtSize(cap, 6.5)) / 2, y: qy - size - 11, size: 6.5, font: R, color: muted });
  } catch (e) { console.error("qr", e); }
  y -= 54;
  const title = "CERTIFICADO DE ASSINATURA ELETRÔNICA";
  page.drawText(title, { x: (W - B.widthOfTextAtSize(title, 14)) / 2, y, size: 14, font: B, color: ink });
  y -= 16;
  const sub = "Assinatura eletrônica avançada com validação biométrica – Lei nº 14.063/2020";
  page.drawText(sub, { x: (W - I.widthOfTextAtSize(sub, 9)) / 2, y, size: 9, font: I, color: muted });
  y -= 22;
  const wrap = (t: string, f: any, s: number, w: number) => { const ws = t.split(/\s+/); const ls: string[] = []; let l = ""; for (const x of ws) { const tt = l ? l + " " + x : x; if (f.widthOfTextAtSize(tt, s) > w && l) { ls.push(l); l = x; } else l = tt; } if (l) ls.push(l); return ls; };
  const section = (h: string) => { y -= 4; page.drawText(h.toUpperCase(), { x: ML, y, size: 9, font: B, color: brand }); y -= 5; page.drawLine({ start: { x: ML, y }, end: { x: W - ML, y }, thickness: 0.4, color: gold }); y -= 12; };
  const rowKV = (k: string, v: string, color = ink) => { const lines = wrap(v, R, 8.6, CW - 140); page.drawText(k, { x: ML, y, size: 8.6, font: B, color: muted }); lines.forEach((ln, i) => page.drawText(ln, { x: ML + 140, y: y - i * 11, size: 8.6, font: R, color })); y -= Math.max(1, lines.length) * 11 + 3; };

  section("Documento");
  rowKV("Título", row.title);
  rowKV("Páginas", String(pdf.getPageCount() - 1));
  rowKV("SHA-256 do original", row.source_sha256);
  rowKV("ID da transação", row.id);
  rowKV("Código de verificação", row.verification_code);
  section("Signatário");
  rowKV("Nome", row.signer_name || "—");
  rowKV("CPF", fmtDoc(row.signer_cpf) || "—");
  rowKV("WhatsApp", maskPhone(row.signer_phone));
  section("Autenticação");
  rowKV("Link pessoal", "Enviado exclusivamente ao WhatsApp cadastrado do signatário");
  // Horário em que o código foi validado nesta assinatura (no lote, só o principal guarda; por isso vem da evidência).
  const otpAt = ev.otp_verified_at ? new Date(ev.otp_verified_at) : null;
  rowKV("Código por WhatsApp", otpAt && !isNaN(otpAt.getTime()) ? `Validado em ${brDate(otpAt)}` : "Validado antes da assinatura");
  rowKV("Prova de vida", livenessReportText(ev.liveness), ev.liveness?.passed ? ok : warn);
  const d = Number(ev.face_distance);
  const sim = Number.isFinite(d) ? Math.max(0, Math.min(100, Math.round((1 - d / 1.2) * 100))) : null;
  if (ev.manual_review) {
    const auto = sim === null ? "comparação automática inconclusiva" : `comparação automática abaixo do limite (similaridade ${sim}% – distância ${d.toFixed(3)}, limite ${FACE_LIMIT})`;
    rowKV("Reconhecimento facial", `${auto}; selfie e documento conferidos visualmente e aprovados por ${ev.manual_review.by_name || "responsável do escritório"} em ${brDate(new Date(ev.manual_review.at))}`, warn);
  } else {
    rowKV("Reconhecimento facial", `Selfie compatível com a foto do documento de identificação (similaridade ${sim}% – distância ${d.toFixed(3)}, limite ${FACE_LIMIT})`, ok);
  }
  rowKV("Consentimento", "Aceite expresso dos termos de assinatura eletrônica e do tratamento de dados biométricos (LGPD, art. 11, I)");
  section("Registro técnico");
  rowKV("Data e hora", `${when} (horário de Brasília) • ${signedAt.toISOString()} (UTC)`);
  rowKV("Endereço IP", ev.ip || "—");
  rowKV("Dispositivo", String(ev.user_agent || "—").slice(0, 180));
  rowKV("Localização", ev.geo ? `${Number(ev.geo.lat).toFixed(5)}, ${Number(ev.geo.lng).toFixed(5)} (precisão ~${Math.round(ev.geo.acc || 0)} m)` : "Não autorizada pelo signatário");
  if (ev.timestamp) {
    const gt = ev.timestamp.gen_time ? `${brDate(new Date(ev.timestamp.gen_time))} (horário de Brasília)` : "horário registrado no token";
    rowKV("Carimbo do tempo", `Emitido por ${ev.timestamp.provider} em ${gt} sobre o resumo SHA-256 das evidências ${ev.timestamp.sha256}. Token arquivado no sistema do escritório.`, ok);
  } else {
    rowKV("Carimbo do tempo", "Serviço de carimbo indisponível no momento da assinatura; vale o horário do servidor acima.");
  }

  section("Evidências biométricas");
  try {
    const self = await pdf.embedJpg(selfie), idi = await pdf.embedJpg(idPhoto);
    const s1 = self.scaleToFit(140, 150), s2 = idi.scaleToFit(200, 150);
    page.drawImage(self, { x: ML, y: y - s1.height, width: s1.width, height: s1.height });
    page.drawImage(idi, { x: ML + 170, y: y - s2.height, width: s2.width, height: s2.height });
    const h = Math.max(s1.height, s2.height);
    page.drawText("Selfie (prova de vida)", { x: ML, y: y - h - 10, size: 7.5, font: I, color: muted });
    page.drawText("Documento de identificação apresentado", { x: ML + 170, y: y - h - 10, size: 7.5, font: I, color: muted });
    y -= h + 24;
  } catch { page.drawText("Imagens arquivadas no sistema do escritório.", { x: ML, y, size: 9, font: I, color: muted }); y -= 16; }

  const legal = "Este documento foi assinado eletronicamente por meio da plataforma LEXOFFICE, com identificação do signatário por link pessoal e código enviados ao seu WhatsApp, prova de vida e comparação biométrica facial, nos termos do art. 4º, II, da Lei nº 14.063/2020 e do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. O resumo criptográfico (SHA-256) deste arquivo assinado fica registrado no sistema do escritório: qualquer alteração posterior, por menor que seja, altera esse resumo e evidencia a violação. Quando disponível, as evidências e o arquivo final recebem carimbo do tempo emitido por autoridade independente (RFC 3161), que atesta a data e a hora de sua existência. Os dados biométricos são tratados exclusivamente para comprovação da autoria e integridade desta assinatura.";
  for (const ln of wrap(legal, R, 7.8, CW)) { if (y < 52) break; page.drawText(ln, { x: ML, y, size: 7.8, font: R, color: muted }); y -= 10; }
  page.drawLine({ start: { x: ML, y: 40 }, end: { x: W - ML, y: 40 }, thickness: 0.5, color: gold });
  page.drawText("Suzanne Eulâmpio da Silva Figueiredo • OAB/MG 131.880 • (31) 99298-4141 • eulampiosuzanne@gmail.com", { x: ML, y: 28, size: 7.5, font: I, color: muted });
  return await pdf.save();
}

// Gera o PDF final de UM documento, arquiva na ficha do cliente e conclui a solicitação.
async function finalize(a: any, row: any, ev: any, selfie: Uint8Array, idPhoto: Uint8Array) {
  ev = JSON.parse(JSON.stringify(ev));
  const { data: orig, error: dl } = await a.storage.from("lexoffice-documents").download(row.source_path);
  if (dl || !orig) throw new Error("Documento original indisponível.");
  const origBytes = new Uint8Array(await orig.arrayBuffer());
  if ((await sha256Hex(origBytes)) !== row.source_sha256) return { error: "O documento foi alterado depois do envio. Peça um novo link ao escritório.", status: 409 };
  const signedAt = new Date(ev.signed_at);
  const code = row.verification_code;
  // Carimbo 1: sobre o resumo das evidências (documento original + selfie + documento de identidade + registro técnico).
  delete ev.timestamp; delete ev.timestamp_pdf;
  const evDigest = await sha256Hex(JSON.stringify({ source_sha256: row.source_sha256, selfie_sha256: await sha256Hex(selfie), id_photo_sha256: await sha256Hex(idPhoto), evidence: ev }));
  const st1 = await stampHash(evDigest);
  if (st1) { const info = await storeStamp(a, `${row.org_id}/carimbos/${row.id}-evidencias.tsr`, st1, evDigest); if (info) ev.timestamp = info; }
  const signed = await buildSigned(a, row, origBytes, ev, selfie, idPhoto);
  const signedPath = `${row.org_id}/${signedAt.getFullYear()}/${crypto.randomUUID()}-assinado.pdf`;
  const up3 = await a.storage.from("lexoffice-documents").upload(signedPath, new Blob([signed], { type: "application/pdf" }), { contentType: "application/pdf" });
  if (up3.error) throw up3.error;
  const signedSha = await sha256Hex(signed);
  // Carimbo 2: sobre o PDF final assinado (prova que o arquivo existia assim nessa data e não foi alterado).
  const st2 = await stampHash(signedSha);
  if (st2) { const info = await storeStamp(a, `${signedPath}.tsr`, st2, signedSha); if (info) ev.timestamp_pdf = info; }
  const extra = ev.manual_review ? " Identidade conferida visualmente pelo escritório." : "";
  const tsNote = ev.timestamp_pdf ? ` Carimbo do tempo (${TSA_NAME}) em ${ev.timestamp_pdf.gen_time ? brDate(new Date(ev.timestamp_pdf.gen_time)) : "—"}; token em ${ev.timestamp_pdf.token_path}.` : "";
  const { data: docRow } = await a.from("documents").insert({ org_id: row.org_id, owner_user_id: row.owner_user_id, client_id: row.client_id, name: `${row.title} (assinado)`, file_path: signedPath, mime_type: "application/pdf", size_bytes: signed.length, category: "Documento assinado", notes: `Assinado eletronicamente por ${row.signer_name} em ${brDate(signedAt)} com validação biométrica.${extra} Código de verificação ${code}. ID da transação ${row.id}. SHA-256 ${signedSha}.${tsNote}`, uploaded_by: row.owner_user_id }).select("id").single();
  const upd = await a.from("lex_signature_requests").update({ status: "signed", signed_at: signedAt.toISOString(), evidence: ev, signed_path: signedPath, signed_sha256: signedSha, signed_document_id: docRow?.id || null, verification_code: code, finalize_error: null }).eq("id", row.id).is("signed_path", null);
  if (upd.error) throw upd.error;
  return { ok: true, id: row.id, title: row.title, verification_code: code, signed_at: signedAt.toISOString() };
}

// ---------- Lote: vários documentos assinados com um único link e uma única validação ----------
// O registro "principal" do lote é o que tem id = batch_id (é ele que guarda o link, o código e as tentativas).
async function batchMembers(a: any, row: any, statuses?: string[]) {
  if (!row.batch_id) return statuses && !statuses.includes(row.status) ? [] : [row];
  let q = a.from("lex_signature_requests").select("*").eq("batch_id", row.batch_id).eq("org_id", row.org_id).order("created_at", { ascending: true });
  if (statuses) q = q.in("status", statuses);
  const { data } = await q;
  return (data || []) as any[];
}
async function primaryOf(a: any, row: any) {
  if (!row.batch_id || row.batch_id === row.id) return row;
  const { data } = await a.from("lex_signature_requests").select("*").eq("id", row.batch_id).maybeSingle();
  return data || row;
}
const docList = (titles: string[]) => titles.map((t) => `• ${t}`).join("\n");

// ---------- Conclusão em segundo plano, um documento por execução ----------
// Antes, todos os PDFs do lote eram gerados ao mesmo tempo na mesma execução e o servidor era
// interrompido no meio (limite de processamento), deixando assinaturas feitas sem o PDF final.
// Agora a assinatura do cliente é gravada na hora e cada PDF é gerado numa execução própria, em fila.
const SELF_PATH = "/functions/v1/signature-biometric-public";
const CLAIM_MINUTES = 4;
// Chamadas internas: a própria função (chave de serviço) ou o agendador do banco (x-sync-token).
async function isInternal(req: Request) {
  const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const h = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (sk && h === sk) return true;
  const provided = req.headers.get("x-sync-token") || "";
  if (!provided) return false;
  const { data } = await db().from("system_runtime_secrets").select("secret").eq("key", "datajud_sync_token").maybeSingle();
  const expected = String(data?.secret || "").trim();
  return Boolean(expected) && provided === expected;
}
function kick(body: Record<string, unknown>) {
  const u = Deno.env.get("SUPABASE_URL")!, sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const p = fetch(`${u}${SELF_PATH}`, { method: "POST", headers: { Authorization: `Bearer ${sk}`, apikey: sk, "Content-Type": "application/json" }, body: JSON.stringify({ action: "finalize_next", ...body }), signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  // Acelerador apenas: a garantia é o agendador do banco (lex-signature-finalize, a cada minuto).
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* segue */ }
  return p;
}
// Assinado pelo cliente (evidência gravada) mas ainda sem o PDF final.
const pendingFilter = (q: any) => q.not("signed_at", "is", null).is("signed_path", null).not("evidence", "is", null).in("status", ["sent", "viewed", "pending_review"]);
async function finalizeNext(body: any) {
  const a = db();
  let q = pendingFilter(a.from("lex_signature_requests").select("*")).order("signed_at", { ascending: true }).limit(20);
  if (body.batch_key) q = q.or(`batch_id.eq.${body.batch_key},id.eq.${body.batch_key}`);
  if (body.id) q = q.eq("id", body.id);
  const { data: cands } = await q;
  const claimLimit = new Date(Date.now() - CLAIM_MINUTES * 60000).toISOString();
  // Em conferência manual, só conclui depois que o escritório aprovou.
  const list = (cands || []).filter((r: any) => r.status !== "pending_review" || r.evidence?.manual_review);
  for (const cand of list) {
    const now = new Date().toISOString();
    const { data: claimed } = await a.from("lex_signature_requests").update({ finalize_claimed_at: now }).eq("id", cand.id).is("signed_path", null).or(`finalize_claimed_at.is.null,finalize_claimed_at.lt.${claimLimit}`).select("*");
    const row = claimed?.[0];
    if (!row) continue;
    const ev = row.evidence || {};
    let result: any;
    try {
      const prim = await primaryOf(a, row);
      const selfiePath = row.selfie_path || prim.selfie_path, idPath = row.id_photo_path || prim.id_photo_path;
      const selfie = await downloadBytes(a, "signature-evidence", selfiePath);
      const idPhoto = await downloadBytes(a, "signature-evidence", idPath);
      result = await finalize(a, row, ev, selfie, idPhoto);
      if (result?.error) await a.from("lex_signature_requests").update({ finalize_error: String(result.error).slice(0, 300), finalize_claimed_at: null }).eq("id", row.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("finalize_next", row.id, msg);
      await a.from("lex_signature_requests").update({ finalize_error: msg.slice(0, 300) }).eq("id", row.id);
      result = { error: msg };
    }
    const key = row.batch_id || row.id;
    // Ainda há documentos deste lote esperando? Chama a próxima execução.
    const { data: rest } = await pendingFilter(a.from("lex_signature_requests").select("id,status,evidence")).or(`batch_id.eq.${key},id.eq.${key}`);
    const restReady = (rest || []).filter((r: any) => r.status !== "pending_review" || r.evidence?.manual_review);
    if (restReady.length && !result?.error) { await kick({ batch_key: key }); }
    else if (!restReady.length && result?.ok) await notifyDone(a, row, ev);
    return J({ ok: !result?.error, processed: row.id, error: result?.error || null, remaining: restReady.length });
  }
  return J({ ok: true, processed: null, remaining: 0 });
}
// Uma única confirmação ao cliente quando todos os documentos daquela assinatura ficaram prontos.
async function notifyDone(a: any, row: any, ev: any) {
  if (ev?.silent_finalize) return;
  const key = row.batch_id || row.id;
  const { data: done } = await a.from("lex_signature_requests").select("id,title,verification_code,evidence").or(`batch_id.eq.${key},id.eq.${key}`).eq("status", "signed");
  const same = (done || []).filter((d: any) => d.evidence?.signed_at === ev.signed_at);
  if (!same.length) return;
  const msg = same.length === 1
    ? `Pronto! Sua assinatura no documento "${same[0].title}" foi registrada com sucesso. Código de verificação: ${same[0].verification_code}. Uma via assinada fica arquivada no escritório.`
    : `Pronto! Sua assinatura nos ${same.length} documentos foi registrada com sucesso:\n\n${same.map((d: any) => `• ${d.title} (código ${d.verification_code})`).join("\n")}\n\nUma via assinada de cada um fica arquivada no escritório.`;
  await sendWhatsApp(row.org_id, row.signer_phone, msg, `lexsign-done-${key}-${ev.signed_at}`).catch(() => false);
  // O aviso do app (mesmo cartão do link) passa a mostrar a confirmação — o link antigo some do app.
  await appNotify(a, { ...row, id: key }, "Assinatura concluída", msg, "signature_done");
}

async function downloadBytes(a: any, bucket: string, path: string) {
  const { data, error } = await a.storage.from(bucket).download(path);
  if (error || !data) throw new Error("Evidência não encontrada.");
  return new Uint8Array(await data.arrayBuffer());
}

// ---------- Lembrete automático (chamado pelo signature-reminder-worker) ----------
// Gera um link novo (o antigo deixa de valer) e reenvia pelo WhatsApp, sem apagar o que o cliente já fez.
async function remindInternal(body: any) {
  const a = db();
  const { data: r0 } = await a.from("lex_signature_requests").select("*").eq("id", body.id).maybeSingle();
  if (!r0) return J({ error: "not_found" }, 404);
  const row = await primaryOf(a, r0);
  const members = (await batchMembers(a, row, ["sent", "viewed"])).filter((m: any) => !m.signed_at);
  if (!members.length) return J({ ok: true, skipped: "nada_pendente" });
  if (new Date(row.expires_at).getTime() < Date.now()) return J({ ok: true, skipped: "expirado" });
  const n = Number(body.reminder_number || (row.reminder_count || 0) + 1);
  const token = newToken();
  const now = new Date().toISOString();
  const upd = await a.from("lex_signature_requests").update({ token_hash: await sha256Hex(token), reminder_count: n, last_reminder_at: now }).eq("id", row.id).eq("reminder_count", row.reminder_count || 0);
  if (upd.error) throw upd.error;
  const link = `${APP}/assinar/${token}`;
  // 22/10/2026: o lembrete também leva o código (só se o cliente ainda não confirmou o código).
  let codeLine = "";
  if (!row.otp_verified_at) {
    const linkCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    await a.from("lex_signature_requests").update({ otp_hash: await sha256Hex(row.id + linkCode), otp_expires_at: row.expires_at, otp_sent_at: now, otp_attempts: 0, otp_from_link: true }).eq("id", row.id);
    codeLine = `Seu código de confirmação: *${linkCode.slice(0, 3)} ${linkCode.slice(3)}*\nQuando a página pedir, digite esses 6 números. Não passe este código para ninguém.`;
  }
  const what = members.length > 1 ? `os ${members.length} documentos que o escritório enviou` : `o documento "${members[0].title}"`;
  const last = n >= 2;
  const msg = `Olá, ${firstName(row.signer_name)}! ${last ? "Último lembrete:" : "Passando para lembrar:"} ${what} ainda ${members.length > 1 ? "aguardam" : "aguarda"} a sua assinatura digital com biometria facial.\n\nÉ só tocar no link e seguir os passos: código, foto do RG ou CNH e selfie (leva poucos minutos):\n${link}${codeLine ? `\n\n${codeLine}` : ""}\n\nSe já tentou e não conseguiu, responda esta mensagem que o escritório ajuda.`;
  const ok = await sendWhatsApp(row.org_id, row.signer_phone, msg, `lexsign-remind-${row.id}-${n}`);
  const appId = await appNotify(a, row, last ? "Último lembrete: assinatura pendente" : "Lembrete: assinatura pendente", `${appBody(members, link, true)}${codeLine ? `\n\n${codeLine.replace(/\*/g, "")}` : ""}`, "signature_reminder");
  return J({ ok, reminder: n, documents: members.length, app_notified: Boolean(appId) });
}

const APP = "https://lexoffice-ashy.vercel.app";
function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function firstName(n: string) { const f = String(n || "").trim().split(/\s+/)[0] || ""; return f ? f[0].toUpperCase() + f.slice(1).toLowerCase() : ""; }
async function adminHandler(req: Request, body: any) {
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const uc = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return J({ error: "Sessão inválida." }, 401);
    const db = createClient(url, service, { auth: { persistSession: false } });
    const { data: prof } = await db.from("profiles").select("org_id,name").eq("id", user.id).maybeSingle();
    if (!prof?.org_id) return J({ error: "Organização não encontrada." }, 403);
    const org = prof.org_id as string;
    const action = String(body.action || "create");

    if (action === "cancel") {
      const { data: c } = await db.from("lex_signature_requests").select("id,batch_id").eq("id", body.id).eq("org_id", org).maybeSingle();
      if (!c) return J({ error: "Solicitação não encontrada." }, 404);
      // Cancelar um lote cancela o link inteiro (todos os documentos que ainda não foram assinados).
      let q = db.from("lex_signature_requests").update({ status: "cancelled" }).eq("org_id", org).in("status", ["sent", "viewed", "pending_review"]).is("signed_at", null);
      q = c.batch_id ? q.eq("batch_id", c.batch_id) : q.eq("id", c.id);
      const { error } = await q;
      if (error) throw error;
      return J({ ok: true });
    }

    if (action === "evidence" || action === "approve" || action === "reject") {
      const { data: r0 } = await db.from("lex_signature_requests").select("*").eq("id", body.id).eq("org_id", org).maybeSingle();
      if (!r0) return J({ error: "Solicitação não encontrada." }, 404);
      const r = await primaryOf(db, r0);
      const group = await batchMembers(db, r, action === "evidence" ? undefined : ["pending_review"]);
      if (action === "evidence") {
        const sign = async (p?: string | null) => (p ? (await db.storage.from("signature-evidence").createSignedUrl(p, 600)).data?.signedUrl || null : null);
        return J({ ok: true, id: r.id, status: r.status, title: r.title, documents: group.filter((g: any) => g.status !== "cancelled").map((g: any) => ({ id: g.id, title: g.title, status: g.status })), signer_name: r.signer_name, signer_cpf: fmtDoc(r.signer_cpf), signer_phone: maskPhone(r.signer_phone), created_at: r.created_at, viewed_at: r.viewed_at, otp_verified_at: r.otp_verified_at, signed_at: r.signed_at, verification_code: r.verification_code, face_distance: r.face_distance, face_limit: FACE_LIMIT, face_attempts: r.face_attempts, source_sha256: r.source_sha256, signed_sha256: r.signed_sha256, evidence: r.evidence, reviewed_at: r.reviewed_at, review_note: r.review_note, selfie_url: await sign(r.selfie_path), id_photo_url: await sign(r.id_photo_path) });
      }
      if (!group.length) return J({ error: "Esta assinatura não está aguardando conferência." }, 400);
      const now = new Date().toISOString();
      const ids = group.map((g: any) => g.id);
      const what = group.length > 1 ? `dos ${group.length} documentos:\n${docList(group.map((g: any) => g.title))}\n` : `do documento "${group[0].title}".`;
      if (action === "reject") {
        await db.from("lex_signature_requests").update({ status: "rejected", review_by: user.id, reviewed_at: now, review_note: String(body.note || "").slice(0, 500) || null }).in("id", ids);
        if (body.notify !== false) await sendWhatsApp(r.org_id, r.signer_phone, `Olá, ${firstName(r.signer_name)}. Não conseguimos confirmar sua identidade na assinatura ${what} O escritório vai entrar em contato para combinar uma nova assinatura.`, `lexsign-reject-${r.id}-${Date.now()}`).catch(() => false);
        return J({ ok: true, status: "rejected" });
      }
      // Aprovação: grava a conferência em cada documento e gera os PDFs em segundo plano, um por vez.
      const note = String(body.note || "").slice(0, 500) || null;
      const manual = { by: user.id, by_name: prof.name || user.email || null, at: now, note };
      for (const g of group) {
        const ev = { ...(g.evidence || r.evidence || {}), manual_review: manual };
        await db.from("lex_signature_requests").update({ review_by: user.id, reviewed_at: now, review_note: note, evidence: ev, selfie_path: g.selfie_path || r.selfie_path, id_photo_path: g.id_photo_path || r.id_photo_path }).eq("id", g.id);
      }
      await kick({ batch_key: r.batch_id || r.id });
      return J({ ok: true, status: "signing", count: group.length, documents: group.map((g: any) => ({ id: g.id, title: g.title, verification_code: g.verification_code })) });
    }

    let row: any = null;
    let members: any[] = [];
    if (action === "resend") {
      const { data } = await db.from("lex_signature_requests").select("*").eq("id", body.id).eq("org_id", org).maybeSingle();
      if (!data) return J({ error: "Solicitação não encontrada." }, 404);
      row = await primaryOf(db, data);
      // Documentos já assinados pelo cliente (mesmo com o PDF ainda sendo gerado) não são reenviados.
      members = (await batchMembers(db, row, ["sent", "viewed", "expired", "rejected"])).filter((m: any) => !m.signed_at || m.status === "rejected");
      if (!members.length) {
        await kick({ batch_key: row.batch_id || row.id });
        return J({ error: "O cliente já assinou. O documento assinado está sendo gerado e aparece em instantes." }, 400);
      }
      if (!members.some((m: any) => m.id === row.id)) {
        // O principal do lote foi concluído/cancelado: o primeiro pendente passa a guardar o link.
        row = members[0];
      }
    } else if (action === "create") {
      const ids: string[] = Array.from(new Set((Array.isArray(body.document_ids) ? body.document_ids : [body.document_id]).map((x: unknown) => String(x || "")).filter(Boolean)));
      if (!ids.length) return J({ error: "Escolha pelo menos um documento." }, 400);
      if (ids.length > 30) return J({ error: "Envie no máximo 30 documentos por vez." }, 400);
      const { data: docs } = await db.from("documents").select("id,name,file_path,mime_type,client_id").in("id", ids).eq("org_id", org);
      if (!docs || docs.length !== ids.length) return J({ error: "Documento não encontrado." }, 404);
      const ordered = ids.map((id) => docs.find((d: any) => d.id === id)!);
      for (const doc of ordered) if (!/pdf/i.test(String(doc.mime_type || "")) && !/\.pdf$/i.test(String(doc.file_path || ""))) return J({ error: `"${doc.name}" não é PDF. Só é possível enviar PDFs para assinatura.` }, 400);
      const clientId = body.client_id || ordered[0].client_id;
      if (!clientId) return J({ error: "O documento não está vinculado a um cliente." }, 400);
      const { data: cl } = await db.from("clients").select("id,name,cpf_cnpj,whatsapp,phone").eq("id", clientId).eq("org_id", org).maybeSingle();
      if (!cl) return J({ error: "Cliente não encontrado." }, 404);
      const phone = digits(body.phone || cl.whatsapp || cl.phone);
      if (phone.length < 10) return J({ error: "O cliente não tem WhatsApp cadastrado. Cadastre o número antes de enviar." }, 400);
      const batchId = ordered.length > 1 ? crypto.randomUUID() : null;
      for (let i = 0; i < ordered.length; i++) {
        const doc = ordered[i];
        const { data: blob, error: dl } = await db.storage.from("lexoffice-documents").download(doc.file_path);
        if (dl || !blob) throw new Error(`Não foi possível abrir o PDF "${doc.name}".`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const ins = await db.from("lex_signature_requests").insert({
          ...(batchId && i === 0 ? { id: batchId } : {}),
          batch_id: batchId,
          org_id: org, owner_user_id: user.id, client_id: cl.id, document_id: doc.id,
          title: String((ordered.length === 1 && body.title) || doc.name || "Documento").replace(/\.pdf$/i, ""),
          source_path: doc.file_path, source_sha256: await sha256Hex(bytes),
          token_hash: await sha256Hex(newToken()),
          signer_name: cl.name, signer_cpf: cl.cpf_cnpj, signer_phone: phone,
        }).select("*").single();
        if (ins.error) throw ins.error;
        members.push(ins.data);
      }
      row = members[0];
    } else return J({ error: "Ação inválida." }, 400);

    const token = newToken();
    const expires = new Date(Date.now() + 15 * 86400000).toISOString();
    for (const m of members) {
      const upd = await db.from("lex_signature_requests").update({ ...(m.id === row.id ? { token_hash: await sha256Hex(token), reminder_count: 0, last_reminder_at: null, office_alerted_at: null } : {}), status: ["expired", "rejected"].includes(m.status) ? "sent" : m.status, expires_at: expires, otp_hash: null, otp_verified_at: null, otp_attempts: 0, face_attempts: 0, verification_code: m.status === "rejected" ? null : m.verification_code, ...(m.status === "rejected" ? { signed_at: null, evidence: null } : {}) }).eq("id", m.id);
      if (upd.error) throw upd.error;
    }
    if (row.batch_id && row.batch_id !== row.id) {
      // Novo principal do lote: só os pendentes mudam de lote; os já assinados ficam onde estão.
      await db.from("lex_signature_requests").update({ batch_id: row.id }).in("id", members.map((m: any) => m.id));
    }
    const link = `${APP}/assinar/${token}`;
    // 22/10/2026 — pedido da Dra. Suzanne: o código de confirmação já vai junto com o link (vale enquanto o link valer).
    const linkCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    const otpUpd = await db.from("lex_signature_requests").update({ otp_hash: await sha256Hex(row.id + linkCode), otp_expires_at: expires, otp_sent_at: new Date().toISOString(), otp_attempts: 0, otp_from_link: true }).eq("id", row.id);
    if (otpUpd.error) throw otpUpd.error;
    const codeLine = `Seu código de confirmação: *${linkCode.slice(0, 3)} ${linkCode.slice(3)}*\nQuando a página pedir, digite esses 6 números. Não passe este código para ninguém.`;
    let whatsapp = { ok: false, reason: "não enviado" as string | null };
    let msg = "";
    {
      const what = members.length > 1
        ? `enviou ${members.length} documentos para sua *assinatura digital com biometria facial* pelo celular:\n\n${docList(members.map((m: any) => m.title))}\n\nVocê assina todos de uma vez só.`
        : `enviou o documento "${row.title}" para sua *assinatura digital com biometria facial* pelo celular.`;
      msg = `Olá, ${firstName(row.signer_name)}! O escritório Suzanne Figueiredo Advocacia ${what}\n\nToque no link abaixo para começar:\n${link}\n\nÉ bem simples: você lê ${members.length > 1 ? "os documentos" : "o documento"}, digita o código abaixo, tira uma foto do seu RG ou CNH e uma selfie, que é a biometria facial: ela confirma que é você mesmo(a) quem está assinando. Se quiser, peça ajuda a alguém de confiança para segurar o celular.\n\n${codeLine}\n\nO link é pessoal e vale por 15 dias. Qualquer dúvida, é só responder esta mensagem.`;
    }
    // "Copiar link": o escritório recebe a mensagem pronta (com o código) para colar onde quiser.
    if (body.send_whatsapp !== false) {
      whatsapp = { ok: await sendWhatsApp(org, row.signer_phone, msg, `lexsign-link-${row.id}-${Date.now()}`), reason: null };
      // Só depois que o link e o código foram enviados, e em segundo plano (não atrasa nem trava a resposta).
      if (whatsapp.ok) { const g = sendGuide(org, row.signer_phone, `lexsign-guide-${row.id}-${Date.now()}`); try { (globalThis as any).EdgeRuntime?.waitUntil?.(g); } catch { /* segue */ } }
    }
    const appId = await appNotify(db, row, members.length > 1 ? "Documentos para assinar" : "Documento para assinar", `${appBody(members, link, false)}\n\n${codeLine.replace(/\*/g, "")}`, "signature_link");
    return J({ ok: true, id: row.id, count: members.length, link, message: msg, whatsapp_sent: whatsapp.ok, whatsapp_reason: body.send_whatsapp === false ? "copiar_link" : (whatsapp.ok ? null : "whatsapp_nao_confirmou"), app_notified: Boolean(appId) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return J({ error: "Método não permitido." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const act = String(body.action || "");
    if (act === "finalize_next" || act === "remind") {
      if (!(await isInternal(req))) return J({ error: "unauthorized" }, 401);
      return act === "finalize_next" ? await finalizeNext(body) : await remindInternal(body);
    }
    if (["create", "resend", "cancel", "evidence", "approve", "reject"].includes(act)) { try { return await adminHandler(req, body); } catch (e) { console.error("lex-sign-admin", e); return J({ error: e instanceof Error ? e.message : String(e) }, 500); } }
    if (act === "verify") return await verifyPublic(body);
    const token = String(body.token || "").trim();
    if (token.length < 20) return J({ error: "Link inválido." }, 400);
    const a = db();
    const { data: row } = await a.from("lex_signature_requests").select("*").eq("token_hash", await sha256Hex(token)).maybeSingle();
    if (!row) return J({ error: "Link inválido ou substituído por um novo envio." }, 404);
    const all = (await batchMembers(a, row)).filter((m: any) => m.status !== "cancelled");
    const many = all.length > 1;
    const label = many ? `${all.length} documentos` : row.title;
    const docsOut = async (withUrl: boolean) => Promise.all(all.map(async (m: any) => ({ id: m.id, title: m.title, status: m.signed_at && m.status !== "pending_review" && m.status !== "rejected" ? "signed" : m.status, verification_code: m.signed_at ? m.verification_code : null, pdf_url: withUrl ? (await a.storage.from("lexoffice-documents").createSignedUrl(m.source_path, 1800)).data?.signedUrl || null : null })));
    if (row.status === "cancelled") return J({ error: "Esta solicitação de assinatura foi cancelada pelo escritório." }, 410);
    if (row.status === "rejected") return J({ error: "Esta assinatura não foi confirmada. O escritório vai enviar um novo link." }, 410);
    // Já assinado pelo cliente (o PDF final pode ainda estar sendo gerado): mostra como concluído e garante a fila.
    const signedByClient = row.status === "signed" || (row.signed_at && ["sent", "viewed"].includes(row.status) && all.every((m: any) => m.signed_at || !["sent", "viewed"].includes(m.status)));
    if (signedByClient) {
      if (row.status !== "signed") await kick({ batch_key: row.batch_id || row.id });
      return J({ ok: true, status: "signed", title: label, signed_at: row.signed_at, verification_code: row.verification_code, documents: await docsOut(false) });
    }
    if (row.status === "pending_review") return J({ ok: true, status: "pending_review", title: label, signer_name: row.signer_name, documents: await docsOut(false) });
    if (new Date(row.expires_at).getTime() < Date.now()) { await a.from("lex_signature_requests").update({ status: "expired" }).in("id", all.filter((m: any) => ["sent", "viewed"].includes(m.status) && !m.signed_at).map((m: any) => m.id).concat(row.signed_at ? [] : [row.id])); return J({ error: "Este link expirou. Peça um novo ao escritório." }, 410); }
    const action = String(body.action || "open");

    if (action === "open") {
      const unseen = all.filter((m: any) => !m.viewed_at).map((m: any) => m.id);
      if (unseen.length) await a.from("lex_signature_requests").update({ viewed_at: new Date().toISOString(), status: "viewed" }).in("id", unseen).in("status", ["sent", "viewed"]);
      const documents = await docsOut(true);
      return J({ ok: true, status: row.status, title: label, documents, signer_name: row.signer_name, signer_cpf_masked: fmtDoc(row.signer_cpf).replace(/^\d{3}\.\d{3}/, "***.***"), phone_masked: maskPhone(row.signer_phone), pdf_url: documents[0]?.pdf_url || null, otp_verified: Boolean(row.otp_verified_at), face_attempts: row.face_attempts || 0, review_after: MIN_FACE_ATTEMPTS_FOR_REVIEW });
    }
    if (action === "send_otp") {
      if (row.otp_from_link && row.otp_hash && row.otp_expires_at && new Date(row.otp_expires_at).getTime() > Date.now()) {
        // O código já foi junto com o link. Na primeira vez só abre o campo; se pedir de novo, gera um novo.
        await a.from("lex_signature_requests").update({ otp_from_link: false }).eq("id", row.id);
        return J({ ok: true, phone_masked: maskPhone(row.signer_phone), already_sent: true });
      }
      if (row.otp_sent_at && Date.now() - new Date(row.otp_sent_at).getTime() < 60000) return J({ error: "Aguarde um minuto para pedir um novo código.", wait: true }, 429);
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      await a.from("lex_signature_requests").update({ otp_hash: await sha256Hex(row.id + code), otp_expires_at: new Date(Date.now() + 15 * 60000).toISOString(), otp_sent_at: new Date().toISOString(), otp_attempts: 0, otp_from_link: false }).eq("id", row.id);
      const pend = all.filter((m: any) => !m.signed_at && ["sent", "viewed"].includes(m.status)).length || all.length;
      const sent = await sendWhatsApp(row.org_id, row.signer_phone, `Seu código para assinar ${pend > 1 ? `os ${pend} documentos` : `o documento "${row.title}"`} é:\n\n*${code.slice(0, 3)} ${code.slice(3)}*\n\nVolte para a página da assinatura e digite esses 6 números. O código vale por 15 minutos. Não passe este código para ninguém.`, `lexsign-otp-${row.id}-${Date.now()}`);
      // Também no aplicativo do cliente (chega mesmo quando o WhatsApp oficial não entrega fora da janela de 24h).
      // Mesmo aviso do link no app (é atualizado, não duplicado): mantém o link e mostra o código novo.
      const appCode = await appNotify(a, row, pend > 1 ? "Documentos para assinar" : "Documento para assinar", `${appBody(all.filter((m: any) => !m.signed_at), `${APP}/assinar/${token}`, false)}\n\nSeu código de confirmação: ${code.slice(0, 3)} ${code.slice(3)} (vale por 15 minutos). Não passe este código para ninguém.`, "signature_otp");
      if (!sent && !appCode) return J({ error: "Não foi possível enviar o código pelo WhatsApp agora. Tente novamente em instantes ou fale com o escritório." }, 502);
      return J({ ok: true, phone_masked: maskPhone(row.signer_phone) });
    }
    if (action === "verify_otp") {
      if (!row.otp_hash || !row.otp_expires_at || new Date(row.otp_expires_at).getTime() < Date.now()) return J({ error: "Código expirado. Peça um novo." }, 400);
      if (row.otp_attempts >= 5) return J({ error: "Muitas tentativas. Peça um novo código." }, 429);
      const good = (await sha256Hex(row.id + digits(body.code))) === row.otp_hash;
      if (!good) { await a.from("lex_signature_requests").update({ otp_attempts: row.otp_attempts + 1 }).eq("id", row.id); return J({ error: "Código incorreto. Confira os números e digite de novo." }, 400); }
      await a.from("lex_signature_requests").update({ otp_verified_at: new Date().toISOString(), otp_hash: null, otp_from_link: false }).eq("id", row.id);
      return J({ ok: true });
    }
    if (action === "face_fail") {
      // Conta qualquer falha: comparação facial, prova de vida ou foto de olhos abertos.
      const n = nextAttempts(row.face_attempts);
      console.log("signature face_fail", row.id, cleanKind(body.kind), n);
      await a.from("lex_signature_requests").update({ face_attempts: n }).eq("id", row.id);
      return J({ ok: true, face_attempts: n, review_allowed: reviewAllowed(n) });
    }
    if (action === "submit") {
      if (!row.otp_verified_at) return J({ error: "Confirme o código enviado pelo WhatsApp antes de assinar." }, 400);
      if (!body.consent_terms || !body.consent_biometrics) return J({ error: "É preciso aceitar os termos para assinar." }, 400);
      const distRaw = body.face_distance === null || body.face_distance === undefined ? NaN : Number(body.face_distance);
      const decision = decideSubmit({ liveness: body.liveness, distRaw, manualRequested: Boolean(body.manual_review), attempts: row.face_attempts, faceLimit: FACE_LIMIT });
      if (!decision.ok) return J({ error: decision.error }, 400);
      const manual = decision.manual;
      const selfie = b64ToBytes(body.selfie_jpeg), idPhoto = b64ToBytes(body.id_photo_jpeg);
      if (selfie.length < 5000 || idPhoto.length < 5000 || selfie.length > 3_000_000 || idPhoto.length > 4_000_000) return J({ error: "Imagens inválidas. Tente novamente." }, 400);
      // Só documentos ainda não assinados (evita sobrescrever uma assinatura já registrada em caso de clique duplo).
      const active = all.filter((m: any) => ["sent", "viewed"].includes(m.status) && !m.signed_at);
      if (!active.length) {
        await kick({ batch_key: row.batch_id || row.id });
        return J({ ok: true, status: "signed", documents: await docsOut(false), verification_code: row.verification_code, signed_at: row.signed_at });
      }
      const base = `${row.org_id}/${row.id}`;
      const up1 = await a.storage.from("signature-evidence").upload(`${base}/selfie.jpg`, new Blob([selfie], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: true });
      const up2 = await a.storage.from("signature-evidence").upload(`${base}/documento.jpg`, new Blob([idPhoto], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: true });
      if (up1.error || up2.error) throw up1.error || up2.error;
      const signedAt = new Date();
      const code = (await sha256Hex(row.id + signedAt.toISOString())).slice(0, 10).toUpperCase().replace(/(.{5})/, "$1-");
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
      const geo = body.geo && Number.isFinite(Number(body.geo.lat)) ? { lat: Number(body.geo.lat), lng: Number(body.geo.lng), acc: Number(body.geo.acc || 0) } : null;
      const dist = Number.isFinite(distRaw) ? distRaw : null;
      const ev = { signed_at: signedAt.toISOString(), signed_at_utc: signedAt.toISOString(), otp_verified_at: row.otp_verified_at, ip, user_agent: String(body.user_agent || req.headers.get("user-agent") || "").slice(0, 300), geo, face_distance: dist, face_attempts: row.face_attempts || 0, liveness: decision.liveness, consent: { terms: true, biometrics: true } };
      const out: any[] = [];
      for (const m of active) {
        m.verification_code = m.id === row.id ? code : (await sha256Hex(m.id + signedAt.toISOString())).slice(0, 10).toUpperCase().replace(/(.{5})/, "$1-");
        const u = await a.from("lex_signature_requests").update({ selfie_path: `${base}/selfie.jpg`, id_photo_path: `${base}/documento.jpg`, face_distance: dist, liveness: ev.liveness, evidence: ev, verification_code: m.verification_code, signed_at: signedAt.toISOString(), otp_verified_at: row.otp_verified_at, finalize_claimed_at: null, finalize_error: null, ...(manual ? { status: "pending_review" } : {}) }).eq("id", m.id).is("signed_at", null);
        if (u.error) throw u.error;
        out.push({ id: m.id, title: m.title, status: manual ? "pending_review" : "signed", verification_code: m.verification_code });
      }
      if (manual) {
        const what = active.length > 1 ? `nos ${active.length} documentos` : `no documento "${row.title}"`;
        await sendWhatsApp(row.org_id, row.signer_phone, `Recebemos sua assinatura ${what}. Como a foto do seu documento é antiga ou ficou diferente da selfie, o escritório vai conferir pessoalmente. Você receberá a confirmação aqui pelo WhatsApp.`, `lexsign-review-${row.id}-${Date.now()}`).catch(() => false);
        return J({ ok: true, status: "pending_review" });
      }
      // Assinatura registrada. Os PDFs finais são gerados em segundo plano, um por vez.
      await kick({ batch_key: row.batch_id || row.id });
      return J({ ok: true, status: "signed", documents: out, verification_code: out[0]?.verification_code, signed_at: signedAt.toISOString() });
    }
    return J({ error: "Ação inválida." }, 400);
  } catch (e) {
    console.error("lex-sign-public", e);
    return J({ error: "Não foi possível concluir agora. Tente novamente em instantes." }, 500);
  }
});

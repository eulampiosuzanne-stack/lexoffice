// Entrada no eproc TJSP (1º grau). Mesma lógica do robô do TJMG.
// Nunca grava nem devolve senha, chave ou código 2FA; para no captcha ou na recusa, sem insistir.
export const EPROC_BASE = "https://eproc1g.tjsp.jus.br/eproc/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
export class EprocStop extends Error { constructor(public code: string, msg: string) { super(msg); } }

function base32Decode(s: string) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, "")) { value = (value << 5) | alpha.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
async function totp(secret: string) {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8); let c = Math.floor(Date.now() / 30000);
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

function encodeLatin1Form(form: Record<string, string>) {
  const enc = (s: string) => Array.from(s).map((ch) => { const c = ch.charCodeAt(0); if (/[A-Za-z0-9\-_.~]/.test(ch)) return ch; if (c === 32) return "+"; if (c < 256) return "%" + c.toString(16).toUpperCase().padStart(2, "0"); return encodeURIComponent(ch); }).join("");
  return Object.entries(form).map(([k, v]) => `${enc(k)}=${enc(v ?? "")}`).join("&");
}
export class Browser {
  cookies = new Map<string, string>();
  last = "";
  async go(url: string, form?: Record<string, string>, hops = 0): Promise<string> {
    const abs = new URL(url, this.last || EPROC_BASE).toString();
    // A sessão e a senha só seguem para endereços do próprio TJSP.
    if (!new URL(abs).hostname.endsWith(".tjsp.jus.br")) throw new EprocStop("fora_do_tjsp", `O eproc redirecionou para fora do TJSP (${new URL(abs).hostname}). O robô parou.`);
    const init: RequestInit = { method: form ? "POST" : "GET", redirect: "manual", headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9", Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(this.last ? { Referer: this.last } : {}), ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) } };
    if (form) init.body = encodeLatin1Form(form);
    const r = await fetch(abs, { ...init, signal: AbortSignal.timeout(30000) });
    for (const c of ((r.headers as any).getSetCookie?.() as string[]) || []) { const [kv] = c.split(";"); const i = kv.indexOf("="); if (i > 0) this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location") && hops < 6) { await r.arrayBuffer().catch(() => null); this.last = abs; return this.go(new URL(r.headers.get("location")!, abs).toString(), undefined, hops + 1); }
    const html = new TextDecoder(/utf-8/i.test(r.headers.get("content-type") || "") ? "utf-8" : "iso-8859-1").decode(new Uint8Array(await r.arrayBuffer()));
    this.last = abs;
    if (r.status >= 400) throw new EprocStop("eproc_fora", `O eproc respondeu com erro ${r.status}. Tente mais tarde.`);
    return html;
  }
}

const attr = (tag: string, name: string) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null; };
const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
export const text = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function formFields(html: string, formId: string) {
  const start = html.search(new RegExp(`<form[^>]*\\bid=["']${formId}["']`, "i"));
  if (start < 0) return null;
  const end = html.indexOf("</form>", start);
  const chunk = html.slice(start, end > 0 ? end : undefined);
  const fields: Record<string, string> = {};
  for (const m of chunk.matchAll(/<input\b[^>]*>/gi)) {
    const name = attr(m[0], "name"); if (!name) continue;
    const type = (attr(m[0], "type") || "text").toLowerCase();
    if (["button", "submit", "image", "file"].includes(type)) continue;
    if ((type === "checkbox" || type === "radio") && !/\bchecked\b/i.test(m[0])) continue;
    fields[name] = decode(attr(m[0], "value") || "");
  }
  for (const m of chunk.matchAll(/<select\b[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi)) {
    const sel = m[2].match(/<option[^>]*selected[^>]*value=["']([^"']*)["']/i) || m[2].match(/<option[^>]*value=["']([^"']*)["']/i);
    fields[m[1]] = sel ? decode(sel[1]) : "";
  }
  return { fields, action: decode(attr(chunk.match(/<form[^>]*>/i)![0], "action") || "") };
}
export function menuLinks(html: string) {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/href=["']([^"']*controlador\.php\?acao=([a-zA-Z0-9_\/@]+)[^"']*)["']/g)) if (!out[m[2]]) out[m[2]] = decode(m[1]);
  return out;
}
const telaOf = (html: string) => (html.match(/id=["']hdnStrTela["'][^>]*value=["']([^"']*)/i) || html.match(/value=["']([^"']*)["'][^>]*id=["']hdnStrTela["']/i) || [])[1] || "";
const msgOf = (html: string) => text((html.match(/id=["']str_msg["'][^>]*value=["']([^"']*)/i) || [])[1] || (html.match(/id=["']divErro["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "").slice(0, 300);
const hasCaptcha = (html: string) => /class=["'][^"']*(h-captcha|g-recaptcha)|txtInfraCaptcha/i.test(html);
const isLogged = (html: string) => /acao=sair/.test(html) && /acao=principal/.test(html);

export async function login(user: string, pass: string, seed: string) {
  const b = new Browser();
  let html = await b.go(EPROC_BASE);
  if (isLogged(html)) return { b, html };
  if (hasCaptcha(html)) throw new EprocStop("captcha", "O eproc TJSP está pedindo captcha. O robô não resolve captcha.");
  const f = formFields(html, "frmLogin");
  if (!f) throw new EprocStop("tela_mudou", `A tela de entrada do eproc TJSP é diferente da do TJMG (${(html.match(/<title>([^<]*)/i) || [])[1] || "sem título"}, em ${new URL(b.last).hostname}).`);
  html = await b.go(f.action || "index.php", { ...f.fields, txtUsuario: user, pwdSenha: pass, hdnAcao: "login" });
  for (let step = 0; step < 3 && !isLogged(html); step++) {
    const tela = telaOf(html);
    if (hasCaptcha(html)) throw new EprocStop("captcha", "O eproc pediu captcha depois da senha. O robô parou para não bloquear a conta.");
    if (tela === "2fa_codigo" || /txtAcessoCodigo/.test(html)) {
      const g = formFields(html, "frmLogin");
      if (!g) throw new EprocStop("tela_mudou", "A tela do código 2FA do eproc TJSP é diferente.");
      const acao = (html.match(/id=["']btnValidar["'][^>]*onclick=["'][^"']*Submit\(\s*['"]([^'"]+)/i) || [])[1] || "2fa_validar";
      const left = 30 - Math.floor(Date.now() / 1000) % 30; if (left < 4) await new Promise((r) => setTimeout(r, (left + 1) * 1000));
      html = await b.go(g.action || "index.php", { ...g.fields, txtAcessoCodigo: await totp(seed), hdnAcao: acao });
      if (!isLogged(html) && (telaOf(html) === "2fa_codigo" || /txtAcessoCodigo/.test(html))) throw new EprocStop("2fa_recusado", `O eproc recusou o código 2FA${msgOf(html) ? `: ${msgOf(html)}` : ""}. Confira a chave cadastrada.`);
      continue;
    }
    if (tela === "login" || /id=["']pwdSenha["']/.test(html)) throw new EprocStop("senha_recusada", `O eproc TJSP não aceitou usuário/senha${msgOf(html) ? `: ${msgOf(html)}` : ""}.`);
    const principal = menuLinks(html)["principal"];
    if (principal) { html = await b.go(principal); continue; }
    throw new EprocStop("tela_desconhecida", `Depois do login apareceu uma tela que o robô não conhece (${tela || (html.match(/<title>([^<]*)/i) || [])[1] || "sem título"}).`);
  }
  if (!isLogged(html)) throw new EprocStop("nao_entrou", "O robô não conseguiu concluir a entrada no eproc TJSP.");
  return { b, html };
}
export async function logout(b: Browser, html: string) {
  try { const s = menuLinks(html)["sair"]; if (s) await b.go(s); } catch { /* sem problema */ }
}

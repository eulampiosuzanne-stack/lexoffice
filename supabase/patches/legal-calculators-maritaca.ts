// Trecho aplicado em 30/09/2026 no fim de supabase/functions/legal-calculators/index.ts (versão publicada).
// Como aplicar: renomeie a função original 'async function extractPdf(req: Request, body: Payload)' para 'extractPdfGemini' e cole este trecho no final do arquivo.
// Aceita um PDF (pdf) ou o processo completo (pdfs + full_process: true).

// ===== Leitura de PDF pela Maritaca (Sabiá-4), com o Gemini de reserva — 30/09/2026 =====
async function extractPdf(req: Request, body: Payload) {
  try {
    const viaMaritaca = await mtExtractPdf(req, body);
    if (viaMaritaca) return viaMaritaca;
  } catch (e) {
    console.log("maritaca extract_pdf falhou, usando Gemini:", e instanceof Error ? e.message : String(e));
  }
  if ((body as any)?.full_process) return { ok: false, error: "Não foi possível ler o processo completo agora. Tente de novo em alguns minutos ou envie só a peça principal.", extractedData: {}, notes: [] };
  return await extractPdfGemini(req, body);
}

async function mtExtractPdf(req: Request, body: Payload): Promise<Record<string, unknown> | null> {
  const base = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const service = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  if (!base || !service) return null;
  const sh = { apikey: service, Authorization: `Bearer ${service}` };
  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const u = await fetch(`${base}/auth/v1/user`, { headers: { apikey: service, Authorization: `Bearer ${token}` } });
  if (!u.ok) return null;
  const user = await u.json();
  const pr = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=org_id,status`, { headers: sh });
  const prof = (await pr.json().catch(() => []))?.[0];
  const orgId = String(prof?.org_id || "");
  if (!orgId) return null;
  const b: any = body as any;
  const full = Boolean(b?.full_process);
  const list: any[] = (Array.isArray(b?.pdfs) && b.pdfs.length ? b.pdfs : [b?.pdf]).filter(Boolean).slice(0, 20);
  const paths = list.map((x) => ({ name: String(x?.name || "documento.pdf"), path: String(x?.storage_path || "") }));
  if (!paths.length || paths.some((x) => !x.path || !x.path.startsWith(`${orgId}/`))) return null;

  let mkey = "";
  for (const provider of ["maritaca_api", "maritaca_api_key"]) {
    if (mkey) break;
    const r = await fetch(`${base}/rest/v1/rpc/read_integration_secret`, { method: "POST", headers: { ...sh, "Content-Type": "application/json" }, body: JSON.stringify({ p_org_id: orgId, p_provider: provider }) }).catch(() => null);
    if (r?.ok) mkey = String((await r.json().catch(() => "")) || "").trim();
  }
  if (!mkey) {
    const r = await fetch(`${base}/rest/v1/system_runtime_secrets?key=eq.maritaca_api_key&select=secret`, { headers: sh }).catch(() => null);
    if (r?.ok) mkey = String((await r.json().catch(() => []))?.[0]?.secret || "").trim();
  }
  if (!mkey) mkey = String(Deno.env.get("MARITACA_API_KEY") || "").trim();
  if (!mkey) return null;

  const content: any[] = [];
  for (const p of paths) {
    const f = await fetch(`${base}/storage/v1/object/lexoffice-documents/${p.path.split("/").map(encodeURIComponent).join("/")}`, { headers: sh });
    if (!f.ok) return null;
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    content.push({ type: "file", file: { filename: p.name, file_data: `data:application/pdf;base64,${btoa(bin)}` } });
  }

  const fields = Array.isArray(b?.fields) ? b.fields : [];
  const prompt = `Você é um extrator de dados jurídicos para a calculadora "${String(b?.calculator || "")}" da LexOffice. Leia o PDF e preencha SOMENTE informações explicitamente presentes no documento. Não invente, não estime e não complete lacunas.${full ? "\nOs arquivos são o PROCESSO COMPLETO. Procure em todas as peças: data da citação (certidão/AR/mandado), sentença, acórdão, trânsito em julgado, valores homologados, cálculos e índices fixados. Havendo decisões diferentes, use a mais recente (acórdão prevalece sobre sentença) e explique em notes de onde tirou cada dado (peça e página, se possível)." : ""}
Campos disponíveis (use a chave "key"): ${JSON.stringify(fields)}
Responda APENAS com JSON válido: {"values":{"CHAVE":"valor"},"notes":["observação"]}.
Regras: números sem R$ e sem separador de milhar, com ponto decimal (ex.: 15230.45); percentuais só o número; datas no formato AAAA-MM-DD; omita campos não encontrados; se houver valores conflitantes, omita e explique em notes.`;
  const model = String(Deno.env.get("MARITACA_MODEL") || "sabia-4").trim();
  const r = await fetch("https://chat.maritaca.ai/api/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(full ? 130000 : 38000),
    headers: { Authorization: `Bearer ${mkey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: full ? 4000 : 2500,
      extraction_effort: "medium",
      messages: [{ role: "user", content: [...content, { type: "text", text: prompt }] }],
    }),
  });
  const out = await r.json().catch(() => null);
  const text = String(out?.choices?.[0]?.message?.content || "").trim();
  if (!r.ok || !text) { console.log("maritaca extract_pdf:", r.status, out?.error?.message || out?.detail || ""); return null; }
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  let parsed: any;
  try { parsed = JSON.parse(i >= 0 && j > i ? t.slice(i, j + 1) : t); } catch { return null; }
  const allowed = new Set(fields.map((x: any) => String(x?.key || "")));
  const extractedData: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed?.values || {})) {
    if (allowed.has(k) && v !== null && v !== undefined && String(v).trim() !== "") extractedData[k] = String(v).trim();
  }
  const notes = Array.isArray(parsed?.notes) ? parsed.notes.map(String).filter(Boolean) : (parsed?.notes ? [String(parsed.notes)] : []);
  return { ok: true, extractedData, notes, provider: `maritaca/${model}` };
}

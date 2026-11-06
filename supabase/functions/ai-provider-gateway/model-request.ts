export function resolveGatewayPrompt(policyPrompt: unknown, requestedInstructions: unknown, trustedInternal: boolean) {
  const policy = String(policyPrompt || '').trim();
  const runtime = String(requestedInstructions || '').trim();
  return (trustedInternal && runtime ? runtime : policy || runtime) || 'Você é um agente do LEXOFFICE. Responda em português do Brasil, com clareza e sem inventar informações jurídicas.';
}
export async function generateGemini(key: string, sys: string, input: string, model: string, temperature: number, maxTokens: number, fetcher: typeof fetch = fetch, clock: () => number = Date.now) {
  if (!key) return { ok: false, error: 'gemini_key_missing' };
  const candidates = [...new Set([model || 'gemini-3.7-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])];
  const deadline = clock() + 42000;
  let last: any = { ok: false, error: 'gemini_unavailable' };
  for (const chosen of candidates) {
    const remaining = deadline - clock();
    if (remaining <= 0) return { ...last, error: 'gemini_deadline' };
    try {
      const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(chosen) + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: { temperature, maxOutputTokens: maxTokens } }),
        signal: AbortSignal.timeout(Math.min(15000, remaining))
      });
      const data: any = await response.json().catch(() => null);
      if (response.ok) {
        const text = String(data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '').trim();
        if (text) return { ok: true, provider: 'gemini', model: chosen, text, fallback_used: chosen !== candidates[0] };
        last = { ok: false, error: 'gemini_empty', model: chosen }; continue;
      }
      last = { ok: false, error: 'gemini_' + response.status, detail: data?.error?.message || null, model: chosen };
      if (![404, 429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      last = { ok: false, error: 'gemini_network', detail: error instanceof Error ? error.name : 'request_failed', model: chosen };
    }
  }
  return last;
}

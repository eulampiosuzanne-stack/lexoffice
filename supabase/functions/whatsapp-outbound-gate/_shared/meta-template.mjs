// v82 (11/11/2026) — Avisos proativos pela API oficial da Meta.
// Fora da janela de 24 h a Meta aceita o texto livre e depois o descarta sem avisar (erro 131047).
// Por isso, aviso automático para quem não escreveu nas últimas 24 h sai pelo modelo aprovado abaixo.
export const PROACTIVE_TEMPLATE = 'atualizacao_escritorio_sf';
export const PROACTIVE_TEMPLATE_LANG = 'pt_BR';

// Parâmetro de modelo da Meta: sem quebra de linha, sem tab, sem 4+ espaços seguidos, tamanho limitado.
export function flattenForTemplate(text, max = 900) {
  let s = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[*_~`]/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // o modelo já começa com "Olá, {{1}}." — tira a saudação repetida do texto
  s = s.replace(/^(ol[áa]|oi|bom dia|boa tarde|boa noite)[ ,!]*[^.!?]{0,40}[.!?]\s*/i, '');
  s = s.replace(/[.!?\s]+$/, '');
  if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return s || 'há uma nova atualização para você';
}

export function firstName(name) {
  const n = String(name ?? '').trim().split(/\s+/)[0] || '';
  if (!n || /^\d+$/.test(n)) return 'cliente';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

export function buildTemplatePayload(to, name, message) {
  return {
    to,
    type: 'template',
    template: {
      name: PROACTIVE_TEMPLATE,
      language: { code: PROACTIVE_TEMPLATE_LANG },
      components: [{ type: 'body', parameters: [
        { type: 'text', text: firstName(name) },
        { type: 'text', text: flattenForTemplate(message) },
      ] }],
    },
  };
}

// v84 (12/11/2026) — botões da Meta (respostas rápidas até 3, ou lista até 10). Devolve null se algo estiver fora do limite
// (aí a mensagem sai como texto comum, sem botões — nunca deixa de sair).
const cut = (v, n) => String(v ?? '').trim().slice(0, n);
export function buildInteractivePayload(to, message, interactive) {
  const body = String(message ?? '').trim();
  if (!interactive || !body || body.length > 1024) return null;
  if (interactive.type === 'button') {
    const buttons = (Array.isArray(interactive.buttons) ? interactive.buttons : []).map((b) => ({ id: cut(b?.id, 256), title: cut(b?.title, 20) })).filter((b) => b.id && b.title);
    if (!buttons.length || buttons.length > 3 || new Set(buttons.map((b) => b.id)).size !== buttons.length) return null;
    return { to, type: 'interactive', interactive: { type: 'button', body: { text: body }, action: { buttons: buttons.map((b) => ({ type: 'reply', reply: b })) } } };
  }
  if (interactive.type === 'list') {
    const rows = (Array.isArray(interactive.rows) ? interactive.rows : []).map((r) => ({ id: cut(r?.id, 200), title: cut(r?.title, 24), ...(r?.description ? { description: cut(r.description, 72) } : {}) })).filter((r) => r.id && r.title);
    if (!rows.length || rows.length > 10 || new Set(rows.map((r) => r.id)).size !== rows.length) return null;
    return { to, type: 'interactive', interactive: { type: 'list', body: { text: body }, action: { button: cut(interactive.button || 'Ver opções', 20), sections: [{ title: 'Opções', rows }] } } };
  }
  return null;
}
// Para canais sem botão (Uazapi/Evolution): as opções vão numeradas no texto.
export function interactiveAsText(message, interactive) {
  const items = interactive?.type === 'button' ? interactive.buttons : interactive?.type === 'list' ? interactive.rows : null;
  if (!Array.isArray(items) || !items.length) return message;
  return `${message}\n\n${items.map((x, i) => `${i + 1}) ${x.title}`).join('\n')}`;
}

// v85 (12/11/2026) — modelo com espaçamento (pedido da Dra.: o aviso num parágrafo só ficava "frio").
// A Meta não aceita quebra de linha dentro de variável; por isso o espaçamento fica no próprio modelo e o texto
// é repartido em título / primeira linha / restante. Devolve null quando o aviso não tem 3 linhas (aí sai o modelo antigo).
export const PROACTIVE_TEMPLATE_V2 = 'aviso_escritorio_sf_v2';
const oneLine = (v, max) => {
  let s = String(v ?? '').replace(/[*_~`]/g, '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return s;
};
export function splitForTemplateV2(message) {
  let lines = String(message ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => oneLine(l, 2000)).filter(Boolean);
  if (lines.length && /^(ol[áa]|oi|bom dia|boa tarde|boa noite)(?=[\s,!.]|$)[^.!?]{0,40}[.!?,]?$/i.test(lines[0])) lines = lines.slice(1);
  if (lines.length < 3) return null;
  let title = lines[0].replace(/^(?:\S{1,3}\s*)?LEXOFFICE\s*[•\-–—:|]\s*/i, '').replace(/[.:!\s]+$/, '').trim();
  if (!title) return null;
  if (title === title.toUpperCase() && /[A-ZÀ-Ý]/.test(title)) title = title.charAt(0) + title.slice(1).toLowerCase();
  const first = oneLine(lines[1], 300), rest = oneLine(lines.slice(2).join(' '), 600);
  title = oneLine(title, 60);
  if (!title || !first || !rest) return null;
  return { title, first, rest };
}
export function buildTemplatePayloadV2(to, name, message) {
  const parts = splitForTemplateV2(message);
  if (!parts) return null;
  return {
    to,
    type: 'template',
    template: {
      name: PROACTIVE_TEMPLATE_V2,
      language: { code: PROACTIVE_TEMPLATE_LANG },
      components: [{ type: 'body', parameters: [firstName(name), parts.title, parts.first, parts.rest].map((text) => ({ type: 'text', text })) }],
    },
  };
}

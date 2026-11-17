export function officialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['jus.br','planalto.gov.br','camara.leg.br','senado.leg.br']
      .some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
  } catch { return false; }
}

export function extractResearchSources(content) {
  const sources = new Map();
  for (const block of content || []) {
    if (block.type !== 'text') continue;
    for (const citation of block.citations || []) {
      if (citation.type === 'web_search_result_location' && officialUrl(citation.url)) {
        sources.set(citation.url, { url: citation.url, title: citation.title, excerpt: citation.cited_text });
      }
    }
  }
  return [...sources.values()];
}

export function renderCitations(content) {
  return (content || []).filter(block => block.type === 'text').map(block => {
    const references = (block.citations || []).map(citation => {
      if (citation.type === 'web_search_result_location' && officialUrl(citation.url))
        return citation.url;
      if (Number.isInteger(citation.document_index)) {
        return 'Documento ' + (citation.document_index + 1) +
          (citation.start_page_number ? ', página ' + citation.start_page_number : '');
      }
      return null;
    }).filter(Boolean);
    return block.text + (references.length ? '\nFontes: ' + [...new Set(references)].join(' | ') : '');
  }).join('\n\n');
}

// A generated report cannot infer that no work was done from missing workflow data.
export function prepareClientReportText(content) {
  return renderCitations(content).replace(/(?:Nenhuma dessas medidas está (?:concluída ou aprovada|decidida)[^.]*|Essas providências ainda não foram executadas nem aprovadas)\./gi,
    'As providências propostas dependem de revisão da advogada.');
}

// No deadline has been professionally validated by this generation endpoint.
export function prepareDraftForReview(text) {
  return String(text).split(/\n\s*\n/).map(paragraph=>
    /(?:confirma-se|comprova-se|resta comprovada|estrita)\s+(?:a\s+)?(?:sua\s+)?tempestividade|protocolada nesta data|prazo[^\n]*no mínimo em/i.test(paragraph)
      ? '[CONFERIR INTIMAÇÃO E CONTAGEM ANTES DO PROTOCOLO. A tempestividade não foi validada por este gerador.]'
      : paragraph
  ).join('\n\n');
}

export function parseResearchPlan(text) {
  const marker='PESQUISA_PUBLICA_JSON:';
  const suffix=String(text).slice(String(text).indexOf(marker)+marker.length);
  if(!String(text).includes(marker))throw new Error('Plano de pesquisa ausente.');
  const start=suffix.indexOf('{');let depth=0,quoted=false,escaped=false;
  for(let i=start;i>=0&&i<Math.min(suffix.length,start+16000);i++){
    const c=suffix[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(suffix.slice(start,i+1));
  }
  throw new Error('Plano de pesquisa incompleto.');
}

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

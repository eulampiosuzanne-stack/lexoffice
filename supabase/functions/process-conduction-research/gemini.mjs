import {officialUrl} from './sources.mjs';
export function geminiParts(content) {
  return content.map(block=>{
    if(block.type==='text')return{text:block.text};
    if(block.type==='document'&&block.source?.type==='text')return{text:block.source.data};
    if(block.source?.type==='base64')return{inlineData:{mimeType:block.source.media_type,data:block.source.data}};
    throw new Error('Documento incompatível com a leitura alternativa.');
  });
}
export function groundedContent(candidate, resolved) {
  const text=(candidate?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
  if(!text)throw new Error('O Gemini retornou uma resposta vazia.');
  const metadata=candidate.groundingMetadata||{};
  const citations=[];
  for(const support of metadata.groundingSupports||[]){
    for(const index of support.groundingChunkIndices||[]){
      const web=metadata.groundingChunks?.[index]?.web;
      const url=resolved.get(web?.uri)||web?.uri;
      if(officialUrl(url))citations.push({type:'web_search_result_location',url,title:web.title,cited_text:support.segment?.text||''});
    }
  }
  return[{type:'text',text,citations}];
}
export async function resolveGroundedUrl(uri, fetcher=fetch) {
  if(officialUrl(uri))return uri;
  let url;
  try{url=new URL(uri);}catch{return null;}
  if(url.protocol!=='https:'||url.hostname!=='vertexaisearch.cloud.google.com'||!url.pathname.startsWith('/grounding-api-redirect/'))return null;
  const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});
  const location=response.headers.get('location');
  return location&&officialUrl(location)?location:null;
}

export function selectGeminiModel(models) {
 const candidates=models.filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')&&/^models\/gemini-\d+(?:\.\d+)?-flash$/.test(m.name));
 return candidates.sort((a,b)=>Number(b.name.match(/gemini-([\d.]+)/)[1])-Number(a.name.match(/gemini-([\d.]+)/)[1]))[0]?.name;
}

export function geminiErrorMessage(data,status) {
 const details=data?.error?.details||[];
 const violations=details.flatMap(d=>d.violations||[]);
 const daily=violations.find(v=>/PerDay/i.test(v.quotaId||''));
 if(status===429&&daily)return 'A cota diária da API Gemini foi atingida'+(daily.quotaValue?' ('+daily.quotaValue+' solicitações por dia)':'')+'. Amplie a cota do projeto Google ou aguarde sua renovação. Nenhum texto incompleto foi liberado.';
 if(status===429)return 'A API Gemini atingiu um limite temporário de uso. Aguarde antes de tentar novamente. Nenhum texto incompleto foi liberado.';
 return 'O Gemini não concluiu a operação (HTTP '+status+'). Nenhum texto incompleto foi liberado.';
}

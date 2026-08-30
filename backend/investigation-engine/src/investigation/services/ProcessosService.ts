export class ProcessosService {
  static async consultar(documento: string): Promise<any> {
    const doc=documento.replace(/\D/g,'');
    const apiKey=(process.env.DATAJUD_API_KEY||'').trim();
    const endpoint=(process.env.DATAJUD_SEARCH_URL||'').trim();
    if(!apiKey||!endpoint)throw new Error('DataJud não configurado para pesquisa por documento.');
    const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`APIKey ${apiKey}`},body:JSON.stringify({query:{match:{id_documento_pesquisa:doc}},size:20})});
    if(!res.ok)throw new Error(`DataJud respondeu ${res.status}`);
    const data:any=await res.json();
    return (data?.hits?.hits||[]).map((hit:any)=>({numero:hit?._source?.numeroProcesso||null,tribunal:hit?._source?.tribunal||null,classe:hit?._source?.classe?.nome||'Indefinida',fonte:'DataJud'}));
  }
}

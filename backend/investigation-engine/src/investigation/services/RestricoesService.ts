export class RestricoesService {
  static async consultar(documento: string): Promise<any> {
    const doc=documento.replace(/\D/g,'');
    const base=(process.env.CREDIT_BUREAU_URL||process.env.SERASA_API_URL||'').trim();
    const token=(process.env.SERASA_API_KEY||'').trim();
    if(!base||!token)throw new Error('Provedor de crédito não configurado.');
    const res=await fetch(base.replace('{documento}',encodeURIComponent(doc)),{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
    if(!res.ok)throw new Error(`Provedor de crédito respondeu ${res.status}`);
    const data:any=await res.json();
    return {score_credito:data?.Score??data?.score??null,total_protestos:data?.ResumoProtestos?.Quantidade??data?.protestos??0,total_negativacoes:data?.ResumoNegativacoes?.Quantidade??data?.negativacoes??0,fonte:'bureau_contratado'};
  }
}

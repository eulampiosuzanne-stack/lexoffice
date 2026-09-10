export class TelefoneService {
  static async consultar(documento: string): Promise<any> {
    const doc = documento.replace(/\D/g, '');
    if(doc.length===14){
      const res=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`,{headers:{Accept:'application/json'}});
      if(!res.ok)throw new Error(`BrasilAPI CNPJ/contatos respondeu ${res.status}`);
      const data:any=await res.json();
      const telefones=[data?.ddd_telefone_1,data?.ddd_telefone_2].filter(Boolean).map((numero:string)=>({numero,tipo:'TELEFONE EMPRESARIAL',whatsapp:null}));
      const emails=[data?.email].filter(Boolean);
      return {telefones,emails,fonte:'BrasilAPI / Receita Federal'};
    }
    const base = (process.env.BIGDATACORP_CONTACT_URL || '').trim();
    const token = (process.env.BIGDATACORP_TOKEN || '').trim();
    if (!base || !token) throw new Error('BigDataCorp não configurada.');
    const res = await fetch(base.replace('{documento}', encodeURIComponent(doc)), {headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
    if (!res.ok) throw new Error(`BigDataCorp respondeu ${res.status}`);
    const data:any = await res.json();
    return {
      telefones:(data?.Telefones||data?.telefones||[]).map((t:any)=>({numero:t?.numero||[t?.DDD,t?.Numero].filter(Boolean).join(' '),tipo:t?.Tipo||t?.tipo||'CELULAR',whatsapp:Boolean(t?.HasWhatsApp??t?.whatsapp)})),
      emails:(data?.Emails||data?.emails||[]).map((e:any)=>e?.Email||e?.email||e).filter(Boolean), fonte:'bureau_contratado'
    };
  }
}

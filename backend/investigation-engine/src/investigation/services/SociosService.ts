export class SociosService {
  static async consultar(documento: string): Promise<any> {
    const doc=documento.replace(/\D/g,'');
    if(doc.length!==14)return {socios:[],grupo_economico:[],fonte:'não_aplicável_para_cpf'};
    const res=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`,{headers:{Accept:'application/json'}});
    if(!res.ok)throw new Error(`BrasilAPI CNPJ/QSA respondeu ${res.status}`);
    const data:any=await res.json();
    const socios=(data?.qsa||[]).map((s:any)=>({
      nome:s?.nome_socio||null, documento:s?.cnpj_cpf_do_socio||null, vinculo:s?.qualificacao_socio||null,
      tipo:s?.identificador_de_socio===1?'Pessoa jurídica':s?.identificador_de_socio===2?'Pessoa física':s?.identificador_de_socio===3?'Estrangeiro':null,
      faixa_etaria:s?.faixa_etaria||null, data_entrada:s?.data_entrada_sociedade||null, pais:s?.pais||null,
      representante_legal:s?.nome_representante_legal||null, cpf_representante_legal:s?.cpf_representante_legal||null,
      qualificacao_representante:s?.qualificacao_representante_legal||null
    }));
    return {socios,grupo_economico:[],fonte:'BrasilAPI / Receita Federal'};
  }
}

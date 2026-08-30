export class SociosService {
  static async consultar(documento: string): Promise<any> {
    const doc=documento.replace(/\D/g,'');
    if(doc.length!==14)return {socios:[],grupo_economico:[],fonte:'não_aplicável_para_cpf'};
    const res=await fetch(`https://publica.cnpj.ws/cnpj/${doc}`);
    if(!res.ok)throw new Error(`CNPJ.ws respondeu ${res.status}`);
    const data:any=await res.json();
    return {socios:(data?.socios||[]).map((s:any)=>({nome:s?.nome||null,documento:s?.cnpj_cpf_do_socio||null,vinculo:s?.qualificacao_socio?.descricao||null})),grupo_economico:[],fonte:'CNPJ.ws'};
  }
}

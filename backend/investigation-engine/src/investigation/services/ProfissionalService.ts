export class ProfissionalService {
  static async consultar(documento: string): Promise<any> {
    const doc=documento.replace(/\D/g,'');
    const base=(process.env.BIGDATACORP_PROFESSIONAL_URL||'').trim();
    const token=(process.env.BIGDATACORP_TOKEN||'').trim();
    if(!base||!token)throw new Error('Provedor profissional não configurado.');
    const res=await fetch(base.replace('{documento}',encodeURIComponent(doc)),{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
    if(!res.ok)throw new Error(`Provedor profissional respondeu ${res.status}`);
    const data:any=await res.json();
    const r=data?.RegistroClasse||data?.registroClasse||data?.registro||{};
    return {conselho:r?.NomeOrgao||r?.nomeOrgao||null,inscricao:r?.NumeroInscricao||r?.numeroInscricao||null,uf:r?.UF||r?.uf||null,status:r?.StatusInscricao||r?.status||null,fonte:'bureau_contratado'};
  }
}

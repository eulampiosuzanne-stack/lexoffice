export class TelefoneService {
  static async consultar(documento: string): Promise<any> {
    const doc = documento.replace(/\D/g, '');
    const base = (process.env.BIGDATACORP_CONTACT_URL || '').trim();
    const token = (process.env.BIGDATACORP_TOKEN || '').trim();
    if (!base || !token) throw new Error('BigDataCorp não configurada.');
    const res = await fetch(base.replace('{documento}', encodeURIComponent(doc)), {headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
    if (!res.ok) throw new Error(`BigDataCorp respondeu ${res.status}`);
    const data:any = await res.json();
    return {
      telefones:(data?.Telefones||data?.telefones||[]).map((t:any)=>({numero:t?.numero||[t?.DDD,t?.Numero].filter(Boolean).join(' '),tipo:t?.Tipo||t?.tipo||'CELULAR',whatsapp:Boolean(t?.HasWhatsApp??t?.whatsapp)})),
      emails:(data?.Emails||data?.emails||[]).map((e:any)=>e?.Email||e?.email||e).filter(Boolean),
      fonte:'bureau_contratado'
    };
  }
}

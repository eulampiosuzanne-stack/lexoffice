export class CadastroService {
  static async consultar(documento: string): Promise<any> {
    const doc = documento.replace(/\D/g, '');
    if (![11, 14].includes(doc.length)) throw new Error('CPF/CNPJ inválido.');

    if (doc.length === 14) {
      const res = await fetch(`https://publica.cnpj.ws/cnpj/${doc}`);
      if (!res.ok) throw new Error(`CNPJ.ws respondeu ${res.status}`);
      const data: any = await res.json();
      const e = data?.estabelecimento || {};
      return {
        status: 'Sucesso',
        razao_social: data?.razao_social || null,
        situacao: e?.situacao_cadastral || null,
        data_abertura: e?.data_inicio_atividade || null,
        endereco: [e?.tipo_logradouro, e?.logradouro, e?.numero, e?.bairro, e?.cidade?.nome, e?.estado?.sigla].filter(Boolean).join(' '),
        fonte: 'CNPJ.ws'
      };
    }

    const base = (process.env.ASSERTIVA_CPF_URL || '').trim();
    const token = (process.env.ASSERTIVA_TOKEN || '').trim();
    if (!base || !token) throw new Error('Provedor de CPF não configurado. Defina ASSERTIVA_CPF_URL e ASSERTIVA_TOKEN.');
    const url = base.replace('{documento}', encodeURIComponent(doc));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Provedor CPF respondeu ${res.status}`);
    const data: any = await res.json();
    return {
      status: 'Sucesso',
      nome: data?.nome || data?.name || null,
      situacao: data?.situacaoCpf || data?.situacao || null,
      data_nascimento: data?.dataNascimento || data?.birthDate || null,
      endereco: data?.enderecoPrincipal || data?.address || null,
      fonte: 'bureau_contratado'
    };
  }
}

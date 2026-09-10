export class CadastroService {
  static async consultar(documento: string): Promise<any> {
    const doc = documento.replace(/\D/g, '');
    if (![11, 14].includes(doc.length)) throw new Error('CPF/CNPJ inválido.');

    if (doc.length === 14) {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, {headers:{Accept:'application/json'}});
      if (!res.ok) throw new Error(`BrasilAPI CNPJ respondeu ${res.status}`);
      const data:any = await res.json();
      return {
        status:'Sucesso', cnpj:data?.cnpj||doc, razao_social:data?.razao_social||null,
        nome_fantasia:data?.nome_fantasia||null, situacao:data?.descricao_situacao_cadastral||data?.situacao_cadastral||null,
        data_abertura:data?.data_inicio_atividade||null, natureza_juridica:data?.natureza_juridica||null,
        porte:data?.porte||data?.descricao_porte||null, capital_social:data?.capital_social??null,
        matriz_filial:data?.descricao_identificador_matriz_filial||null,
        cnae_principal:{codigo:data?.cnae_fiscal??null,descricao:data?.cnae_fiscal_descricao||null},
        cnaes_secundarios:data?.cnaes_secundarios||[], simples_nacional:data?.opcao_pelo_simples??null, mei:data?.opcao_pelo_mei??null,
        endereco:{logradouro:[data?.descricao_tipo_de_logradouro,data?.logradouro].filter(Boolean).join(' '),numero:data?.numero||null,complemento:data?.complemento||null,bairro:data?.bairro||null,cep:data?.cep?String(data.cep):null,municipio:data?.municipio||null,uf:data?.uf||null,codigo_ibge:data?.codigo_municipio_ibge??null},
        telefone_1:data?.ddd_telefone_1||null, telefone_2:data?.ddd_telefone_2||null, email:data?.email||null,
        fonte:'BrasilAPI / Receita Federal'
      };
    }

    const base = (process.env.ASSERTIVA_CPF_URL || '').trim();
    const token = (process.env.ASSERTIVA_TOKEN || '').trim();
    if (!base || !token) throw new Error('Provedor de CPF não configurado. Defina ASSERTIVA_CPF_URL e ASSERTIVA_TOKEN.');
    const url = base.replace('{documento}', encodeURIComponent(doc));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Provedor CPF respondeu ${res.status}`);
    const data: any = await res.json();
    return {status:'Sucesso',nome:data?.nome||data?.name||null,situacao:data?.situacaoCpf||data?.situacao||null,data_nascimento:data?.dataNascimento||data?.birthDate||null,endereco:data?.enderecoPrincipal||data?.address||null,fonte:'bureau_contratado'};
  }
}

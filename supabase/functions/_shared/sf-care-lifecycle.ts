// SF Care: classificação conservadora. Nunca equivale sentença a encerramento.
export type EvidenciaJudicial = {
  id:string; tipo:"ajuizamento"|"distribuicao"|"sentenca"|"transito_julgado"|"baixa_definitiva"|"arquivamento_definitivo"|"arquivamento_provisorio"|"extincao"|"acordo_homologado"|"cumprimento_integral";
  confirmada:boolean; data:string;
};
export type PendenciasProcessuais = {
  recurso:boolean; execucao:boolean; cumprimento_sentenca:boolean;
  obrigacao_pendente:boolean; providencia_escritorio:boolean;
};
export type ClassificacaoSF = "ativo"|"revisao_encerramento"|"encerrado_confirmado";
export function classificarProcessoSF(
  evidencias:EvidenciaJudicial[], pendencias:PendenciasProcessuais,
  encerramentoValidadoPelaAdvogada=false,
):{status:ClassificacaoSF; motivos:string[]} {
  const confirmadas=evidencias.filter(e=>e.confirmada&&Number.isFinite(Date.parse(e.data)));
  const pendentes=Object.entries(pendencias).filter(([,v])=>v).map(([k])=>k);
  if(pendentes.length)return {status:"ativo",motivos:pendentes};
  const tipos=new Set(confirmadas.map(e=>e.tipo));
  const definitivas=["baixa_definitiva","arquivamento_definitivo","cumprimento_integral"];
  const indicios=["sentenca","transito_julgado","extincao","acordo_homologado"];
  if(encerramentoValidadoPelaAdvogada&&definitivas.some(t=>tipos.has(t as EvidenciaJudicial["tipo"])))
    return {status:"encerrado_confirmado",motivos:["evidencia_definitiva","validacao_juridica"]};
  if([...definitivas,...indicios].some(t=>tipos.has(t as EvidenciaJudicial["tipo"])))
    return {status:"revisao_encerramento",motivos:["confirmacao_juridica_pendente"]};
  return {status:"ativo",motivos:[]};
}
export function podeComunicarProcessoSF(status:ClassificacaoSF, categoria:string):boolean {
  if(status==="ativo")return true;
  return categoria==="encerramento_final"&&status==="encerrado_confirmado";
}
export type ProvidenciaBastidores = {id:string;process_id:string;realizada_em:string;descricao:string;confirmada:boolean};
export function bastidoresVerificados(processId:string, providencias:ProvidenciaBastidores[]):ProvidenciaBastidores[] {
  return providencias.filter(p=>p.process_id===processId&&p.confirmada&&p.descricao.trim().length>0&&Number.isFinite(Date.parse(p.realizada_em)));
}
export function ajuizamentoConfirmado(processId:string,evidencias:EvidenciaJudicial[]):EvidenciaJudicial|null {
  return evidencias.find(e=>e.tipo==="ajuizamento"&&e.confirmada&&Number.isFinite(Date.parse(e.data)))||null;
}

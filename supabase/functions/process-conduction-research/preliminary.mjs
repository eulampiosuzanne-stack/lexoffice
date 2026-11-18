export const preliminaryContext = "MINUTA PRELIMINAR SEM LEITURA DOS AUTOS. Foram fornecidos somente cadastro, movimentações resumidas, orientações da advogada e eventual estudo do juízo. Não declare leitura integral, acesso a documentos, prova, teor completo de decisão ou fato que não conste desses registros. O estudo do juízo não prova fatos deste caso. Use [PREENCHER / CONFERIR NOS AUTOS] para lacunas e identifique alegações como alegações. Prepare a estrutura da peça solicitada para revisão, sem inventar conteúdo nem afirmar aptidão para protocolo. Pesquisa pública serve apenas para conferir normas e teses abstratas; não suprime os autos.";
export function markPreliminaryDraft(text) {
  return "MINUTA PRELIMINAR — AUTOS NÃO LIDOS\nPara revisão da advogada. Elaborada com os registros disponíveis; conferir fatos, provas, decisão, representação e prazos antes de protocolar.\n\n" + text;
}
export function caseFileMode(documents, mode) {
  const missing = !documents?.length;
  return { preliminary: missing && mode !== "client_report", blocked: missing && mode === "client_report" };
}

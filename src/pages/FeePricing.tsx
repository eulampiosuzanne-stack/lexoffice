import PetitionAssistant from './PetitionAssistant';

/**
 * A antiga tela de precificação manual foi substituída pela Central de
 * Estratégia Processual. A análise jurídica é o núcleo do fluxo:
 * caso + provas -> diagnóstico -> parecer -> documentos faltantes ->
 * cálculos/jurisprudência -> petição. A precificação comercial deve nascer
 * desse diagnóstico, e não de dezenas de campos manuais.
 */
export default function FeePricing(){
  return <PetitionAssistant />;
}

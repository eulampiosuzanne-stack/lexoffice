import MetaPartnerConnect from '../pages/MetaPartnerConnect';

/**
 * Camada oficial de conexão do WhatsApp Cloud API / Meta no LEXOFFICE.
 * Reaproveita o fluxo de Embedded Signup já implementado em MetaPartnerConnect
 * para evitar duplicação de credenciais, SDK e lógica de conexão.
 */
export default function ConnectMetaWhatsApp() {
  return <MetaPartnerConnect />;
}

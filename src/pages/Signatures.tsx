import LexSignPanel from './LexSignPanel';

// Central de Assinaturas: assinatura eletrônica própria do LEXOFFICE, com biometria facial (sem custo por assinatura).
export default function Signatures() {
  return (
    <div className="module">
      <div className="page-head">
        <div>
          <h1>Central de Assinaturas</h1>
          <p>Envie documentos para o cliente assinar pelo celular, com código no WhatsApp, foto do documento e selfie com prova de vida.</p>
        </div>
      </div>
      <LexSignPanel />
    </div>
  );
}

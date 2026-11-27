import LexSignPanel from './LexSignPanel';

export default function Signatures() {
  return (
    <div className="module">
      <div className="page-head">
        <div>
          <h1>Central de Assinaturas</h1>
          <p>Envie documentos para assinar pelo celular, para clientes e para quem não é cliente.</p>
        </div>
      </div>
      <LexSignPanel />
    </div>
  );
}

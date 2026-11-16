import CommunicationsSupervisor from '../components/CommunicationsSupervisor';

export default function SFCare() {
  return (
    <main className="sf-care-page" aria-label="Painel SF Care">
      <header className="ac-surface" style={{ marginBottom: 20 }}>
        <p style={{ letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 12, color: '#B28A4A' }}>Relacionamento proativo</p>
        <h1>SF Care</h1>
        <p>Gestão de mensagens, acompanhamento dos clientes e autorizações de envio.</p>
        <p>As mensagens somente seguem para a fila de envio após sua aprovação.</p>
      </header>
      <CommunicationsSupervisor />
    </main>
  );
}

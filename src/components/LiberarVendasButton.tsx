import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function LiberarVendasButton({ conversationId }: { conversationId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleClick() {
    setStatus('loading');
    setMessage('');

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      setStatus('error');
      setMessage('Sua sessão expirou. Entre novamente no LEXOFFICE.');
      return;
    }

    const { data, error } = await supabase.functions.invoke('whatsapp-release-agent', {
      body: {
        conversation_id: conversationId,
        action: 'release',
        agent_key: 'sales',
      },
    });

    if (!error && data?.ok) {
      setStatus('done');
      setMessage('Agente de Vendas liberado para esta conversa.');
      return;
    }

    setStatus('error');
    setMessage(data?.error || error?.message || 'Erro ao liberar o Agente de Vendas.');
  }

  return (
    <div className="sales-release-action">
      <button
        className="secondary"
        onClick={handleClick}
        disabled={status === 'loading' || status === 'done'}
      >
        {status === 'loading' && 'Liberando...'}
        {status === 'done' && '✅ Vendas liberado'}
        {(status === 'idle' || status === 'error') && 'Liberar Vendas para fechar contrato'}
      </button>
      {message && (
        <p style={{ fontSize: 13, color: status === 'error' ? '#e05575' : '#9aa0b0', marginTop: 6 }}>
          {message}
        </p>
      )}
    </div>
  );
}

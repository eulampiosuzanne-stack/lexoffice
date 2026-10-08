import { useState } from 'react';
import { supabase } from '../lib/supabase';

type Status = 'idle' | 'loading' | 'done' | 'error';

export function LiberarVendasButton({ conversationId }: { conversationId: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function handleClick() {
    if (!conversationId?.trim()) {
      setStatus('error');
      setMessage('Selecione uma conversa antes de encaminhar.');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
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
        setMessage('Conversa encaminhada ao Agente de Vendas. Nenhuma mensagem foi enviada ao contato.');
        return;
      }

      const reason = String(data?.error || error?.message || '');
      setStatus('error');
      if (reason.toLowerCase().includes('não está ativo')) {
        setMessage('O Agente de Vendas está desativado nas configurações do escritório.');
      } else if (reason.toLowerCase().includes('conversa não encontrada')) {
        setMessage('Não foi possível localizar esta conversa. Atualize a tela e tente novamente.');
      } else if (reason.toLowerCase().includes('sessão') || reason.toLowerCase().includes('jwt')) {
        setMessage('Sua sessão expirou. Entre novamente no LEXOFFICE.');
      } else {
        setMessage('Não foi possível encaminhar agora. Verifique a conexão e tente novamente.');
      }
    } catch {
      setStatus('error');
      setMessage('Sem conexão ou erro no servidor. A conversa não foi confirmada como encaminhada.');
    }
  }

  return (
    <div className="sales-release-action">
      <p style={{ fontSize: 16, lineHeight: 1.5, color: '#F5F1E8', margin: '0 0 10px' }}>
        Encaminha somente esta conversa ao Agente de Vendas. Não envia mensagem ao cliente nem fecha contrato.
      </p>
      <button
        className="secondary"
        onClick={handleClick}
        disabled={status === 'loading' || status === 'done'}
        style={{ width: '100%', minHeight: 52, padding: '12px 14px', fontSize: 16, fontWeight: 800 }}
      >
        {status === 'loading' && 'Encaminhando...'}
        {status === 'done' && 'Encaminhado ao Agente de Vendas'}
        {(status === 'idle' || status === 'error') && 'Encaminhar ao Agente de Vendas'}
      </button>
      {message && (
        <p
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          style={{ fontSize: 15, lineHeight: 1.5, color: status === 'error' ? '#F0C66E' : '#BDB4A6', marginTop: 8 }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

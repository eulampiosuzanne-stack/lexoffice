# LexOffice ↔ ChatGPT 24/7

## Regra central
A integração será autenticada, revogável, auditável e limitada por escopos. Nenhuma credencial de banco, service role, Z-API ou provedor será exposta ao ChatGPT.

## Escopos iniciais
- lex.dashboard.read
- lex.clients.read
- lex.processes.read
- lex.deadlines.read
- lex.calendar.read
- lex.calendar.write
- lex.finance.read
- lex.conversations.read
- lex.conversations.handoff
- lex.agents.read
- lex.audit.read
- lex.supervisor.read
- lex.supervisor.run

A primeira liberação será read-only. Escrita será habilitada progressivamente.

## Handoff humano
Estados: AI, WAITING_HUMAN e HUMAN.

Mensagem manual do operador deve imediatamente:
1. definir conversation_owner=HUMAN;
2. definir bot_ativo=false;
3. definir ai_enabled=false;
4. bloquear respostas automáticas;
5. permanecer assim até ação explícita Devolver para IA.

Não existe retomada automática apenas por terem passado 30 minutos.

WAITING_HUMAN: alerta imediato, revisão em 5 minutos e crítico em 15 minutos.

## Supervisor
Tempo real: entrada humana, pedido de intervenção, pagamento confirmado, falha de envio, audiência/prazo crítico e integração desconectada.
5 min: chatbot, handoff e mensagens presas.
15 min: WhatsApp, agentes, follow-up e filas.
30 min: agenda e lembretes.
60 min: auditoria geral.
Rotinas completas: 07:00, 10:00, 12:00, 14:00, 17:00, 17:30, 20:00 e 00:00.

## Segurança
- org_id resolvido no servidor.
- menor privilégio.
- idempotência em mutações.
- log de auditoria para toda ação relevante.
- status externo somente após confirmação do provedor.
- kill switch para suspender efeitos externos mantendo monitoramento.

## API planejada
Edge Function lex-chatgpt-api:
GET health, dashboard, clients, processes, deadlines, calendar, finance/summary, conversations/handoff, agents/health e audit.
POST controlado: calendar/events, conversations/{id}/takeover, conversations/{id}/return-to-ai e supervisor/run.

## Fases
1. leitura;
2. escrita controlada;
3. ações externas autorizadas;
4. Supervisor 24/7 completo.

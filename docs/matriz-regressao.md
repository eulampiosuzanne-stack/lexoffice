# Matriz de regressão — LEXOFFICE

Relação módulo → o que depende dele. A cada mudança, retestar as linhas afetadas.

| Módulo / tabela | Funcionalidades dependentes (retestar) |
|---|---|
| `process_movements` (insert/update) | auto-aprovação para cliente; sino do escritório (`notifications`); fila de andamentos do WhatsApp (`process_notification_queue`/bridge); recado no app (`trg_movement_to_client_app`); linha processual (`trg_case_line_after_movements`); deduplicação `process_movements_dedupe_idx` |
| `calendar_events` | regra "consulta só online"; alerta de novo agendamento para a Dra. (`enqueue_appointment_owner_alert`); lembrete WhatsApp de consulta (`appointment-reminder-worker`); recado no app (marcada/remarcada/cancelada/local); agenda do app (`client_app_calendar`); lembretes do app D-1/D-7 |
| `process_hearings` | sino do escritório; lembretes de audiência do WhatsApp; recado no app (só se não veio da agenda); agenda do app |
| `processes.status` / `client_id` | linha processual (encerramento); visibilidade no app (`is_confidential`) |
| `client_office_messages` | tela Recados do app; contador de não lidos; push (`trg_client_office_message_push`, cron `lexoffice-client-app-push`); guarda de edição pelo cliente |
| `client_push_tokens` | registro no app (`client_app_register_push`); push; desativação de token inválido |
| `client_case_steps` | telas Meu Processo e Próximos Passos (`client_app_case_line`) |
| `client_service_restrictions` | cliente restrito não recebe recados do app (só financeiro); chatbot de débito |

## Funções do app do cliente (2026-10-02)

- Publicação: `lexoffice_client_app_publish` (idempotente por origem; não chamável por anon/authenticated).
- Push: `lexoffice_client_app_push_dispatch` / `_reconcile` via pg_net → Expo. Sem push das 21h às 8h (Brasília).
- Linha processual: `lexoffice_rebuild_case_line` (10 etapas, classificação por regras sobre título + complemento DataJud).

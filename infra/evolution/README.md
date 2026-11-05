# Evolution API (LexOffice) — subir e ligar ao Supabase

1. No host (VPS/SnapDeploy): copiar esta pasta, criar `.env` a partir de `.env.example`, `docker compose up -d`.
2. Dominio HTTPS apontando para a porta 8080. Teste: GET / deve responder JSON da Evolution.
3. Criar a instancia (nome = valor de `evolution_instance_name` no Supabase, ou atualizar esse valor) e parear o 4141 por QR (aparelho conectado). Conferir `connected`.
4. Webhook da instancia: URL `https://dcpwcuototomxoiszukt.supabase.co/functions/v1/whatsapp-evolution-connect?evolution_webhook=1&token=<evolution_webhook_token>`, evento `MESSAGES_UPSERT`, `webhook_by_events=false`.
5. Supabase `system_runtime_secrets`: atualizar `evolution_api_url`, `evolution_api_key`, `evolution_instance_name` (com backup) e a linha da instancia em `whatsapp_evolution_instances` (connected/ativa); depois `whatsapp_provider=evolution`.
6. Teste real: mensagem de numero que nao seja o 5096 nem de cliente; conferir entrada, Helena e resposta entregue. So entao desligar a Uazapi.

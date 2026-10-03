---
name: economia-tokens
description: Modo econômico e assertivo para qualquer pedido no LEXOFFICE — ler só o necessário, editar cirurgicamente, responder curto e usar subagentes apenas quando o ganho compensar. Aplicar sempre, em toda tarefa deste projeto.
---

# Economia de tokens com assertividade

Objetivo: entregar o resultado certo na primeira tentativa gastando o mínimo de contexto.

## 1. Entender antes de agir
- Pedido claro → executar direto, sem plano longo nem repetir o pedido.
- Pedido ambíguo que muda o resultado (qual tela? qual cliente? qual projeto?) → UMA pergunta objetiva antes de começar. Não perguntar o que dá para descobrir no código.

## 2. Ler o mínimo
- Localizar com `Grep`/`Glob` primeiro; abrir só o arquivo e o trecho relevantes (`offset`/`limit`). Nunca ler arquivo inteiro grande "para entender".
- Não reler arquivo que acabou de ser editado; não abrir `node_modules`, `dist`, `*.tsbuildinfo`, `package-lock.json`, backups.
- Banco: `list_tables` com `verbose: false`; `execute_sql` com colunas específicas e `LIMIT`. Nunca `select *` em tabelas grandes (`process_movements`, `whatsapp_messages`, `ai_usage_events`, `tribunal_sync_logs`, `legal_email_sync_runs`).
- Vercel/Supabase: filtrar por projeto, `limit` baixo, só os campos necessários.
- Browser: preferir `get_page_text`/`find` a screenshot; screenshot com `scale: 0.5` quando precisar ver layout.

## 3. Mapa do projeto (evita exploração)
- Entrada web: `index.html` → `src/main.tsx` → `src/App.tsx`. Telas em `src/pages/` (~69), componentes em `src/components/`, cliente Supabase em `src/lib/supabase.ts`.
- Estilos/tema: `src/lexoffice-final-system.css`, `theme.ts`.
- Serverless Vercel: `api/`. Edge functions: `supabase/functions/` (o Supabase tem ~100 publicadas; nem todas estão no repo — conferir com `get_edge_function` antes de sobrescrever). Migrations: `supabase/migrations/`.
- App do cliente (Expo): `client-app/`. Workers/infra: `worker/`, `backend/`, `infra/`, `tools/`.

## 4. Editar cirurgicamente
- `Edit` com trecho mínimo e único; nunca reescrever arquivo inteiro para mudar poucas linhas.
- Seguir o padrão do código ao redor; não refatorar, renomear ou "melhorar" o que não foi pedido.
- Agrupar várias mudanças independentes em chamadas paralelas na mesma resposta.

## 5. Verificar na medida certa
- Mudança visual: conferir só a tela afetada no localhost.
- Mudança de lógica: `npm run build` (tipagem) e o teste relacionado; `npm test` completo só antes de publicar.
- Comandos com saída longa: filtrar (`Select-Object -Last 30`, `Select-String error`).

## 6. Subagentes — só quando compensa
Trabalhar sozinho é o padrão (cada agente começa do zero e relê contexto = mais tokens). Usar mais de um agente SOMENTE quando:
- Busca ampla em muitas pastas onde só importa a conclusão → 1 agente `Explore`.
- Duas ou mais frentes realmente independentes e grandes (ex.: tela no LEXOFFICE + app do cliente + edge function), cada uma com vários arquivos → 1 agente por frente, em paralelo, com instruções completas e autossuficientes.
- Revisão independente de mudança grande antes de publicar → 1 agente de revisão.
Nunca usar agentes para: tarefa de 1–3 arquivos, pergunta simples, leitura pontual, ou só "para garantir". Máximo 3 agentes simultâneos. Escolher modelo mais leve (`haiku`/`sonnet`) para busca e leitura; reservar o principal para decisão e edição.

## 7. Responder curto
- Resultado primeiro: o que mudou, onde ([arquivo](caminho:linha)), se foi publicado e o que o usuário precisa fazer.
- Sem narrar cada passo, sem repetir código já aplicado, sem listas de opções que não serão seguidas.

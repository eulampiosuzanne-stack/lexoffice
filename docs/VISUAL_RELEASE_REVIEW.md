# Revisão da identidade visual LexOffice 2.0

Branch preparada a partir de `main` no commit `da0665a5db04e56ea0d5af348ea1726e9912f772`, com os ajustes aprovados no Sites até `aaef70ef062a84a9c3ab12248aa2faa972b64a02`.

Inclui Design System claro/escuro, submenus laterais, reorganização dos espaços de trabalho e configurações, Cobranças, Briefing da Donna, Painel Gerencial e Relatórios. As alterações de consultas e cálculos de apresentação fazem parte dos componentes aprovados; esta entrega não é composta apenas por CSS.

## Preparação para produção

- Excluídos login simulado, adaptador local, dados fictícios, barra demonstrativa, marcadores HTML e bloqueios de rede da homologação.
- Preservados o cliente Supabase e o fluxo Google da `main`, funções de API, banco, permissões e download Android existentes.
- Compartilhamento de tokens e estilos atualizado também nas páginas que dependem do Design System.
- `git.deploymentEnabled` desativa somente o deploy automático desta branch de revisão. A configuração não desativa deploys da `main`.

## Validação e limites

Executar `npm test`, `node scripts/check-react-hooks.mjs` e `npm run build` nesta branch.

Os fluxos autenticados foram conferidos no ambiente isolado do Sites; login Google, gateways de IA, WhatsApp, pagamentos e demais integrações reais ainda precisam de validação apropriada antes da publicação. A compilação não substitui essa conferência.

Esta branch não autoriza merge na `main`, migrações de banco ou publicação na Vercel. Essas ações dependem de aprovação expressa da titular.

## Publicação aprovada em 22/10/2026

O usuário autorizou a publicação em produção. Inclui os ajustes aprovados até a homologação `4b5febddba69290bdab54853a030bd7939fb31da`: Mensagens do aplicativo, Clientes e Importação, Processos, Andamentos, Monitoramento, Audiências, Tarefas e Agenda. Login Google e cliente Supabase reais preservados; recursos demonstrativos excluídos. Checklist de preparação de audiências permanece local ao navegador e isolado por organização/usuário/audiência.

Campos e restrições de Audiências e Tarefas conferidos no catálogo do banco de produção; nenhuma migração de banco ou publicação de Edge Functions faz parte desta entrega. A função tribunal-connection-manager foi confirmada ACTIVE (versão 33) e registrada no manifesto de dependências remotas.

# Destinos principais de configuração — LexOffice homologação

A auditoria diferencia atalhos, editores duplicados e operações contextuais que legitimamente usam o mesmo recurso. Não houve alteração de esquema, permissões ou regras no backend. O inventário reproduzível está em `configuration-inventory.json`; ele cobre referências do frontend e não prova execução ou conflito em produção.

| Domínio | Destino principal | Tratamento |
|---|---|---|
| Escritório e usuários | `/configuracoes` | Abas de IA, atendimento, agenda, conexões e segurança eram apenas páginas de atalhos. Retiradas; URLs por seção redirecionam ao destino correto. |
| IA individual | `/agentes-ia` | Instruções, modelo, permissões e limites por agente. Escopo explicitado. |
| IA geral do WhatsApp | `/configuracoes/atendimento` | `whatsapp_settings`; editor retirado de Integrações. Mantida a mesma lógica de salvamento. |
| Conexões WhatsApp | `/integracoes?secao=whatsapp` | Meta, OAuth direto, conexão como parceiro, Evolution e lista de conexões reunidos em WhatsAppConnections. Campanhas passa a apontar para esse editor. |
| Provedores de IA | `/agentes-ia?area=infraestrutura` | Integrações aponta diretamente para infraestrutura, sem abrir a lista de agentes. |
| Réguas processuais/audiências | `/agentes-ia?area=automacoes&rotina=processuais` | Prompt e horário do agente client_process_updates ficam somente no editor de réguas. |
| Regras de módulos processuais | `/configuracoes/automacoes-processuais` | `process_intelligent_rules`; preservado, pois não equivale aos avisos ao cliente. |
| Provedores processuais | `/configuracoes/provedores-processuais` | Editor único; acesso exclusivo de platform_admins preservado. |
| Monitoramento | `/tribunais` | OAB, DJEN e conexões de tribunais; preservado por tratar de descoberta e captura. |
| Supervisão | `/configuracoes/fluxo-atendimento` | Controles de conversas em execução; não substitui configuração geral ou ficha do agente. |
| Acesso ao app por cliente | `/clientes/:id?secao=acesso` | Geração, revogação, convite e cartilha centralizados na ficha. Painel do aplicativo mostra leitura e link para a ficha. |
| App administrativo | `/atendimento/aplicativo` | URL própria para escritório. Resolve colisão de `/app-cliente` com o portal público ao atualizar a página. |
| Portal do cliente | `/cliente`, `/app-cliente`, `/area-do-cliente` | Entradas públicas preservadas no carregamento inicial. Atalhos internos usam o novo caminho administrativo. |
| Cobrança | `/cobranca/configuracoes` | `collection_settings`. Restrições e pagamentos são operações distintas; não foram fundidos com acesso ao app. |
| Agenda | `/agenda` | Eventos gerais e lembretes individuais. Audiências e prazos processuais têm dados próprios e não foram fundidos automaticamente. |
| Segurança | `/seguranca` | Eventos gerais em audit_logs. |
| Acessos aos processos | `/auditoria` | process_access_log; acesso ownerOnly preservado. Nome diferenciado da auditoria geral. |
| Documentos | `/documentos` | Biblioteca geral. Geração contextual por cliente e envio ao app mantidos por terem objetivos e registros distintos. |
| Comercial e contratos | `/perfil-cliente`, `/jornada-comercial`, `/financeiro/contratos` | Proposta, contratação e contrato financeiro são etapas diferentes; nenhuma informação foi migrada entre elas sem evidência de equivalência. |

## Limites e continuidade

- Múltiplas superfícies que leem/escrevem clientes, documentos, mensagens, agenda ou financeiro podem representar operações diferentes. Não remover apenas por compartilharem tabela.
- `ai_agents.is_active` e `ai_agent_policies.active` continuam sendo campos distintos no backend. A tela mantém o vínculo existente; uma migração de dados e mudança do orquestrador exigem verificação específica antes de produção.
- Regras gerais de WhatsApp, permissões individuais e controle humano por conversa são camadas distintas. Seus efeitos são explicados e seus editores têm destinos próprios; não foram unificados em um interruptor que alteraria regras de negócio.
- Esta auditoria de homologação não confirma a causa das reclamações em produção. Para isso, é necessário reproduzir um caso concreto com logs de execução e regras efetivas do backend.

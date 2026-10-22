/** Each domain has one primary configuration destination. Contextual screens link here. */
export const configurationDomains=[
 {key:'office',title:'Escritório e equipe',scope:'Dados institucionais e usuários do escritório.',path:'/configuracoes',source:'organization_settings · profiles'},
 {key:'agents',title:'Assistentes e regras individuais',scope:'Função, instruções, permissões e limites de cada agente.',path:'/agentes-ia',source:'ai_agents · ai_agent_policies'},
 {key:'service',title:'Atendimento automático no WhatsApp',scope:'Regra geral de IA, retorno ao atendimento automático e acompanhamento de contatos.',path:'/configuracoes/atendimento',source:'whatsapp_settings'},
 {key:'routines',title:'Avisos de processos e audiências',scope:'Envios proativos, lembretes e horário das duas rotinas.',path:'/agentes-ia?area=automacoes&rotina=processuais',source:'process_notification_settings'},
 {key:'connections',title:'Conexões do WhatsApp e serviços',scope:'Canais compartilhados pelo atendimento e pelas campanhas.',path:'/integracoes',source:'integration_connections · whatsapp_connections'},
 {key:'ai-connections',title:'Conexões de inteligência artificial',scope:'Credenciais e consulta da configuração dos serviços de IA.',path:'/agentes-ia?area=infraestrutura',source:'ai-provider-config · ai-provider-gateway'},
 {key:'process-rules',title:'Automações dos processos',scope:'Regras de execução de cada módulo processual.',path:'/configuracoes/automacoes-processuais',source:'process_intelligent_rules'},
 {key:'monitoring',title:'Monitoramento dos tribunais',scope:'OAB, conexões processuais e acompanhamento de publicações.',path:'/tribunais',source:'djen_monitors · tribunal-connection-manager'},
 {key:'flow',title:'Supervisão do atendimento',scope:'Conversas em curso, intervenção humana e histórico operacional.',path:'/configuracoes/fluxo-atendimento',source:'ai_conversation_controls · whatsapp_conversations'},
 {key:'collections',title:'Cobrança e restrições de atendimento',scope:'Regras de cobrança e liberação manual do atendimento financeiro.',path:'/cobranca/configuracoes',source:'collection_settings · client_service_restrictions'},
 {key:'calendar',title:'Agenda do escritório',scope:'Conexão da agenda, compromissos e lembretes individuais.',path:'/agenda',source:'calendar_events · calendar_event_reminders'},
 {key:'security',title:'Registros gerais de segurança',scope:'Eventos registrados pela aplicação. A auditoria de acessos aos processos é separada e restrita.',path:'/seguranca',source:'audit_logs'},
] as const;

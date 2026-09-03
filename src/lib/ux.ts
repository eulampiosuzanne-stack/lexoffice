export const roleLabels:Record<string,string>={owner:'Proprietário',admin:'Administrador',lawyer:'Advogado(a)',responsible_lawyer:'Advogado(a) responsável',assistant:'Assistente',finance:'Financeiro',marketing:'Marketing',supervisor:'Supervisor',support:'Atendimento',custom:'Personalizado'};
export const statusLabels:Record<string,string>={active:'Ativo',inactive:'Inativo',trial:'Teste',past_due:'Em atraso',suspended:'Suspenso',canceled:'Cancelado',cancelled:'Cancelado',completed:'Concluído',archived:'Arquivado',scheduled:'Agendado',confirmed:'Confirmado',not_configured:'Não configurado',connected:'Conectado',disconnected:'Desconectado',success:'Sucesso',synced:'Sincronizado'};
export const planLabels:Record<string,string>={starter:'Inicial',basic:'Básico',professional:'Profissional',premium:'Premium',enterprise:'Empresarial',lexoffice:'LEXOFFICE'};
export const humanize=(value:any,map:Record<string,string>)=>map[String(value??'')]||String(value??'—').replace(/_/g,' ');
export function confirmDiscard(){return window.confirm('Existem alterações não salvas. Deseja sair sem salvar?')}
export function confirmAction(message:string){return window.confirm(message)}

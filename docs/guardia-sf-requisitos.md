# Guardiã SF — requisitos obrigatórios

Este documento registra os comportamentos que NÃO podem ser esquecidos na transformação visual do LexOffice SF. O visual não pode comprometer as nove áreas existentes, os módulos estratégicos, a lógica jurídica ou os dados reais.

## Identidade
- Mascote caramelo original da referência fornecida pela proprietária, com orelhas caídas, linguinha, capa e medalha SF. O emoji provisório no menu não é a versão final.
- Movimentos curtos, discretos e não intrusivos. Opção explícita de pausar animações; respeitar prefers-reduced-motion.
- Letras grandes, contraste elevado, botões acessíveis e uso em celular.

## Eventos e reações
| Evento real | Reação visual | Ação útil |
| --- | --- | --- |
| Prazo vence hoje | Orelhas levantadas, sinal de urgência | Abrir prazo e processo correspondente |
| Prazo vence amanhã | Relógio e lembrete | Abrir providência |
| Audiência próxima | Balança e aviso | Mostrar data, horário e processo |
| Audiência hoje | Aviso prioritário | Abrir audiência |
| Novo andamento | Documento | Abrir movimentação verificada |
| Documento pendente | Pasta | Abrir pendência |
| Pagamento confirmado | Abanar rabinho, celebração breve | Abrir recebimento |
| Cliente aguardando | Balão de conversa | Abrir atendimento |
| Falha de conexão ou integração | Escudo de alerta | Abrir diagnóstico e status |
| Tarefa concluída | Pulinho breve | Abrir tarefa concluída |

## Segurança operacional
- Eventos devem vir de dados reais e autorizados, nunca de números ilustrativos.
- Alertas críticos persistem até tratamento/ciência conforme regra real do sistema, não desaparecem por causa da animação.
- A mascote não substitui notificações formais, revisão humana, confirmação de protocolo, agenda, pagamento ou canal de emergência.
- Não criar notificações duplicadas ou afirmar envio por SMS, push ou WhatsApp sem recibo.
- Proteger dados sensíveis no painel e no celular, respeitando permissões de usuário.
- Antes de publicar: testar cada gatilho, clique, permissão, comportamento offline, acessibilidade e responsividade.

## Estado
Documento de requisitos, não comprovação de que os gatilhos foram implementados. A animação inicial de saudação é apenas um protótipo.

## Momentos espontâneos de descontração (solicitação da proprietária)
- A Guardiã SF pode, ocasionalmente, correr discretamente pelo rodapé, brincar com uma bolinha dourada, tirar uma soneca, espiar atrás de um cartão, aparecer com um ossinho ou abanar o rabinho.
- Essas cenas são **lúdicas**, nunca representam eventos reais do escritório nem devem simular notificações.
- Executar em intervalos espaçados e imprevisíveis, somente quando a interface estiver ociosa e sem alertas críticos ativos; não sobrepor documentos, botões, campos, prazos ou audiências.
- Suspender brincadeiras durante digitação, leitura de peças, reuniões, apresentações e ações críticas.
- Permitir desativação independente de animações lúdicas, além de respeitar prefers-reduced-motion.
- Prioridade absoluta: prazo/audiência/alerta crítico > interação funcional > brincadeira.
- Não usar sons automáticos, flashes, movimentos excessivos nem repetição insistente.
- Testar em celular e desktop com acessibilidade.

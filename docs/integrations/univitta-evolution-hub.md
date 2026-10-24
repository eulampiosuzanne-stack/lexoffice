# Univitta Integration Hub — Evolution

Conexão da aplicação LexOffice pelo Hub: identidade Ed25519 e conexão guardadas no armazenamento restrito de backend. Nenhuma chave privada, token ou QR é incluído no repositório.

A autorização atual foi concedida em sandbox. O painel diferencia esse ambiente da aplicação consumidora publicada em produção e não ativa envios nem troca o provedor atual. Após parear, o administrador deve confirmar a liberação do ambiente para operação real e o contrato HMAC/subscrição de eventos antes da migração do tráfego.

A função existente whatsapp-evolution-connect mantém seus fluxos anteriores. Acrescenta hub_status e hub_connect depois da autenticação e autorização administrativa; o escritório deve coincidir com a identidade guardada. Tokens de 15 minutos são obtidos e usados exclusivamente no backend. O identificador da conexão e a origem do Hub não são aceitos do navegador.

Painel: Configurações → Integrações → WhatsApp e Meta → WhatsApp pelo Univitta Integration Hub. Gerar/atualizar QR Code, ler pelo WhatsApp Business em Aparelhos conectados e atualizar o estado. O pareamento isoladamente não ativa entregas nem envios.

Validação: node scripts/test-univitta-hub.mjs, node scripts/check-react-hooks.mjs e npm run build. Testes cobrem assinatura interoperável e adulteração, caminhos, QR, ambiente, organização, conexão e ausência de tokens na resposta.

Referências: https://hub.univittagroup.com.br/docs/evolution e guia atualizado fornecido pelo administrador do Hub em 24/10/2026.

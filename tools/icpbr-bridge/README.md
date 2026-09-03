# LEXOFFICE ICP-Brasil A3 Bridge

Ponte local para assinatura digital PAdES com certificado A3. A chave privada permanece no token e o PIN nunca deve ser enviado ao LEXOFFICE, Supabase ou GitHub.

## Ambiente identificado

- Windows x64
- SafeSign IC Standard 64-bits
- PKCS#11: `C:\Windows\System32\aetpkss1.dll`
- Certificado ICP-Brasil AC OAB G3 reconhecido pelo Windows

## Contrato local planejado

O frontend conversa somente com `http://127.0.0.1:17681`.

- `GET /health` — estado da ponte, token e versão.
- `GET /certificates` — lista apenas metadados públicos dos certificados disponíveis (subject, issuer, serial, validade e fingerprint), sem chave privada.
- `POST /sign/pades` — recebe um PDF, fingerprint do certificado e configuração do selo visual; devolve o PDF PAdES assinado.

## Segurança obrigatória

1. Bind somente em loopback (`127.0.0.1`), nunca `0.0.0.0`.
2. CORS limitado aos domínios oficiais do LEXOFFICE em produção e localhost em desenvolvimento.
3. O PIN é solicitado localmente no processo de assinatura e nunca persiste em arquivo, log, banco ou requisição ao backend remoto.
4. A operação criptográfica usa PKCS#11/SafeSign; a chave privada não é exportada do token.
5. O PDF assinado deve ser validado antes do upload de volta ao LEXOFFICE.
6. O selo visual é aparência da assinatura; a validade é dada pela assinatura criptográfica PAdES.

## Selo visual padrão

- `Assinado digitalmente por <nome do certificado>`
- `Certificado ICP-Brasil`
- Emissor do certificado
- Data/hora da assinatura
- Identificador/fingerprint abreviado

## Motor

A implementação Java deve usar Demoiselle Signer com política PAdES e cadeia ICP-Brasil, conectando ao SafeSign por PKCS#11. Antes de distribuir o executável, validar o PDF de teste em validador ICP-Brasil e Adobe Acrobat Reader.


## Certificado em nuvem (Certisign remoteID / DesktopID)

A partir da versao 1.4.0 a ponte tambem suporta certificado em nuvem (ex.: Certisign remoteID, usado via o aplicativo DesktopID). Nesse caso o Windows enxerga o certificado como se fosse um certificado comum instalado no repositorio "Pessoal" do usuario, entao a ponte acessa ele pelo keystore nativo do Windows (Windows-MY, via provider SunMSCAPI) em vez do PKCS#11 usado para token fisico A3.

A variavel de ambiente LEXOFFICE_KEYSTORE_TYPE controla o modo. O valor WINDOWS-MY (padrao nos scripts start-windows.bat e run-bridge.bat atuais) usa o certificado em nuvem via DesktopID: o PIN e o codigo dinamico do app da Certisign sao pedidos pelo proprio Windows/DesktopID na hora de assinar, e a ponte nunca ve nem pede essas informacoes. O valor PKCS11 e o modo antigo, para quem ainda usa token fisico A3 com o SafeSign.

Pre-requisito: o DesktopID da Certisign precisa estar aberto e com o certificado sincronizado, aparecendo na lista de Certificados do proprio DesktopID, antes de iniciar a ponte.

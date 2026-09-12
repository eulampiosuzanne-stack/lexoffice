# LEXOFFICE ICP-Brasil A3 Bridge

Aplicação local do LEXOFFICE para aplicar a assinatura digital da Dra. Suzanne em um PDF que já foi assinado eletronicamente pelo cliente.

> A assinatura do cliente e a assinatura A3 são assinaturas distintas. O A3 da advogada não transforma a assinatura eletrônica do cliente em ICP-Brasil.

## Ambiente Windows previsto

- Windows x64
- SafeSign IC Standard 64 bits
- Java 8 64 bits
- PKCS#11 SafeSign: `C:\Windows\System32\aetpkss1.dll`
- Certificado A3 ICP-Brasil em token físico

## O que a versão 2.0.0 faz

A ponte escuta exclusivamente em `127.0.0.1:17681` e expõe:

- `GET /health` — diagnóstico sem acessar a chave privada.
- `GET /challenge` — gera nonce aleatório, temporário e de uso único.
- `GET /certificates` — exige nonce e exibe somente metadados públicos dos certificados com chave privada disponível no token.
- `POST /sign/pades` — exige nonce, recebe o PDF e o fingerprint do certificado selecionado e devolve uma nova versão do PDF assinada.

O motor de assinatura usa Demoiselle Signer e a política **ICP-Brasil PAdES AD-RB 1.3**, OID `2.16.76.1.7.1.11.1.3`. O PDF é assinado com a chave privada do token via PKCS#11 e, antes de ser devolvido ao navegador, a ponte verifica localmente a assinatura CMS/PAdES, o certificado utilizado, o ByteRange do PDF e a presença da política esperada.

## PIN e chave privada

O PIN é solicitado somente por uma janela local no Windows. O navegador, o LEXOFFICE, o Supabase, o GitHub e a Vercel nunca recebem o PIN.

A ponte:

- não grava PIN em arquivo;
- não coloca PIN em logs;
- sobrescreve o array de caracteres do PIN após a operação;
- não exporta a chave privada;
- não aceita PFX/P12 pelo navegador;
- não transmite a chave privada para nenhum serviço remoto.

## Proteções da API local

- bind exclusivo em `127.0.0.1`;
- validação do `Host` do loopback;
- CORS restrito aos domínios autorizados do LEXOFFICE e localhost de desenvolvimento;
- suporte ao preflight de Private Network Access (`Access-Control-Allow-Private-Network`);
- nonce/challenge temporário e consumido no primeiro uso;
- limite de tamanho para o PDF recebido;
- auditoria local sem segredo em `%LOCALAPPDATA%\LEXOFFICE\icpbr-bridge-audit.log`.

## Selo visual

O selo visual é opcional e informa, no mínimo:

- que o documento foi assinado digitalmente;
- nome do signatário extraído do certificado;
- ICP-Brasil;
- data/hora local da assinatura.

O selo é apenas representação visual. A validade da assinatura depende da assinatura criptográfica PAdES e do certificado ICP-Brasil.

## Compilar

No diretório `tools/icpbr-bridge`:

```text
mvn clean package
```

O resultado é `target/lexoffice-icpbr-bridge.jar`.

O workflow `.github/workflows/build-icpbr-bridge.yml` compila em `windows-latest` com Temurin Java 8 e publica o artefato **LEXOFFICE-ICP-Brasil-A3-Windows**, contendo:

- `lexoffice-icpbr-bridge.jar`
- `INICIAR-LEXOFFICE-ICP.bat`
- `LEIA-ME.txt`

Para o token físico SafeSign, o arquivo que deve ser executado no Windows é **`INICIAR-LEXOFFICE-ICP.bat`**. Ele configura `LEXOFFICE_KEYSTORE_TYPE=PKCS11` e aponta para `C:\Windows\System32\aetpkss1.dll`.

## Teste físico obrigatório

Build/CI não substitui o teste com o token físico. O fluxo só deve ser considerado operacional depois de:

1. iniciar `INICIAR-LEXOFFICE-ICP.bat` no Windows;
2. o LEXOFFICE detectar `/health`;
3. listar o certificado correto usando o PIN somente na janela local;
4. assinar um PDF de teste que já contenha a assinatura do cliente;
5. a ponte retornar `X-Lexoffice-Validation: valid` e a política esperada;
6. o LEXOFFICE arquivar uma nova versão, sem sobrescrever o PDF do cliente;
7. conferir a assinatura final também em ferramenta externa adequada à validação ICP-Brasil/PAdES.

## Certificado em nuvem

O código preserva o modo opcional `LEXOFFICE_KEYSTORE_TYPE=WINDOWS-MY` para certificados que o Windows exponha pelo repositório pessoal/SunMSCAPI. O pacote destinado ao cenário atual da Dra. Suzanne usa **PKCS#11 + SafeSign + A3 físico** por padrão.

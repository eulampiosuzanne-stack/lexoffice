# LEXOFFICE — Conector TJMG MNI / PJe / eproc

Status: PREPARAÇÃO TÉCNICA — não habilitado em produção

## Objetivo
Preparar o LEXOFFICE para a interoperabilidade oficial com o TJMG, sem scraping, sem automação de MFA e sem uso de credenciais pessoais fora dos mecanismos oficialmente fornecidos pelo Tribunal.

## Escopo institucional
- Tribunal: TJMG
- Sistemas-alvo: PJe e eproc
- Padrão informado pelo suporte do TJMG para PJe 1º Grau: MNI 2.2.0.4.31_p000pp
- Homologação: aguardando fornecimento oficial de endpoints, WSDL, autenticação, certificados/credenciais técnicas e regras de teste pelo TJMG.
- eproc: implementação mantida separada até o TJMG informar o padrão e a interface oficiais aplicáveis.

## Arquitetura

### 1. Camada `tjmg-mni-connector`
Responsável exclusivamente pelo transporte MNI/SOAP com o ambiente autorizado do TJMG.

Configuração futura por secrets/backend:
- `TJMG_MNI_ENV=homologation|production`
- `TJMG_MNI_WSDL_URL`
- `TJMG_MNI_ENDPOINT`
- `TJMG_MNI_AUTH_MODE`
- referências de certificados/credenciais técnicas conforme orientação oficial

Nenhum segredo deverá ser persistido no frontend ou no repositório.

### 2. Adaptador de domínio
O XML/SOAP recebido será convertido para objetos internos do LEXOFFICE antes de qualquer persistência.

Fluxo:
`TJMG -> MNI/SOAP -> parser/validação -> normalizador LEXOFFICE -> processos/andamentos/documentos/comunicações`

### 3. Isolamento de provedores
O MNI não substituirá o DataJud. Os provedores terão responsabilidades distintas:
- DataJud: dados públicos/disponíveis pelo serviço oficial já integrado.
- TJMG MNI/PJe: interoperabilidade institucional autenticada conforme convênio e permissões concedidas pelo Tribunal.
- TJMG eproc: conector próprio, ativado somente após especificação oficial.

### 4. Segurança
- Nunca armazenar senha pessoal, código TOTP, seed TOTP ou PIN de certificado em código/configuração frontend.
- Não automatizar CAPTCHA/MFA nem contornar controles de acesso.
- Toda consulta deve respeitar organização, usuário profissional e permissões efetivamente concedidas pelo TJMG.
- Processos sigilosos somente poderão ser tratados se o mecanismo oficial retornar o conteúdo para a identidade profissional autorizada.
- Registrar auditoria de sincronização sem gravar segredos.

### 5. Operações
As operações MNI efetivamente habilitadas serão definidas pelo WSDL e documentação fornecidos pelo TJMG. O conector deverá ser orientado pelo contrato oficial, não por endpoints presumidos.

Estrutura prevista:
- consulta de processo;
- consulta de movimentações/comunicações;
- obtenção de teor/documentos quando autorizada;
- confirmação/registro de eventos somente se previsto e homologado;
- health check e diagnóstico do conector.

### 6. Estados da integração
`awaiting_agreement` -> `awaiting_homologation_credentials` -> `homologation_configured` -> `homologation_testing` -> `homologated` -> `production_configured` -> `active`

O frontend não deve exibir “Conectado” enquanto um teste real no ambiente correspondente não tiver sucesso.

## Próximo marco
Assim que o TJMG enviar a resposta ao ofício e disponibilizar ambiente de homologação, registrar:
1. URL do WSDL/endpoint;
2. versão exata do contrato MNI;
3. mecanismo oficial de autenticação;
4. certificados/credenciais técnicas exigidos;
5. operações permitidas ao escritório;
6. massa/regras de teste;
7. critérios de homologação;
8. especificação de integração do eproc.

Somente então ativar o transporte real e executar testes E2E.

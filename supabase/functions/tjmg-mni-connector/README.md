# tjmg-mni-connector

Conector seguro do LEXOFFICE para a futura homologação TJMG/MNI.

## Estado atual
`awaiting_homologation_credentials`

O conector NÃO executa chamadas externas enquanto o TJMG não fornecer os parâmetros oficiais. Isso evita endpoints, credenciais ou contratos SOAP presumidos.

## Parâmetros esperados
- `TJMG_MNI_ENV`
- `TJMG_MNI_WSDL_URL`
- `TJMG_MNI_ENDPOINT`
- `TJMG_MNI_AUTH_MODE`
- demais secrets/certificados que o TJMG efetivamente exigir na homologação

## Segurança
A Edge Function deve ser publicada com `verify_jwt=true`. A função também valida o usuário e resolve `profiles.org_id`, impedindo chamadas anônimas e preparando isolamento por organização.

## Ativação
1. Receber formalização/orientação do TJMG.
2. Receber WSDL/endpoint e método oficial de autenticação.
3. Validar contrato MNI exato.
4. Configurar secrets no backend.
5. Implementar envelope/parser conforme o WSDL real.
6. Testar somente em homologação.
7. Registrar evidências dos testes.
8. Ativar produção somente após homologação/autorização.

## eproc
Não reutilizar automaticamente o transporte PJe. O eproc terá adaptador próprio se o TJMG fornecer interface ou contrato distinto.

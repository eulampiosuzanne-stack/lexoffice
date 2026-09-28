# Suzanne Figueiredo - Aplicativo do Cliente

Aplicativo móvel iOS/Android do escritório. A marca pública é **Suzanne Figueiredo Advocacia e Soluções Jurídicas**. LexOffice permanece apenas como backoffice.

## Rodar
1. `npm install`
2. copiar `.env.example` para `.env`
3. preencher URL e anon key do Supabase
4. `npm start`

## Segurança
O app usa autenticação Supabase. O vínculo entre auth.users e clients é feito em client_app_accounts. Processos e movimentações são lidos por RPCs security-definer que validam auth.uid(); movimentações só aparecem quando approved_for_client=true e is_sensitive=false. Recados, checklist e etapas possuem RLS por client_id.

## Publicação
Usar EAS Build/Submit após homologação. Bundle IDs já reservados no app.json, mas publicação exige contas Apple/Google da titular.

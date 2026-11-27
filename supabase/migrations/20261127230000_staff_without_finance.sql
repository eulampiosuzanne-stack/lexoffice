-- Perfil "Profissional do escritório" (assistant): sem honorários, cobrança, quitação e faturamento.
create or replace function public.lex_finance_blocked()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role_key = 'assistant');
$$;
revoke all on function public.lex_finance_blocked() from public, anon;
grant execute on function public.lex_finance_blocked() to authenticated, service_role;

create or replace function public.lex_is_money_document(p_text text)
returns boolean language sql immutable as $$
  select coalesce(p_text, '') ~* '(contrat|honor|acordo|recibo|quita|proposta|comprovante|cobran|pagament|parcel|boleto|financ|nota fiscal)';
$$;

do $$
declare t text;
begin
  foreach t in array array['collection_messages','collection_negotiations','collection_schedule','collection_settings',
    'commercial_proposal_followups','commercial_proposal_workspace','commercial_proposals','extraordinary_service_fees',
    'fee_contracts','fee_installments','fee_proposals','financial_entries','financial_entry_payments','financial_settings',
    'infinitepay_charges','infinitepay_charge_items','infinitepay_settings','infinitepay_subscriptions','payment_links',
    'payment_receipts','generated_documents']
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'lex_staff_no_finance') then
      execute format('create policy lex_staff_no_finance on public.%I as restrictive for all to authenticated using (not public.lex_finance_blocked()) with check (not public.lex_finance_blocked())', t);
    end if;
  end loop;
end $$;

create policy lex_staff_no_money_documents on public.documents as restrictive for select to authenticated
  using (not public.lex_finance_blocked() or not public.lex_is_money_document(coalesce(category, '') || ' ' || coalesce(name, '')));
create policy lex_staff_no_money_signatures on public.signature_requests as restrictive for select to authenticated
  using (not public.lex_finance_blocked() or not public.lex_is_money_document(title));

-- Painel de devedores: quem pagou ou está em atraso não aparece para a equipe.
do $$
declare d text := pg_get_functiondef('public.lex_debtors_panel'::regproc);
begin
  if position('lex_finance_blocked' in d) = 0 then
    d := replace(d, 'not public.can_access_office_operational_data(org)', 'not public.can_access_office_operational_data(org) or public.lex_finance_blocked()');
    if position('lex_finance_blocked' in d) = 0 then raise exception 'lex_debtors_panel: trecho nao encontrado'; end if;
    execute d;
  end if;
end $$;

-- Esta tabela estava aberta a qualquer pessoa; passa a ser só do servidor.
alter policy collection_negotiations_service_all on public.collection_negotiations to service_role;

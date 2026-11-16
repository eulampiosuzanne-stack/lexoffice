create schema if not exists finance_private;
revoke all on schema finance_private from public;
grant usage on schema finance_private to authenticated;

create function finance_private.manage_fee_contract(
  contract_id uuid, action text, method text, payment_notes text
) returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  contract public.fee_contracts%rowtype;
  entry public.financial_entries%rowtype;
  received numeric;
  balance numeric;
  settled numeric := 0;
  paid_time timestamptz := now();
begin
  select c.* into contract from public.fee_contracts c
    where c.id = contract_id and c.owner_user_id = actor and c.org_id = public.current_org_id()
    for update;
  if not found then
    raise exception 'Contrato indisponível para esta conta.';
  end if;

  if action = 'complete' then
    if contract.status = 'completed' then return 0; end if;
    update public.fee_contracts c set status = 'completed', updated_at = paid_time
      where c.id = contract.id and c.status = 'active';
    if not found then raise exception 'Somente contratos ativos podem ser marcados como cumpridos.'; end if;
    return 0;
  end if;

  if action is null or action not in ('delete', 'settle') then
    raise exception 'Ação inválida.';
  end if;

  perform 1 from public.financial_entries e where e.contract_id = contract.id order by e.id for update;
  perform 1 from public.fee_installments i where i.contract_id = contract.id order by i.id for update;

  if exists (select 1 from public.financial_entries e where e.contract_id = contract.id
      and (e.org_id, e.owner_user_id) is distinct from (contract.org_id, actor))
    or exists (select 1 from public.fee_installments i where i.contract_id = contract.id
      and (i.org_id, i.owner_user_id) is distinct from (contract.org_id, actor)) then
    raise exception 'Os vínculos financeiros deste contrato precisam de revisão.';
  end if;

  if exists (select 1 from public.infinitepay_charges c where c.contract_id = contract.id
      and (action = 'delete' or c.status = 'active'))
    or exists (select 1 from public.infinitepay_subscriptions s where s.contract_id = contract.id
      and (action = 'delete' or s.status in ('pending', 'active', 'paused'))) then
    raise exception 'Revise a cobrança ou assinatura vinculada na InfinitePay antes de continuar.';
  end if;

  if action = 'delete' then
    if contract.status = 'completed'
      or exists (select 1 from public.fee_installments i where i.contract_id = contract.id
        and (i.status in ('paid', 'partial') or i.paid_amount > 0 or i.paid_at is not null))
      or exists (select 1 from public.financial_entries e where e.contract_id = contract.id
        and (e.status in ('paid', 'partial') or e.paid_at is not null
          or exists (select 1 from public.financial_entry_payments p where p.financial_entry_id = e.id))) then
      raise exception 'Este contrato tem histórico de pagamento ou foi marcado como cumprido.';
    end if;
    delete from public.financial_entries e where e.contract_id = contract.id;
    delete from public.fee_contracts c where c.id = contract.id;
    return 0;
  end if;

  if contract.status in ('awaiting_success', 'draft', 'cancelled', 'renegotiated') then
    raise exception 'Este contrato ainda não tem honorários elegíveis para quitação.';
  end if;
  if nullif(btrim(method), '') is null then raise exception 'Informe a forma de pagamento.'; end if;

  for entry in select e.* from public.financial_entries e
    where e.contract_id = contract.id and e.type = 'income' and e.status in ('pending','partial','overdue')
    order by e.id
  loop
    select coalesce(sum(p.amount), 0) into received
      from public.financial_entry_payments p where p.financial_entry_id = entry.id;
    if entry.installment_id is not null then
      select greatest(received, i.paid_amount) into received
        from public.fee_installments i where i.id = entry.installment_id and i.contract_id = contract.id
          and i.status not in ('cancelled', 'renegotiated');
      if not found then raise exception 'A parcela vinculada precisa de revisão.'; end if;
    end if;
    balance := greatest(0, entry.amount - received);
    if balance > 0 then
      insert into public.financial_entry_payments
        (org_id, owner_user_id, financial_entry_id, client_id, amount, payment_method, notes, paid_at, registered_by)
        values (contract.org_id, actor, entry.id, entry.client_id, balance, method, payment_notes, paid_time, actor);
      settled := settled + balance;
    end if;
    update public.financial_entries e set status = 'paid', paid_at = coalesce(e.paid_at, paid_time), updated_at = paid_time where e.id = entry.id;
    update public.fee_installments i set status = 'paid', paid_amount = greatest(i.paid_amount, entry.amount),
      payment_method = method, paid_at = coalesce(i.paid_at, paid_time), updated_at = paid_time where i.id = entry.installment_id;
    update public.collection_schedule s set status = 'cancelled', updated_at = paid_time
      where (s.financial_entry_id = entry.id or s.installment_id = entry.installment_id)
        and s.status in ('pending','pending_approval','awaiting_approval','ready','failed');
  end loop;
  return settled;
end;
$$;

revoke all on function finance_private.manage_fee_contract(uuid, text, text, text) from public;
grant execute on function finance_private.manage_fee_contract(uuid, text, text, text) to authenticated;

create function public.manage_fee_contract(p_contract_id uuid, p_action text, p_method text default null, p_notes text default null)
returns numeric language sql security invoker set search_path = ''
as $$ select finance_private.manage_fee_contract(p_contract_id, p_action, p_method, p_notes); $$;

revoke all on function public.manage_fee_contract(uuid, text, text, text) from public, anon;
grant execute on function public.manage_fee_contract(uuid, text, text, text) to authenticated;

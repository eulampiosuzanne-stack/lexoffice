-- "Registrar êxito" gravava status inexistente ('success_triggered') e lançava R$ 0,00 em contrato por percentual.
create or replace function public.activate_success_fee_contract_v2(p_contract_id uuid, p_obtained numeric, p_due_date date default current_date)
returns jsonb language plpgsql security invoker set search_path = '' as $f$
declare
  v_org uuid := public.current_org_id();
  v_user uuid := auth.uid();
  c public.fee_contracts%rowtype;
  v_amount numeric(14,2);
  v_installment uuid;
  v_entry uuid;
  v_due date := coalesce(p_due_date, current_date);
  v_title text;
begin
  if v_org is null or v_user is null then raise exception 'Sessão inválida.'; end if;
  select * into c from public.fee_contracts where id = p_contract_id and org_id = v_org and owner_user_id = v_user for update;
  if not found then raise exception 'Contrato não encontrado.'; end if;
  if c.payment_model <> 'success_fee' then raise exception 'Este contrato não é de honorários de êxito.'; end if;
  if c.status <> 'awaiting_success' then raise exception 'O êxito deste contrato já foi registrado.'; end if;
  if exists(select 1 from public.financial_entries where contract_id = c.id and org_id = v_org and status <> 'cancelled') then
    raise exception 'Já existe uma cobrança para este contrato.';
  end if;
  if c.success_fee_percent is null then raise exception 'Contrato sem percentual de êxito.'; end if;
  if p_obtained is null or p_obtained <= 0 then raise exception 'Informe o valor obtido pelo cliente.'; end if;
  v_amount := round(p_obtained * c.success_fee_percent / 100, 2);
  if v_amount <= 0 then raise exception 'O valor dos honorários ficou zerado. Confira o valor informado.'; end if;
  v_title := c.title || ' • Honorários de êxito';

  insert into public.fee_installments(org_id,contract_id,client_id,process_id,installment_number,description,original_amount,due_date,status)
  values (v_org,c.id,c.client_id,c.process_id,1,v_title,v_amount,v_due,'pending') returning id into v_installment;
  insert into public.financial_entries(org_id,client_id,process_id,contract_id,installment_id,type,category,description,amount,due_date,status,created_by)
  values (v_org,c.client_id,c.process_id,c.id,v_installment,'income','Honorários de êxito',v_title,v_amount,v_due,'pending',v_user) returning id into v_entry;
  update public.fee_contracts set status='active', total_amount=v_amount, first_due_date=v_due,
    notes = concat_ws(' | ', notes, 'Êxito registrado em ' || to_char(current_date,'DD/MM/YYYY') || ' sobre valor obtido de ' || p_obtained::text),
    updated_at = now()
  where id = c.id;
  return jsonb_build_object('ok',true,'amount',v_amount,'financial_entry_id',v_entry,'due_date',v_due);
end $f$;
revoke all on function public.activate_success_fee_contract_v2(uuid,numeric,date) from public, anon;
grant execute on function public.activate_success_fee_contract_v2(uuid,numeric,date) to authenticated;

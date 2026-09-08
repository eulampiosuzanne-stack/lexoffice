-- Honorários de êxito: o contrato não gera contas a receber até o êxito ser registrado.
-- Aplicado em produção e mantido aqui para preservar o histórico do schema.

create or replace function public.create_fee_contract_with_financial_entries_v2(
  p_client_id uuid,
  p_title text,
  p_service_description text,
  p_total_amount numeric,
  p_payment_model text,
  p_down_payment_amount numeric default 0,
  p_down_payment_date date default null,
  p_installments_count integer default 1,
  p_first_due_date date default null,
  p_due_day integer default null,
  p_process_id uuid default null,
  p_notes text default null
) returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_org uuid := public.current_org_id();
  v_user uuid := auth.uid();
  v_contract uuid;
  v_installment uuid;
  v_total numeric(14,2) := round(coalesce(p_total_amount,0)::numeric,2);
  v_entry numeric(14,2) := round(coalesce(p_down_payment_amount,0)::numeric,2);
  v_remaining numeric(14,2);
  v_each numeric(14,2);
  v_last numeric(14,2);
  v_due date;
  v_count integer := greatest(coalesce(p_installments_count,1),1);
  i integer;
  v_created integer := 0;
begin
  if v_org is null or v_user is null then raise exception 'Sessão inválida.'; end if;
  if p_client_id is null then raise exception 'Selecione o cliente.'; end if;
  if not exists(select 1 from public.clients c where c.id=p_client_id and c.org_id=v_org) then raise exception 'Cliente não pertence ao escritório desta sessão.'; end if;
  if p_process_id is not null and not exists(select 1 from public.processes p where p.id=p_process_id and p.org_id=v_org and (p.client_id is null or p.client_id=p_client_id)) then raise exception 'Processo inválido para este cliente.'; end if;
  if v_total <= 0 then raise exception 'Informe um valor total válido.'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'Informe o título do contrato.'; end if;
  if p_payment_model not in ('cash','installments','down_payment_installments','success_fee') then raise exception 'Forma de pagamento inválida.'; end if;

  if p_payment_model='cash' then v_count := 1; v_entry := 0; end if;
  if p_payment_model in ('installments','success_fee') then v_entry := 0; end if;
  if p_payment_model='down_payment_installments' and (v_entry <= 0 or v_entry >= v_total) then raise exception 'A entrada deve ser maior que zero e menor que o valor total.'; end if;
  if p_payment_model not in ('cash','success_fee') and p_first_due_date is null then raise exception 'Informe o primeiro vencimento.'; end if;
  if p_due_day is not null and (p_due_day < 1 or p_due_day > 31) then raise exception 'Dia de vencimento inválido.'; end if;

  insert into public.fee_contracts(org_id,client_id,process_id,responsible_id,title,service_description,total_amount,payment_model,down_payment_amount,installments_count,first_due_date,due_day,notes,status,signed_at,created_by)
  values(v_org,p_client_id,p_process_id,v_user,trim(p_title),nullif(trim(coalesce(p_service_description,'')),''),v_total,p_payment_model,v_entry,v_count,p_first_due_date,p_due_day,p_notes,case when p_payment_model='success_fee' then 'awaiting_success' else 'active' end,now(),v_user)
  returning id into v_contract;

  if p_payment_model='success_fee' then
    return jsonb_build_object('contract_id',v_contract,'financial_entries_created',0,'awaiting_success',true);
  elsif p_payment_model='cash' then
    v_due := coalesce(p_first_due_date,current_date);
    insert into public.fee_installments(org_id,contract_id,client_id,process_id,installment_number,description,original_amount,due_date,status)
    values(v_org,v_contract,p_client_id,p_process_id,1,trim(p_title),v_total,v_due,'pending') returning id into v_installment;
    insert into public.financial_entries(org_id,client_id,process_id,contract_id,installment_id,type,category,description,amount,due_date,status,created_by)
    values(v_org,p_client_id,p_process_id,v_contract,v_installment,'income','Honorários contratuais',trim(p_title),v_total,v_due,'pending',v_user);
    v_created := 1;
  else
    if v_entry > 0 then
      v_due := coalesce(p_down_payment_date,current_date);
      insert into public.fee_installments(org_id,contract_id,client_id,process_id,installment_number,description,original_amount,due_date,status)
      values(v_org,v_contract,p_client_id,p_process_id,0,trim(p_title)||' • Entrada',v_entry,v_due,'pending') returning id into v_installment;
      insert into public.financial_entries(org_id,client_id,process_id,contract_id,installment_id,type,category,description,amount,due_date,status,created_by)
      values(v_org,p_client_id,p_process_id,v_contract,v_installment,'income','Honorários contratuais',trim(p_title)||' • Entrada',v_entry,v_due,'pending',v_user);
      v_created := v_created + 1;
    end if;
    v_remaining := round((v_total-v_entry)::numeric,2);
    v_each := trunc((v_remaining/v_count)*100)/100;
    v_last := round((v_remaining-(v_each*(v_count-1)))::numeric,2);
    for i in 1..v_count loop
      v_due := (p_first_due_date + ((i-1)||' month')::interval)::date;
      if p_due_day is not null then
        v_due := make_date(extract(year from v_due)::int,extract(month from v_due)::int,least(p_due_day,extract(day from (date_trunc('month',v_due)+interval '1 month - 1 day'))::int));
      end if;
      insert into public.fee_installments(org_id,contract_id,client_id,process_id,installment_number,description,original_amount,due_date,status)
      values(v_org,v_contract,p_client_id,p_process_id,i,trim(p_title)||format(' • Parcela %s/%s',i,v_count),case when i=v_count then v_last else v_each end,v_due,'pending') returning id into v_installment;
      insert into public.financial_entries(org_id,client_id,process_id,contract_id,installment_id,type,category,description,amount,due_date,status,created_by)
      values(v_org,p_client_id,p_process_id,v_contract,v_installment,'income','Honorários contratuais',trim(p_title)||format(' • Parcela %s/%s',i,v_count),case when i=v_count then v_last else v_each end,v_due,'pending',v_user);
      v_created := v_created + 1;
    end loop;
  end if;
  return jsonb_build_object('contract_id',v_contract,'financial_entries_created',v_created,'awaiting_success',false);
end;
$function$;

create or replace function public.activate_success_fee_contract(
  p_contract_id uuid,
  p_due_date date default current_date
) returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_org uuid := public.current_org_id();
  v_user uuid := auth.uid();
  v_contract public.fee_contracts%rowtype;
  v_installment uuid;
  v_entry uuid;
  v_due date := coalesce(p_due_date,current_date);
begin
  if v_org is null or v_user is null then raise exception 'Sessão inválida.'; end if;
  select * into v_contract from public.fee_contracts
   where id=p_contract_id and org_id=v_org and owner_user_id=v_user
   for update;
  if not found then raise exception 'Contrato não encontrado.'; end if;
  if v_contract.payment_model <> 'success_fee' then raise exception 'Este contrato não é de honorários de êxito.'; end if;
  if v_contract.status <> 'awaiting_success' then raise exception 'O êxito deste contrato já foi registrado.'; end if;
  if exists(select 1 from public.financial_entries where contract_id=v_contract.id and org_id=v_org and owner_user_id=v_user) then
    raise exception 'Já existe uma cobrança para este contrato.';
  end if;

  insert into public.fee_installments(org_id,contract_id,client_id,process_id,installment_number,description,original_amount,due_date,status)
  values(v_org,v_contract.id,v_contract.client_id,v_contract.process_id,1,v_contract.title||' • Honorários de êxito',v_contract.total_amount,v_due,'pending')
  returning id into v_installment;

  insert into public.financial_entries(org_id,client_id,process_id,contract_id,installment_id,type,category,description,amount,due_date,status,created_by)
  values(v_org,v_contract.client_id,v_contract.process_id,v_contract.id,v_installment,'income','Honorários de êxito',v_contract.title||' • Honorários de êxito',v_contract.total_amount,v_due,'pending',v_user)
  returning id into v_entry;

  update public.fee_contracts set status='success_triggered',first_due_date=v_due,updated_at=now()
   where id=v_contract.id and org_id=v_org and owner_user_id=v_user;

  return jsonb_build_object('ok',true,'contract_id',v_contract.id,'financial_entry_id',v_entry,'amount',v_contract.total_amount,'due_date',v_due);
end;
$function$;

revoke all on function public.create_fee_contract_with_financial_entries_v2(uuid,text,text,numeric,text,numeric,date,integer,date,integer,uuid,text) from public, anon;
grant execute on function public.create_fee_contract_with_financial_entries_v2(uuid,text,text,numeric,text,numeric,date,integer,date,integer,uuid,text) to authenticated;

revoke all on function public.activate_success_fee_contract(uuid,date) from public, anon;
grant execute on function public.activate_success_fee_contract(uuid,date) to authenticated;
notify pgrst, 'reload schema';

alter table public.fee_contracts add column if not exists movable_sale_percent numeric;
do $$ begin
  alter table public.fee_contracts add constraint fee_contracts_movable_sale_percent_check
  check (movable_sale_percent is null or (movable_sale_percent >= 0 and movable_sale_percent <= 100));
exception when duplicate_object then null;
end $$;

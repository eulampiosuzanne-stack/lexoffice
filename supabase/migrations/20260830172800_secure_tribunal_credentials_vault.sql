alter table public.tribunal_connections add column if not exists credential_secret_id uuid;

create or replace function public.store_tribunal_connection_secret(
  p_org_id uuid,
  p_connection_id uuid,
  p_secret_value text
) returns uuid
language plpgsql
security definer
set search_path = 'public', 'vault'
as $$
declare
  v_secret_id uuid;
  v_exists boolean;
begin
  if p_org_id is null or p_connection_id is null or coalesce(p_secret_value,'') = '' then
    raise exception 'Dados obrigatórios ausentes';
  end if;

  select true, credential_secret_id
    into v_exists, v_secret_id
  from public.tribunal_connections
  where id = p_connection_id and org_id = p_org_id
  for update;

  if not coalesce(v_exists,false) then
    raise exception 'Conexão do tribunal não encontrada';
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret_value,
      'lexoffice_tribunal_' || p_connection_id::text,
      'LEXOFFICE tribunal credential',
      null
    );
  else
    perform vault.update_secret(v_secret_id, p_secret_value, null, null, null);
  end if;

  update public.tribunal_connections
     set credential_secret_id = v_secret_id,
         updated_at = now()
   where id = p_connection_id and org_id = p_org_id;

  return v_secret_id;
end;
$$;

revoke all on function public.store_tribunal_connection_secret(uuid,uuid,text) from public;
revoke all on function public.store_tribunal_connection_secret(uuid,uuid,text) from anon;
revoke all on function public.store_tribunal_connection_secret(uuid,uuid,text) from authenticated;
grant execute on function public.store_tribunal_connection_secret(uuid,uuid,text) to service_role;

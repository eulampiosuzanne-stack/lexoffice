create function public.save_client_intake_submission(p_link_id uuid, p_data jsonb, p_files jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  link public.client_intake_links%rowtype;
  form public.clients%rowtype;
  saved_id uuid;
begin
  select * into link from public.client_intake_links
    where id = p_link_id and used_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'intake_link_unavailable' using errcode = 'P0001'; end if;
  form := jsonb_populate_record(null::public.clients, p_data);

  if link.client_id is null then
    insert into public.clients (org_id, owner_user_id, name, cpf_cnpj, rg, birth_date, gender,
      mother_name, marital_status, profession, phone, whatsapp, email, status, notes, address)
    values (link.org_id, link.owner_user_id, form.name, form.cpf_cnpj, form.rg, form.birth_date, form.gender,
      form.mother_name, form.marital_status, form.profession, form.phone, form.whatsapp, form.email,
      'active', form.notes, form.address)
    returning id into saved_id;
  else
    update public.clients set
      name = form.name, cpf_cnpj = form.cpf_cnpj, rg = form.rg, birth_date = form.birth_date,
      gender = form.gender, mother_name = form.mother_name, marital_status = form.marital_status,
      profession = form.profession, phone = form.phone, whatsapp = form.whatsapp, email = form.email,
      notes = coalesce(form.notes, notes), address = form.address, updated_at = now()
    where id = link.client_id and org_id = link.org_id
    returning id into saved_id;
    if not found then raise exception 'intake_client_unavailable' using errcode = 'P0001'; end if;
  end if;

  insert into public.documents (org_id, owner_user_id, client_id, name, file_path, mime_type,
    size_bytes, category, notes, uploaded_by)
  select link.org_id, link.owner_user_id, saved_id, f.name, f.file_path, f.mime_type,
    f.size_bytes, 'Documento do cliente', 'Prova enviada pelo formulário cadastral', link.owner_user_id
  from jsonb_to_recordset(p_files) as f(name text, file_path text, mime_type text, size_bytes bigint);

  update public.client_intake_links set client_id = saved_id, used_at = now() where id = link.id;
  return saved_id;
end;
$$;
revoke all on function public.save_client_intake_submission(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_client_intake_submission(uuid,jsonb,jsonb) to service_role;

-- Avisos do Escavador por e-mail sem conteúdo: não vão ao cliente nem aparecem nas telas (continuam no banco).
create or replace function public.lex_movement_is_noise(p_source text, p_title text, p_description text)
returns boolean language sql immutable as $$
  select coalesce(p_source,'') = 'escavador_email'
     and (coalesce(p_title,'') || ' ' || coalesce(p_description,'')) ~* '(em seus monitoramentos|escavador\.com/(email|assets))'
$$;
create or replace function public.lex_flag_noise_movement()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.lex_movement_is_noise(new.source, new.title, new.description) then
    new.is_sensitive := true; new.approved_for_client := false;
  end if;
  return new;
end $$;
create trigger trg_zz_flag_noise_movement before insert or update on public.process_movements for each row execute function public.lex_flag_noise_movement();
update public.process_movements set approved_for_client = false, is_sensitive = true where public.lex_movement_is_noise(source, title, description);
create policy process_movements_hide_noise on public.process_movements as restrictive for select to authenticated
  using (not public.lex_movement_is_noise(source, title, description));

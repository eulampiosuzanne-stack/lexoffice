create or replace function public.whatsapp_conversation_set_attendance_state()
returns trigger language plpgsql set search_path = public as $$
declare v text; t text[];
begin
  begin
    v := public.attendance_state_of(new.bot_ativo, new.conversation_owner, new.human_takeover_reason, new.owner_agent_key);
    if v is not null then
      new.attendance_state := v;
    elsif new.attendance_state in ('humano_ativo','pausado_seguranca','aguardando_humano') then
      new.attendance_state := 'novo_atendimento';
    elsif new.attendance_state is null and tg_op='INSERT' then
      new.attendance_state := 'novo_atendimento';
    end if;
    t := array_remove(array_remove(array_remove(coalesce(new.tags,array[]::text[]),'pendencia:aguardando_humano'::text),'atendimento:humano_ativo'::text),'seguranca:bloqueio_vigia'::text);
    if new.attendance_state = 'aguardando_humano' then t := array_append(t, 'pendencia:aguardando_humano'::text);
    elsif new.attendance_state = 'humano_ativo' then t := array_append(t, 'atendimento:humano_ativo'::text);
    elsif new.attendance_state = 'pausado_seguranca' then t := array_append(t, 'seguranca:bloqueio_vigia'::text);
    end if;
    new.tags := t;
  exception when others then raise warning 'whatsapp_conversation_set_attendance_state: %', sqlerrm; end;
  return new;
end $$;

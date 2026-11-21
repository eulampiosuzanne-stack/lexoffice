-- Catálogo §19: estado do atendimento (separado do funil comercial e das etiquetas). Aditivo.
alter table public.whatsapp_conversations add column if not exists attendance_state text;
alter table public.whatsapp_conversations drop constraint if exists whatsapp_conversations_attendance_state_check;
alter table public.whatsapp_conversations add constraint whatsapp_conversations_attendance_state_check check (attendance_state is null or attendance_state in (
  'novo_atendimento','helena','escolha_chatbot','aguardando_cliente','aguardando_providencia','aguardando_humano','aguardando_advogada','humano_ativo','pausado_seguranca','concluido'));

create or replace function public.attendance_state_of(p_bot boolean, p_owner text, p_reason text, p_agent text)
returns text language sql immutable as $$
  select case
    when coalesce(p_bot,true)=false or p_owner='HUMAN' then
      case
        when coalesce(p_reason,'') in ('operator_whatsapp_message','manual_operator_message','internal_team') then 'humano_ativo'
        when coalesce(p_reason,'') in ('automated_sender_no_ai','watchdog_loop') or coalesce(p_reason,'') ilike '%vigia%' then 'pausado_seguranca'
        else 'aguardando_humano'
      end
    when p_agent is not null then 'helena'
    else null
  end
$$;

create or replace function public.whatsapp_conversation_set_attendance_state()
returns trigger language plpgsql set search_path = public as $$
declare v text;
begin
  begin
    v := public.attendance_state_of(new.bot_ativo, new.conversation_owner, new.human_takeover_reason, new.owner_agent_key);
    if v is not null then
      new.attendance_state := v;
    elsif new.attendance_state in ('humano_ativo','pausado_seguranca','aguardando_humano') then
      new.attendance_state := 'novo_atendimento';   -- humano/pausa terminou
    elsif new.attendance_state is null and tg_op='INSERT' then
      new.attendance_state := 'novo_atendimento';
    end if;
  exception when others then raise warning 'whatsapp_conversation_set_attendance_state: %', sqlerrm; end;
  return new;
end $$;

drop trigger if exists trg_zz_whatsapp_conversation_attendance_state on public.whatsapp_conversations;
create trigger trg_zz_whatsapp_conversation_attendance_state
  before insert or update of bot_ativo, conversation_owner, human_takeover_reason, owner_agent_key on public.whatsapp_conversations
  for each row execute function public.whatsapp_conversation_set_attendance_state();

-- Leitura sem backfill: estado salvo, ou o derivado dos campos atuais (conversas antigas).
create or replace view public.whatsapp_conversations_attendance with (security_invoker = true) as
  select c.id, c.org_id,
         coalesce(c.attendance_state, public.attendance_state_of(c.bot_ativo, c.conversation_owner, c.human_takeover_reason, c.owner_agent_key), 'novo_atendimento') as attendance_state
    from public.whatsapp_conversations c;

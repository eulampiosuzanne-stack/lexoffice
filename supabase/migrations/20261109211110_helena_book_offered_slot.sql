create or replace function public.helena_book_offered_slot(
  p_org uuid, p_conversation uuid, p_start timestamptz, p_offered_at bigint,
  p_client uuid, p_lead uuid, p_responsible uuid, p_policy uuid,
  p_title text, p_description text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_context jsonb;
  v_slot jsonb;
  v_event uuid;
  v_previous jsonb;
  v_end timestamptz := p_start + interval '1 hour';
begin
  perform pg_advisory_xact_lock(hashtext(p_org::text || ':consultation_calendar'));
  select coalesce(chatbot_context, '{}'::jsonb) into v_context
  from public.whatsapp_conversations
  where id=p_conversation and org_id=p_org and bot_ativo is true
    and coalesce(conversation_owner,'') <> 'HUMAN' and human_takeover_at is null
  for update;
  if not found or v_context->>'offered_at' is distinct from p_offered_at::text
    or p_offered_at is null or p_offered_at < extract(epoch from now() - interval '72 hours') * 1000
    or p_start is null or p_start <= now() then
    return jsonb_build_object('status','expired');
  end if;
  if not exists(select 1 from public.ai_agent_policies where id=p_policy and org_id=p_org
    and active is true and appointment_booking is true
    and coalesce(policy->>'calendar_approval_required','false') <> 'true'
    and coalesce(policy->>'approval_required','false') <> 'true')
    or not exists(select 1 from public.profiles where id=p_responsible and org_id=p_org and status='active') then
    return jsonb_build_object('status','not_allowed');
  end if;
  if (p_client is not null and not exists(select 1 from public.clients where id=p_client and org_id=p_org))
    or (p_client is null and not exists(select 1 from public.payment_receipts where lead_id=p_lead and org_id=p_org)) then
    return jsonb_build_object('status','not_allowed');
  end if;
  select value into v_slot from jsonb_array_elements(
    case when jsonb_typeof(v_context->'offered_slots')='array' then v_context->'offered_slots' else '[]'::jsonb end
  ) where (value->>'iso')::timestamptz=p_start limit 1;
  if v_slot is null then return jsonb_build_object('status','expired'); end if;
  v_previous := v_context->'last_booking';
  if v_previous->>'offered_at'=p_offered_at::text and exists(
    select 1 from public.calendar_events where id=(v_previous->>'id')::uuid and org_id=p_org
      and status='scheduled' and starts_at>now()
  ) then return v_previous || jsonb_build_object('status','booked'); end if;
  if exists(select 1 from public.calendar_events where org_id=p_org
    and status is distinct from 'cancelled'
    and (
      (event_type='hearing' and (starts_at at time zone 'America/Sao_Paulo')::date=(p_start at time zone 'America/Sao_Paulo')::date)
      or (event_type is distinct from 'deadline' and not coalesce(all_day,false)
        and starts_at < v_end and coalesce(ends_at, starts_at + interval '1 hour') > p_start)
    )
  ) then return jsonb_build_object('status','unavailable'); end if;
  insert into public.calendar_events(
    org_id,client_id,title,description,event_type,priority,starts_at,ends_at,status,meeting_mode,
    owner_user_id,responsible_id,ai_agent_policy_id
  ) values (
    p_org,p_client,p_title,p_description,'meeting','normal',p_start,v_end,'scheduled','online',
    p_responsible,p_responsible,p_policy
  ) returning id into v_event;
  v_previous := jsonb_build_object('id',v_event,'label',v_slot->>'label','who',v_slot->>'who','offered_at',p_offered_at);
  update public.whatsapp_conversations set chatbot_context=v_context || jsonb_build_object('last_booking',v_previous),
    updated_at=now() where id=p_conversation and org_id=p_org;
  return v_previous || jsonb_build_object('status','booked');
end
$$;
revoke all on function public.helena_book_offered_slot(uuid,uuid,timestamptz,bigint,uuid,uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.helena_book_offered_slot(uuid,uuid,timestamptz,bigint,uuid,uuid,uuid,uuid,text,text) to service_role;

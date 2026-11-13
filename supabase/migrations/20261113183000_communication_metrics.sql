create function public.communication_metrics(p_org uuid, p_since timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with received as (
    select conversation_id, min(created_at) as first_in
    from public.whatsapp_messages
    where org_id=p_org and direction='inbound' and created_at>=p_since
    group by conversation_id
  ), responses as (
    select r.*, reply.first_out
    from received r
    left join lateral (
      select min(m.created_at) as first_out from public.whatsapp_messages m
      where m.org_id=p_org and m.conversation_id=r.conversation_id
        and m.direction='outbound' and m.created_at>r.first_in
        and m.status in ('sent','delivered','read')
    ) reply on true
  ), last_message as (
    select distinct on (m.conversation_id) m.conversation_id,m.direction
    from public.whatsapp_messages m join received r using(conversation_id)
    where m.org_id=p_org and (m.direction='inbound' or m.status in ('sent','delivered','read'))
    order by m.conversation_id,m.created_at desc,m.id desc
  )
  select jsonb_build_object(
    'received',(select count(*) from received),
    'response_samples',(select count(first_out) from responses),
    'average_response_seconds',(select round(avg(extract(epoch from first_out-first_in))) from responses),
    'awaiting_human',count(*) filter(where l.direction='inbound' and v.status is distinct from 'closed'
      and v.human_takeover_reason is distinct from 'watchdog_loop' and v.conversation_owner='HUMAN'),
    'awaiting_automation',count(*) filter(where l.direction='inbound' and v.status is distinct from 'closed'
      and v.human_takeover_reason is distinct from 'watchdog_loop' and v.conversation_owner is distinct from 'HUMAN' and v.bot_ativo is true),
    'watchdog_paused',count(*) filter(where v.human_takeover_reason='watchdog_loop' and v.bot_ativo is false),
    'blocked_attempts',(select count(*) from public.whatsapp_outbound_gate_log
      where org_id=p_org and created_at>=p_since and allowed=false and reason not like '%send_failed:%'),
    'provider_failures',(select count(*) from public.whatsapp_outbound_gate_log
      where org_id=p_org and created_at>=p_since and allowed=false and reason like '%send_failed:%')
  )
  from last_message l join public.whatsapp_conversations v on v.id=l.conversation_id and v.org_id=p_org;
$$;
revoke all on function public.communication_metrics(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.communication_metrics(uuid,timestamptz) to service_role;

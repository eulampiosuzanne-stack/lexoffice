alter table public.waha_active_reply_claims add column in_progress boolean not null default false;
grant update on public.waha_active_reply_claims to service_role;

create or replace function public.claim_waha_active_reply(p_org uuid, p_conversation uuid, p_event text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  conversation public.whatsapp_conversations%rowtype;
begin
  if p_event is null or length(p_event) not between 1 and 512 then return 'invalid_event'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text || ':' || p_conversation::text, 0));
  select * into conversation from public.whatsapp_conversations
    where org_id = p_org and id = p_conversation;
  if not found or conversation.bot_ativo is false or conversation.conversation_owner = 'HUMAN'
    or conversation.last_human_outbound_at > now() - interval '20 minutes'
    or conversation.human_takeover_reason = 'watchdog_loop' then return 'human_or_watchdog'; end if;
  if exists(select 1 from public.waha_active_reply_claims
    where org_id=p_org and conversation_id=p_conversation and event_id=p_event) then return 'duplicate'; end if;
  if exists(select 1 from public.waha_active_reply_claims
    where org_id=p_org and conversation_id=p_conversation and in_progress
      and claimed_at > now()-interval '3 minutes') then return 'reply_in_progress'; end if;
  insert into public.waha_active_reply_claims(org_id,conversation_id,event_id,in_progress)
    values(p_org,p_conversation,p_event,true);
  return 'claimed';
end $$;

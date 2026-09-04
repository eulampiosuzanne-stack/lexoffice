create table if not exists public.ai_conversation_memory (
  conversation_id uuid primary key references public.whatsapp_conversations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  summary text not null default '',
  confirmed_facts jsonb not null default '[]'::jsonb,
  pending_items jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  current_intent text,
  current_agent_key text,
  stage text,
  last_agent_action text,
  last_message_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversation_memory_org_idx on public.ai_conversation_memory(org_id);
alter table public.ai_conversation_memory enable row level security;
revoke all on public.ai_conversation_memory from anon, authenticated;
grant select on public.ai_conversation_memory to authenticated;
drop policy if exists ai_conversation_memory_owner_select on public.ai_conversation_memory;
create policy ai_conversation_memory_owner_select on public.ai_conversation_memory for select to authenticated using (
  exists (select 1 from public.whatsapp_conversations c where c.id = conversation_id and c.org_id = org_id and c.owner_user_id = auth.uid())
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(), org_id uuid references public.organizations(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null, agent_key text, provider text, model text,
  purpose text not null default 'general', input_tokens integer, output_tokens integer, total_tokens integer,
  input_chars integer not null default 0, output_chars integer not null default 0, estimated boolean not null default false,
  success boolean not null default true, created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_org_created_idx on public.ai_usage_events(org_id, created_at desc);
create index if not exists ai_usage_events_conversation_idx on public.ai_usage_events(conversation_id, created_at desc);
alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from anon, authenticated;
grant select on public.ai_usage_events to authenticated;
drop policy if exists ai_usage_events_owner_select on public.ai_usage_events;
create policy ai_usage_events_owner_select on public.ai_usage_events for select to authenticated using (
  conversation_id is null or exists (select 1 from public.whatsapp_conversations c where c.id = conversation_id and c.org_id = ai_usage_events.org_id and c.owner_user_id = auth.uid())
);
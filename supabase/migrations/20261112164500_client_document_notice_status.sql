create table if not exists public.client_document_notice_status (
  request_id uuid primary key references public.client_document_requests(id) on delete cascade,
  status text not null check (status in ('sending', 'sent', 'failed', 'not_sent')),
  reason text,
  updated_at timestamptz not null default now()
);

alter table public.client_document_notice_status enable row level security;
revoke all on public.client_document_notice_status from anon, authenticated;
grant select, insert, update on public.client_document_notice_status to authenticated;

create policy "office team manages document notice status"
on public.client_document_notice_status for all to authenticated
using (
  exists (
    select 1 from public.client_document_requests request
    join public.profiles profile on profile.org_id = request.org_id
    where request.id = client_document_notice_status.request_id and profile.id = (select auth.uid())
      and profile.status = 'active' and profile.role_key in ('owner', 'lawyer', 'assistant')
  )
);

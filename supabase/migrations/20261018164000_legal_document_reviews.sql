insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-review-files',
  'legal-review-files',
  false,
  20971520,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.legal_document_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint not null check (file_size between 1 and 20971520),
  status text not null default 'uploaded',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legal_document_reviews_org_idx on public.legal_document_reviews(org_id, created_at desc);
alter table public.legal_document_reviews enable row level security;
grant select, insert, update, delete on public.legal_document_reviews to authenticated;

create policy "office members manage legal reviews"
on public.legal_document_reviews for all to authenticated
using (org_id in (select p.org_id from public.profiles p where p.id = (select auth.uid())))
with check (org_id in (select p.org_id from public.profiles p where p.id = (select auth.uid())));

create policy "office members upload legal review files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'legal-review-files'
  and (storage.foldername(name))[1] in (select p.org_id::text from public.profiles p where p.id = (select auth.uid()))
);

create policy "office members read legal review files"
on storage.objects for select to authenticated
using (
  bucket_id = 'legal-review-files'
  and (storage.foldername(name))[1] in (select p.org_id::text from public.profiles p where p.id = (select auth.uid()))
);

create policy "owners delete legal review files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'legal-review-files'
  and owner_id = (select auth.uid()::text)
);

-- New isolated proposal workspace. Does not create charges, signatures or follow-ups.
create table public.commercial_proposal_workspace (
 id text primary key,
 org_id uuid not null references public.organizations(id),
 owner_user_id uuid not null default auth.uid() references auth.users(id),
 revision integer not null default 1 check (revision>0),
 record jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint commercial_proposal_record_shape check (
  jsonb_typeof(record)='object' and record ?& array['id','revision','name','status','total','entry','snapshot','events'] and record->>'id'=id
  and (record->>'revision')::integer=revision
  and record->>'status' in ('rascunho','aprovada','enviada','recusada','contratacao','cancelada')
  and length(trim(record->>'name'))>0
  and (record->>'total')::numeric>0
  and (record->>'entry')::numeric>=0
  and (record->>'entry')::numeric<=(record->>'total')::numeric
  and jsonb_typeof(record->'snapshot')='object'
  and jsonb_typeof(record->'events')='array'
 )
);
alter table public.commercial_proposal_workspace enable row level security;
revoke all on public.commercial_proposal_workspace from anon,authenticated;
grant select,insert,update on public.commercial_proposal_workspace to authenticated;
create policy proposal_workspace_select on public.commercial_proposal_workspace for select to authenticated using (owner_user_id=(select auth.uid()) and org_id=(select public.current_org_id()));
create policy proposal_workspace_insert on public.commercial_proposal_workspace for insert to authenticated with check (owner_user_id=(select auth.uid()) and org_id=(select public.current_org_id()));
create policy proposal_workspace_update on public.commercial_proposal_workspace for update to authenticated using (owner_user_id=(select auth.uid()) and org_id=(select public.current_org_id())) with check (owner_user_id=(select auth.uid()) and org_id=(select public.current_org_id()));
create index commercial_proposal_workspace_owner_updated on public.commercial_proposal_workspace(org_id,owner_user_id,updated_at desc);
create or replace function public.check_proposal_workspace_revision() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.org_id<>old.org_id or new.owner_user_id<>old.owner_user_id or new.created_at<>old.created_at then
  raise exception 'Proposal ownership cannot be changed';
 end if;
 if new.revision<>old.revision+1 then raise exception 'Proposal revision conflict'; end if;
 if not (
  (old.record->>'status'='rascunho' and new.record->>'status' in ('rascunho','aprovada','cancelada')) or
  (old.record->>'status'='aprovada' and new.record->>'status' in ('rascunho','aprovada','enviada','recusada','contratacao','cancelada')) or
  (old.record->>'status'='enviada' and new.record->>'status' in ('rascunho','enviada','recusada','contratacao','cancelada')) or
  (old.record->>'status' in ('recusada','cancelada') and new.record->>'status'='rascunho') or
  (old.record->>'status'='contratacao' and new.record->>'status'='cancelada')
 ) then raise exception 'Proposal transition requires review'; end if;
 new.updated_at=now();
 return new;
end;
$$;
revoke all on function public.check_proposal_workspace_revision() from public;
create trigger commercial_proposal_workspace_revision before update on public.commercial_proposal_workspace for each row execute function public.check_proposal_workspace_revision();
comment on table public.commercial_proposal_workspace is 'Private per-user proposal drafts and manual lifecycle. No payment, signature or messaging triggers.';

-- LexOffice: process-level collaboration. This migration must be reviewed alongside existing broad office SELECT policies before production.
create table if not exists public.process_collaborators (
 id uuid primary key default gen_random_uuid(),
 process_id uuid not null references public.processes(id) on delete cascade,
 org_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 permission text not null check (permission in ('view','edit','manage')),
 granted_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(process_id,user_id)
);
create index if not exists process_collaborators_user_idx on public.process_collaborators(user_id,org_id);
alter table public.process_collaborators enable row level security;
revoke all on public.process_collaborators from anon, authenticated;
grant select on public.process_collaborators to authenticated;
create policy process_collaborators_read on public.process_collaborators for select to authenticated
 using (org_id=public.current_org_id() and (user_id=auth.uid() or granted_by=auth.uid() or exists
 (select 1 from public.processes p where p.id=process_id and p.org_id=org_id and p.owner_user_id=auth.uid())));
create or replace function public.manage_process_collaborator(p_process uuid,p_user uuid,p_permission text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_process public.processes%rowtype; v_actor public.profiles%rowtype; v_target public.profiles%rowtype;
begin
 select * into v_actor from public.profiles where id=auth.uid() and status='active';
 select * into v_process from public.processes where id=p_process;
 select * into v_target from public.profiles where id=p_user and status='active';
 if v_actor.id is null or v_process.id is null or v_target.id is null
 or v_process.org_id<>v_actor.org_id or v_target.org_id<>v_actor.org_id then
 raise exception 'Processo ou usuário indisponível' using errcode='42501'; end if;
 if v_actor.id<>v_process.owner_user_id and v_actor.role_key not in ('owner','admin') then
 raise exception 'Somente o responsável ou administrador pode compartilhar' using errcode='42501'; end if;
 if v_target.role_key not in ('lawyer','responsible_lawyer','owner','admin') then
 raise exception 'Compartilhamento permitido somente a advogados habilitados' using errcode='42501'; end if;
 if p_user=v_process.owner_user_id then raise exception 'O responsável já possui acesso'; end if;
 if p_permission is null then
 delete from public.process_collaborators where process_id=p_process and user_id=p_user;
 elsif p_permission in ('view','edit','manage') then
 insert into public.process_collaborators(process_id,org_id,user_id,permission,granted_by)
 values(p_process,v_process.org_id,p_user,p_permission,auth.uid())
 on conflict(process_id,user_id) do update set permission=excluded.permission,granted_by=excluded.granted_by;
 else raise exception 'Permissão inválida'; end if;
end $$;
revoke all on function public.manage_process_collaborator(uuid,uuid,text) from public,anon;
grant execute on function public.manage_process_collaborator(uuid,uuid,text) to authenticated;
create policy process_collaborator_read_process on public.processes for select to authenticated
 using (org_id=public.current_org_id() and exists
 (select 1 from public.process_collaborators pc where pc.process_id=processes.id and pc.user_id=auth.uid()));
create policy process_collaborator_read_events on public.calendar_events for select to authenticated
 using (org_id=public.current_org_id() and process_id is not null and exists
 (select 1 from public.process_collaborators pc where pc.process_id=calendar_events.process_id and pc.user_id=auth.uid()));

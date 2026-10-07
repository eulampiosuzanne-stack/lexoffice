-- Lembrete automático de preenchimento do link de cadastro. Aplicada em produção em 07/10/2026.
-- O envio dos lembretes roda dentro da edge function signature-reminder-worker (cron a cada 30 min).
alter table public.client_intake_links
  add column if not exists recipient_phone text,
  add column if not exists recipient_name text,
  add column if not exists link_url text,
  add column if not exists sent_at timestamptz,
  add column if not exists reminder_count int not null default 0,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminders_enabled boolean not null default true;
create index if not exists client_intake_links_reminder_idx on public.client_intake_links(sent_at) where used_at is null and revoked_at is null and sent_at is not null;

create or replace function public.client_intake_mark_sent(p_token text, p_phone text, p_name text, p_url text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_phone text := regexp_replace(coalesce(p_phone,''),'\D','','g');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(v_phone) < 10 or length(v_phone) > 13 then raise exception 'telefone_invalido'; end if;
  if p_url is null or p_url !~ '^https://[^\s]+/formulario-cliente/[^\s/]+$' then raise exception 'link_invalido'; end if;
  update public.client_intake_links l
     set recipient_phone = case when v_phone like '55%' then v_phone else '55'||v_phone end,
         recipient_name = nullif(left(btrim(coalesce(p_name,'')),120),''),
         link_url = p_url, sent_at = coalesce(l.sent_at, now())
   where l.token_hash = encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex')
     and public.can_access_office_operational_data(l.org_id)
     and l.used_at is null and l.revoked_at is null and l.expires_at > now()
  returning l.id into v_id;
  return v_id is not null;
end $$;
revoke all on function public.client_intake_mark_sent(text,text,text,text) from public, anon;
grant execute on function public.client_intake_mark_sent(text,text,text,text) to authenticated;

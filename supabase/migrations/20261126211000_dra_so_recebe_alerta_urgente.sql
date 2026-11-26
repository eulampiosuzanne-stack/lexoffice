-- 26/11/2026 — pedido da Dra.: no WhatsApp pessoal dela só urgência. Os demais alertas vão para o painel.
create or replace function public.lexoffice_alert_only_urgent_owner()
returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if right(regexp_replace(coalesce(new.alert_phone,''),'\D','','g'),8) <> '81125096' then return new; end if;
  if coalesce(new.reason,'') ~* '(urg[eê]n|situação crítica|^ADMIN_COMMAND_|^CLIENT_SCHEDULE_)' then return new; end if;
  begin
    insert into public.notifications(org_id,user_id,type,title,body,link,read)
    select new.org_id, p.id, 'service', left(coalesce(new.reason,'Aviso'),120),
           left(coalesce('Contato: '||new.contact_phone||E'\n','')||coalesce(new.context,''),700), '/atendimento', false
      from public.profiles p
     where p.id='0e98483f-a464-422b-bf3e-68f454cdd405' and p.org_id=new.org_id
       and not exists (select 1 from public.notifications n where n.user_id=p.id and n.title=left(coalesce(new.reason,'Aviso'),120)
             and n.body=left(coalesce('Contato: '||new.contact_phone||E'\n','')||coalesce(new.context,''),700) and n.created_at>now()-interval '24 hours');
  exception when others then
    raise warning 'lexoffice_alert_only_urgent_owner: %', sqlerrm;
    return new; -- se o painel falhar, o aviso segue como antes para não se perder
  end;
  return null;
end $f$;
create or replace trigger aa_alert_only_urgent_owner before insert on public.ai_agent_alerts
  for each row execute function public.lexoffice_alert_only_urgent_owner();

-- 26/11/2026 — a Dra. pediu para não enviar nada a alguns contatos. Contato com a etiqueta
-- 'bloqueado_envio' não recebe mensagens da fila automática (reversível: retirar a etiqueta).
create or replace function public.lexoffice_block_sends_tagged_contact()
returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.status in ('sent','cancelled','skipped') then return new; end if;
  if exists (select 1 from public.whatsapp_contacts c where c.org_id=new.org_id and 'bloqueado_envio'=any(c.tags)
       and right(regexp_replace(c.phone,'\D','','g'),8)=right(regexp_replace(coalesce(new.destination,''),'\D','','g'),8)) then
    new.status := 'cancelled';
  end if;
  return new;
end $f$;
create or replace trigger trg_block_tagged_contact before insert or update of status on public.notification_queue
  for each row execute function public.lexoffice_block_sends_tagged_contact();

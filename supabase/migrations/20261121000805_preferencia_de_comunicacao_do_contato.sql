alter table public.whatsapp_contacts add column if not exists communication_preference text;
alter table public.whatsapp_contacts add constraint whatsapp_contacts_communication_preference_check check (communication_preference is null or communication_preference in ('texto','audio','ambos')) not valid;

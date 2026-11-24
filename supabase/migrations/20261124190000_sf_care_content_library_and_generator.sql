-- SF Care: biblioteca de conteúdos (cards, curiosidades, quizzes) e gerador semanal automático.
-- Já aplicada no Supabase (meu-escritorio-crm). Não agenda cron: a ativação é feita à parte.
create table if not exists public.sf_care_content_library(
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('card','curiosity','quiz')),
 title text not null,
 body text not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.sf_care_content_library enable row level security;

insert into public.sf_care_content_library(kind,title,body) values
('card','Etapas de um processo','📌 Como funciona um processo? De forma geral: petição inicial, citação da outra parte, defesa, produção de provas, sentença e, se houver recurso, nova análise por um tribunal. Cada caso tem o seu ritmo, e os andamentos ficam disponíveis no aplicativo do escritório.'),
('card','Documentos organizados','📂 Dica: mantenha seus documentos em dia (RG, CPF, comprovante de residência atualizado e papéis do seu caso). Enviá-los pelo aplicativo ajuda a equipe a trabalhar com mais agilidade.'),
('card','Audiências','🗓️ Se houver audiência no seu caso, chegue com antecedência, leve um documento com foto e siga as orientações que o escritório enviar antes. Nossa equipe explica tudo o que esperar.'),
('card','Cuidado com golpes','🔒 Atenção a golpes: o escritório não pede senhas nem pagamentos por mensagens de números desconhecidos. Na dúvida, confirme com a nossa equipe antes de qualquer pagamento.'),
('curiosity','Habeas corpus','⚖️ Curiosidade: a expressão habeas corpus vem do latim e significa algo como "que tenhas o corpo". É um instrumento antigo de proteção da liberdade de locomoção, previsto na nossa Constituição.'),
('curiosity','Constituição Cidadã','📜 Curiosidade: a Constituição de 1988 é chamada de "Constituição Cidadã" por ter ampliado direitos e garantias fundamentais da população brasileira.'),
('curiosity','Direito de arrependimento','🛒 Curiosidade: o Código de Defesa do Consumidor, de 1990, garante o direito de arrependimento em até 7 dias para compras feitas fora da loja física, como pela internet ou por telefone.'),
('curiosity','Símbolo da Justiça','⚖️ Curiosidade: a estátua da Justiça representa Themis, da mitologia grega. A venda nos olhos simboliza a imparcialidade, e a balança, o equilíbrio na análise dos fatos.'),
('quiz','Compra pela internet','🧠 Verdadeiro ou falso? Compras feitas pela internet podem ser desfeitas em até 7 dias, sem precisar justificar. ✅ Verdadeiro: é o direito de arrependimento do Código de Defesa do Consumidor (art. 49).'),
('quiz','Acompanhar processo','🧠 Verdadeiro ou falso? Só é possível acompanhar um processo indo ao fórum. ❌ Falso: os andamentos podem ser consultados pelo aplicativo do escritório e pelos sistemas do tribunal.'),
('quiz','Contrato e cartório','🧠 Verdadeiro ou falso? Todo contrato só vale se for registrado em cartório. ❌ Falso: em regra vale a vontade das partes; o registro só é exigido nos casos previstos em lei.');

-- Gerador: 1 conteúdo por semana por cliente ativo com WhatsApp (sem opt-out), rotação
-- card/curiosidade/quiz, nunca repete conteúdo, aniversário no dia, máximo 30 por dia.
-- Entra no outbox como "approved"; o sf_care_dispatch_approved (cron de 5 min) envia em horário comercial.
create or replace function public.sf_care_generate_content(p_org uuid, p_limit integer default 30, p_only_client uuid default null, p_dry_run boolean default true)
returns table(client_id uuid, kind text, content_id uuid, inserted boolean)
language plpgsql security definer set search_path to 'public' as $fn$
declare
 r record; lib record; day_start timestamptz; local_now timestamp; made integer; room integer;
 wanted text; ekind text; msg text; dkey text; fname text; n integer; tries text[];
 footer constant text := ' Se preferir não receber este tipo de conteúdo, é só nos avisar por aqui.';
 kinds constant text[] := array['card','curiosity','quiz'];
begin
 if auth.role() is distinct from 'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'service_role_only'; end if;
 local_now := now() at time zone 'America/Sao_Paulo';
 day_start := date_trunc('day', local_now) at time zone 'America/Sao_Paulo';
 select count(*) into made from public.sf_care_outbox o where o.org_id=p_org and o.created_at>=day_start and o.metadata->>'origin'='sf_care_content';
 room := least(greatest(p_limit,0),30) - made;
 if p_only_client is not null then room := greatest(room,1); end if;
 if room<=0 then return; end if;
 for r in
  select c.id, c.name, c.birth_date from public.clients c
  left join public.client_notification_preferences pref on pref.client_id=c.id and pref.org_id=c.org_id
  where c.org_id=p_org and c.is_demo is not true
   and lower(coalesce(c.status,'')) in ('ativo','active','cliente','cliente_ativo','cliente_private')
   and length(coalesce(nullif(regexp_replace(c.whatsapp,'[^0-9]','','g'),''),regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'))) between 10 and 15
   and (pref.client_id is null or (pref.whatsapp_enabled is distinct from false and pref.proactive_process_updates is distinct from false))
   and (p_only_client is null or c.id=p_only_client)
   and (p_only_client is not null or not exists(select 1 from public.sf_care_outbox o where o.client_id=c.id and o.org_id=c.org_id and o.status in ('approved','queued','sent') and o.created_at>now()-interval '7 days'))
  order by (select max(o.created_at) from public.sf_care_outbox o where o.client_id=c.id and o.status in ('queued','sent')) asc nulls first, c.name
  limit room
 loop
  fname := initcap(split_part(trim(coalesce(r.name,'')),' ',1));
  if fname='' then continue; end if;
  if r.birth_date is not null and to_char(r.birth_date,'MMDD')=to_char(local_now,'MMDD')
     and not exists(select 1 from public.sf_care_outbox o where o.client_id=r.id and o.event_kind='birthday' and o.created_at>=date_trunc('year',now())) then
   ekind:='birthday'; lib:=null;
   msg:='Olá, '||fname||'! 🎂 Feliz aniversário! Toda a equipe do escritório Suzanne Figueiredo Advocacia e Soluções Jurídicas deseja um dia especial, com saúde e alegria.';
   dkey:='sf:birthday:'||r.id||':'||to_char(local_now,'YYYY');
   content_id:=null;
  else
   wanted := kinds[1+((extract(week from local_now)::int + abs(hashtext(r.id::text))) % 3)];
   tries := array[wanted]||array_remove(kinds,wanted);
   lib:=null;
   foreach n in array array[1,2,3] loop
    select l.* into lib from public.sf_care_content_library l
     where l.active and l.kind=tries[n]
      and not exists(select 1 from public.sf_care_outbox o where o.org_id=p_org and o.dedupe_key='sf:content:'||r.id||':'||l.id)
     order by l.created_at, l.id limit 1;
    exit when lib.id is not null;
   end loop;
   if lib.id is null then continue; end if;
   ekind := case lib.kind when 'card' then 'educational_card' when 'curiosity' then 'curiosity' else 'quiz' end;
   msg:='Olá, '||fname||'! '||lib.body||footer;
   dkey:='sf:content:'||r.id||':'||lib.id;
   content_id:=lib.id;
  end if;
  client_id:=r.id; kind:=ekind; inserted:=false;
  if not p_dry_run then
   insert into public.sf_care_outbox(org_id,client_id,process_id,event_kind,dedupe_key,message,media_kind,status,source_verified,lawyer_approved,metadata)
   values(p_org,r.id,null,ekind,dkey,msg,'text','approved',true,true,jsonb_build_object('origin','sf_care_content','auto_approved',true,'format',ekind))
   on conflict (org_id,dedupe_key) do nothing;
   get diagnostics n = row_count; inserted := n>0;
  end if;
  return next;
 end loop;
end $fn$;
revoke all on function public.sf_care_generate_content(uuid,integer,uuid,boolean) from public, anon, authenticated;

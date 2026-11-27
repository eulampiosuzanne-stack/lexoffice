-- 26/11/2026 (Dra. Suzanne): Helena não conversa com robôs. Acrescenta frases de atendimento automático que passavam.
do $mig$
declare d text := pg_get_functiondef('public.lexoffice_pause_ai_for_automated_senders'::regproc);
  alvo text := 'n[aã]o responda esta mensagem)''';
begin
  if position('escala de [0-9]+' in d) > 0 then return; end if;
  if position(alvo in d) = 0 then raise exception 'trecho esperado nao encontrado'; end if;
  execute replace(d, alvo, 'n[aã]o responda esta mensagem|mas n[aã]o consegui entender|digite apenas|digite [0-9] para|escala de [0-9]+ a [0-9]+|qual nota voc[eê] daria|atendimento (foi )?(finalizado|encerrado)|falta de intera[cç][aã]o|estamos (concluindo|encerrando|finalizando) (o )?(seu )?atendimento|iniciar atendimento|selecione uma (das )?op[cç]|fluxo de atendimento)''');
end $mig$;

# LEXOFFICE — regras de trabalho

Sistema em produção usado por clientes reais do escritório. Prioridade máxima: não quebrar a usabilidade dos clientes.

## Modo de trabalho
Sempre aplicar a skill `economia-tokens` (`.claude/skills/economia-tokens/SKILL.md`) em toda tarefa: ler o mínimo, editar cirurgicamente, responder curto e usar mais de um agente só quando necessário.

## Divisão entre as duas sessões do Claude
A usuária trabalha com duas sessões ao mesmo tempo no mesmo repositório:
- **App Claude (desktop): FUNCIONALIDADE.** Lógica, dados, Supabase (banco, edge functions), integrações, bugs, deploy/rollback.
- **Extensão Claude Code (editor): LAYOUT.** Visual, cores, CSS, temas, imagens, espaçamentos, textos de interface.

Regras para não uma atrapalhar a outra:
- Cada sessão só mexe na sua área. Se a tarefa exigir a área da outra, fazer a menor mudança possível e avisar a usuária.
- Arquivos de layout (`*.css`, `theme.ts`, `client-app/src/theme.ts`, `public/brand/`, `index.html`, `public/manifest.webmanifest`) são da extensão. Telas `.tsx` são compartilhadas: o app altera lógica, a extensão altera classes/estrutura visual.
- `git pull --rebase` antes de começar qualquer edição e de novo imediatamente antes de cada push. Commits pequenos e frequentes, um assunto por commit.
- Nunca `push --force`, nunca descartar alterações da outra sessão. Em conflito, manter as duas mudanças; se não for possível, perguntar à usuária.
- Não enviar arquivos pelo upload do site do GitHub (cria cópias como `arquivo (1).css`); sempre via git.

## Infraestrutura
- GitHub: `eulampiosuzanne-stack/lexoffice`, ramo `main`.
- Vercel: projeto `lexoffice` (prj_CeFzKakgvSyQU0T42bULGBxe1Cai). Todo push em `main` vai para produção automaticamente.
- Supabase: projeto `meu-escritorio-crm` (dcpwcuototomxoiszukt). Não confundir com `lex-prospect` (jnctyowjstchfofqfhnm).
- Banco e edge functions do Supabase NÃO são publicados pelo push — aplicar separadamente.
- `client-app/` é o app do cliente (Expo), projeto Vercel `suzanne-figueiredo-cliente`.

## Fluxo obrigatório
1. **Início de toda sessão:** `git pull --ff-only` e subir a visualização local:
   - LEXOFFICE: `npm run dev -- --port 5173 --strictPort` → http://localhost:5173
   - App do cliente: `npm --prefix client-app run web -- --port 8081` → http://localhost:8081
2. **Durante as alterações:** mostrar o resultado no localhost (browser pane) antes de publicar.
3. **Antes de publicar:** `npm run build` e `npm test` precisam passar. Para funcionalidades novas/alteradas, seguir a skill `protocolo-qa-lexoffice`.
4. **Publicação:**
   - Grandes alterações (funcionalidade nova, mudança de fluxo, várias telas): após os passos 2–3, fazer commit + push em `main` automaticamente, sem pedir confirmação.
   - Alterações pequenas: perguntar se publica agora ou junto com a próxima.
   - Nunca publicar com build/teste falhando ou com erro visível no localhost.
5. **Depois do deploy:** conferir que o deploy na Vercel ficou `READY` e abrir a URL de produção. Se quebrou, fazer rollback para o deploy anterior imediatamente e avisar.

## Cuidados com dados dos clientes
- O localhost usa o banco de PRODUÇÃO (fallback em `src/lib/supabase.ts`). Testes locais mexem em dados reais: não criar, enviar ou apagar nada em nome de clientes reais durante testes (WhatsApp, e-mails, assinaturas, cobranças).
- Migrations devem ser compatíveis com a versão no ar (adicionar antes de remover). Aplicar a migration antes do push do código que depende dela.
- DROP, DELETE, TRUNCATE ou qualquer alteração destrutiva no banco: sempre pedir confirmação.

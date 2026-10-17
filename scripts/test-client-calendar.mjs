import fs from 'node:fs';
const ui=fs.readFileSync('src/pages/ClientPortal.tsx','utf8');
const fn=fs.readFileSync('supabase/functions/lazy-probe-tmp/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20261017211500_client_calendar_google_notifications.sql','utf8');
const checks=[
 ['frontend usa endpoint da agenda',ui.includes('functions.invoke("lazy-probe-tmp"')],
 ['cooldown de 2 dias úteis',fn.includes('plusBusinessDays(last.starts_at)')],
 ['consulta Google FreeBusy',fn.includes('/calendar/v3/freeBusy')],
 ['revalida antes de reservar',fn.includes('slots.find')],
 ['desfaz reserva se Google falhar',fn.includes("calendar_events').delete()")],
 ['janela começa às 8h',fn.includes('iso(date,480)')],
 ['troca profissional às 14h',fn.includes('840+i*45')],
 ['avisa dois números',sql.includes('alert_phone')&&sql.includes('commercial_alert_phone')],
 ['evita alerta duplicado',sql.includes('not exists')],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++}if(failed)process.exit(1);

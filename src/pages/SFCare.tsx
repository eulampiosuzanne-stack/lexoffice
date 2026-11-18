import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import CommunicationsSupervisor from '../components/CommunicationsSupervisor';

type Client = { id: string; name: string };
const ALL = '__all__';
const campaigns = [
{ id: 'post_filing_checkin', label: 'Acompanhamento após ajuizamento', detail: 'Perguntar como o cliente está e se consegue acompanhar o processo' },
{ id: 'office_card', label: 'Card institucional', detail: 'Apresentar o aplicativo e os canais do escritório' },
{ id: 'educational_card', label: 'Card educativo', detail: 'Orientação geral, sem aconselhamento jurídico individual' },
{ id: 'satisfaction_poll', label: 'Pesquisa de satisfação', detail: 'Ouvir o cliente e identificar pedidos de contato humano' },
{ id: 'interest_poll', label: 'Enquete de interesses', detail: 'Descobrir quais conteúdos são úteis ao cliente' },
];
const previews: Record<string,string> = {
post_filing_checkin: 'Como estão as coisas desde o ajuizamento da sua ação? Você está conseguindo acompanhar as informações pelo aplicativo?',
office_card: 'Suzanne Figueiredo Advocacia e Soluções Jurídicas. Acompanhamento digital, com informações pelo aplicativo.',
educational_card: 'Cada processo tem etapas e prazos próprios. Para orientações individuais, fale com nossa equipe.',
satisfaction_poll: 'Como você avalia nosso atendimento? Muito bom | Bom | Preciso de esclarecimentos | Quero conversar.',
interest_poll: 'Qual conteúdo gostaria de receber? Etapas do processo | Aplicativo | Documentos | Audiências.',
};
export default function SFCare() {
const [clients,setClients] = useState<Client[]>([]);
const [diagnostics,setDiagnostics] = useState<{clients_checked:number;opted_out_clients:number;eligible_clients:number}|null>(null);
const [clientId,setClientId] = useState('');
const [kinds,setKinds] = useState<string[]>([campaigns[0].id]);
const [busy,setBusy] = useState(false);
const [notice,setNotice] = useState('');
const [progress,setProgress] = useState('');
const [refresh,setRefresh] = useState(0);
useEffect(() => {
let active=true;
supabase.functions.invoke('sf-care-review',{body:{action:'eligible_clients'}}).then(({data,error})=>{
if(!active)return;
if(error||!data?.ok){setNotice('Não foi possível carregar os clientes autorizados.');return;}
setClients(data.clients||[]);
setDiagnostics(data.diagnostics||null);
});
return ()=>{active=false;};
},[]);
const allMode = clientId===ALL;
const targetCount = allMode ? clients.length : (clientId ? 1 : 0);
const total = targetCount*kinds.length;
const allKindsSelected = kinds.length===campaigns.length;
const targetName = allMode ? 'todos os '+clients.length+' clientes elegíveis' : (clients.find(c=>c.id===clientId)?.name||'nenhum cliente escolhido');
function toggleKind(id:string){setKinds(k=>k.includes(id)?k.filter(x=>x!==id):[...k,id]);}
function toggleAllKinds(){setKinds(allKindsSelected?[]:campaigns.map(c=>c.id));}
async function prepareWeekly(){
if(busy)return;
setBusy(true);setNotice('');
try{
const {data,error}=await supabase.functions.invoke('sf-care-review',{body:{action:'prepare_weekly_care'}});
if(error||!data?.ok)throw new Error(data?.error||'Falha ao preparar acompanhamento');
setNotice(String(data.created||0)+' proposta(s) de acompanhamento preparadas para revisão. Nenhuma mensagem foi enviada.');
setRefresh(n=>n+1);
}catch(e){setNotice(e instanceof Error?e.message:'Falha ao preparar acompanhamento');}
finally{setBusy(false);}
}
async function createDrafts(){
if(!clientId||!kinds.length||busy)return;
const ids = allMode ? clients.map(c=>c.id) : [clientId];
const jobs: {id:string;k:string}[] = [];
for(const id of ids){for(const k of kinds){jobs.push({id,k});}}
if(!jobs.length)return;
setBusy(true);setNotice('');setProgress('');
let created=0,existing=0,failed=0,done=0,next=0;
async function worker(){
while(next<jobs.length){
const j=jobs[next++];
try{
const {data,error}=await supabase.functions.invoke('sf-care-review',{body:{action:'create_care_draft',client_id:j.id,kind:j.k}});
if(error||!data?.ok)failed++;
else if(data.created)created++;
else existing++;
}catch{failed++;}
done++;
setProgress('Preparando '+done+' de '+jobs.length+'...');
}
}
await Promise.all([worker(),worker(),worker(),worker()]);
setProgress('');
setNotice('Resultado: '+created+' proposta(s) criada(s) para aprovação, '+existing+' já existiam hoje, '+failed+' com falha. Nenhuma mensagem foi enviada.');
setRefresh(n=>n+1);
setBusy(false);
}
return <main className="sf-care-page" aria-label="Painel SF Care">
<header className="ac-surface" style={{marginBottom:20}}>
<p style={{letterSpacing:'0.12em',textTransform:'uppercase',fontSize:12,color:'#B28A4A'}}>Relacionamento proativo</p>
<h1>SF Care</h1>
<p>Cuidados após o ajuizamento, cards institucionais e educativos, pesquisas e enquetes.</p>
<p><strong>Situação: ATIVO para criar propostas.</strong> Nada é enviado sem a sua aprovação. Os envios aprovados só acontecem das 8h às 20h, no máximo 30 por dia. Clientes que respondem SAIR deixam de receber.</p>
</header>
<section className="ac-surface" style={{marginBottom:20}}>
<h2>Preparar comunicação</h2>
<p><strong>Acompanhamento periódico:</strong> prepara até 20 propostas por dia para clientes ativos com WhatsApp, sem comunicações nos últimos sete dias e sem recusa registrada. Todas ficam aguardando sua aprovação.</p>
<button className="secondary" disabled={busy} onClick={()=>void prepareWeekly()}>Preparar acompanhamentos da semana</button>
<p>Escolha para quem e o que será feito. Depois clique em criar. As propostas aparecem abaixo para você aprovar.</p>
<label>Para quem
<select value={clientId} onChange={e=>setClientId(e.target.value)}>
<option value="">Selecione um cliente autorizado</option>
{clients.length>0&&<option value={ALL}>{'Todos os clientes elegíveis ('+clients.length+')'}</option>}
{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
</select>
</label>
<fieldset style={{margin:'12px 0',padding:12}}>
<legend>O que será feito (marque um ou mais)</legend>
<label style={{display:'block',fontWeight:700}}><input type="checkbox" checked={allKindsSelected} onChange={toggleAllKinds} /> Marcar todos</label>
{campaigns.map(c=><label key={c.id} style={{display:'block'}}><input type="checkbox" checked={kinds.includes(c.id)} onChange={()=>toggleKind(c.id)} /> {c.label}<small> — {c.detail}</small></label>)}
</fieldset>
<aside className="ac-surface" aria-label="Prévia da campanha" style={{margin:'12px 0',borderLeft:'3px solid #B28A4A',padding:16}}>
<strong>Prévia do conteúdo</strong>
{kinds.length===0&&<p>Marque pelo menos um tipo de comunicação.</p>}
{kinds.map(k=><p key={k}><strong>{campaigns.find(c=>c.id===k)?.label}:</strong> {previews[k]}</p>)}
<small>Prévia textual. Cards com imagem e enquetes interativas ainda exigem integração de mídia e respostas.</small>
</aside>
<p role="status"><strong>Resumo:</strong> {total>0 ? 'serão criadas até '+total+' proposta(s) para '+targetName+', com '+kinds.length+' tipo(s) de comunicação. Todas aguardam a sua aprovação; nada é enviado agora.' : 'escolha o cliente e pelo menos um tipo de comunicação.'}</p>
<button className="primary" disabled={!clientId||!kinds.length||busy} onClick={()=>void createDrafts()}>
{busy?'Preparando...':(allMode?'Criar propostas para todos ('+total+')':'Criar proposta(s) para aprovação')}
</button>
{progress&&<p role="status">{progress}</p>}
{notice&&<p role="status">{notice}</p>}
{diagnostics&&<p role="status"><strong>Diagnóstico:</strong> {diagnostics.clients_checked} clientes consultados, {diagnostics.eligible_clients} elegíveis (ativos, com WhatsApp e sem recusa registrada) e {diagnostics.opted_out_clients} com recusa registrada.</p>}
{!clients.length&&<p>Nenhum cliente elegível carregado. Verifique se há clientes ativos com WhatsApp.</p>}
</section>
<div key={refresh}><CommunicationsSupervisor /></div>
</main>;}

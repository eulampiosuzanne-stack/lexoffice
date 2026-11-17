import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import CommunicationsSupervisor from '../components/CommunicationsSupervisor';

type Client = { id: string; name: string };
const campaigns = [
  { id: 'post_filing_checkin', label: 'Acompanhamento após ajuizamento', detail: 'Perguntar como o cliente está e se consegue acompanhar o processo' },
  { id: 'office_card', label: 'Card institucional', detail: 'Apresentar o aplicativo e os canais do escritório' },
  { id: 'educational_card', label: 'Card educativo', detail: 'Orientação geral, sem aconselhamento jurídico individual' },
  { id: 'satisfaction_poll', label: 'Pesquisa de satisfação', detail: 'Ouvir o cliente e identificar pedidos de contato humano' },
  { id: 'interest_poll', label: 'Enquete de interesses', detail: 'Descobrir quais conteúdos são úteis ao cliente' },
];
export default function SFCare() {
  const [clients,setClients] = useState<Client[]>([]);
  const [clientId,setClientId] = useState('');
  const [kind,setKind] = useState(campaigns[0].id);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [refresh,setRefresh] = useState(0);
  useEffect(() => {
    let active=true;
    supabase.functions.invoke('sf-care-review',{body:{action:'eligible_clients'}}).then(({data,error})=>{
      if(!active)return;
      if(error||!data?.ok){setNotice('Não foi possível carregar os clientes autorizados.');return;}
      setClients(data.clients||[]);
    });
    return ()=>{active=false;};
  },[]);
  async function createDraft(){
    if(!clientId||busy)return;
    setBusy(true);setNotice('');
    try{
      const {data,error}=await supabase.functions.invoke('sf-care-review',{body:{action:'create_care_draft',client_id:clientId,kind}});
      if(error||!data?.ok)throw new Error(data?.error||'Falha ao preparar comunicação');
      setNotice(data.created?'Proposta registrada para revisão. Nenhuma mensagem foi enviada.':'Já existe uma proposta deste tipo para este cliente hoje.');
      setRefresh(n=>n+1);
    }catch(e){setNotice(e instanceof Error?e.message:'Falha ao criar proposta');}
    finally{setBusy(false);}
  }
  return <main className="sf-care-page" aria-label="Painel SF Care">
    <header className="ac-surface" style={{marginBottom:20}}>
      <p style={{letterSpacing:'0.12em',textTransform:'uppercase',fontSize:12,color:'#B28A4A'}}>Relacionamento proativo</p>
      <h1>SF Care</h1>
      <p>Cuidados após o ajuizamento, cards institucionais e educativos, pesquisas e enquetes.</p>
      <p>As propostas exigem revisão antes de qualquer envio. A criação de uma proposta não dispara mensagens.</p>
    </header>
    <section className="ac-surface" style={{marginBottom:20}}>
      <h2>Preparar comunicação</h2>
      <p>Selecione um cliente com consentimento registrado e escolha a ação de relacionamento.</p>
      <label>Cliente
        <select value={clientId} onChange={e=>setClientId(e.target.value)}>
          <option value="">Selecione um cliente autorizado</option>
          {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Tipo de comunicação
        <select value={kind} onChange={e=>setKind(e.target.value)}>
          {campaigns.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <p>{campaigns.find(c=>c.id===kind)?.detail}</p>
      <aside className="ac-surface" aria-label="Prévia da campanha" style={{margin:'12px 0',borderLeft:'3px solid #B28A4A',padding:16}}>
        <strong>Prévia do conteúdo</strong>
        <p>{kind==='post_filing_checkin'?'Como estão as coisas desde o ajuizamento da sua ação? Você está conseguindo acompanhar as informações pelo aplicativo?':
          kind==='office_card'?'Suzanne Figueiredo Advocacia e Soluções Jurídicas. Acompanhamento digital, com informações pelo aplicativo.':
          kind==='educational_card'?'Cada processo tem etapas e prazos próprios. Para orientações individuais, fale com nossa equipe.':
          kind==='satisfaction_poll'?'Como você avalia nosso atendimento? Muito bom | Bom | Preciso de esclarecimentos | Quero conversar.':
          'Qual conteúdo gostaria de receber? Etapas do processo | Aplicativo | Documentos | Audiências.'}</p>
        <small>Prévia textual. Cards com imagem e enquetes interativas ainda exigem integração de mídia e respostas.</small>
      </aside>
      <button className="primary" disabled={!clientId||busy} onClick={()=>void createDraft()}>
        {busy?'Preparando...':'Criar proposta para aprovação'}
      </button>
      {notice&&<p role="status">{notice}</p>}
      {!clients.length&&<p>Nenhum cliente elegível carregado. Verifique consentimentos e permissões.</p>}
    </section>
    <div key={refresh}><CommunicationsSupervisor /></div>
  </main>;}

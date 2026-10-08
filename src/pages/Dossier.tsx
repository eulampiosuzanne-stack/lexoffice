import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

const datePt=(value:any)=>value?new Date(value).toLocaleString('pt-BR'):'Não informado';
function listText(items:any[],render:(item:any)=>string){
 return items.length?items.map(render).join('\n'):'Nenhum registro encontrado.';
}
export default function Dossier(){
 const {processId}=useParams();const navigate=useNavigate();
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[generating,setGenerating]=useState(false),[data,setData]=useState<any>(null),[draft,setDraft]=useState('');
 async function load(){
  if(!supabase||!processId){setError('Não foi possível localizar este processo.');setLoading(false);return}
  setLoading(true);setError('');
  try{
   const {data:p,error:pe}=await supabase.from('processes').select('id,org_id,client_id,cnj_number,internal_number,opposing_party,pole,court,comarca,vara,area,subject,class_name,status,is_confidential,clients(id,name,phone,email,notes)').eq('id',processId).maybeSingle();
   if(pe)throw pe;if(!p)throw new Error('Processo não encontrado ou sem permissão de acesso.');
   const [m,d,h,j,e,w]=await Promise.all([
    supabase.from('process_movements').select('movement_date,title,description').eq('process_id',p.id).order('movement_date',{ascending:false}).limit(20),
    supabase.from('process_deadlines').select('title,description,due_at,status,priority').eq('process_id',p.id).order('due_at',{ascending:true}).limit(50),
    supabase.from('process_hearings').select('title,hearing_type,starts_at,location,notes,status').eq('process_id',p.id).order('starts_at',{ascending:true}).limit(30),
    supabase.from('process_judge_analyses').select('result,created_at,sample_size,tribunal,orgao_nome').eq('process_id',p.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    p.client_id?supabase.from('client_events').select('type,title,description,created_at').eq('client_id',p.client_id).order('created_at',{ascending:false}).limit(20):Promise.resolve({data:[],error:null}) as any,
    p.client_id?supabase.from('whatsapp_conversations').select('id,last_message_at,status').eq('client_id',p.client_id).order('last_message_at',{ascending:false}).limit(10):Promise.resolve({data:[],error:null}) as any
   ]);
   for(const result of [m,d,h,j,e,w])if(result.error)throw result.error;
   const conversationIds=(w.data||[]).map((x:any)=>x.id);
   const whatsapp=conversationIds.length?await supabase.from('whatsapp_messages').select('conversation_id,direction,body,created_at').in('conversation_id',conversationIds).order('created_at',{ascending:false}).limit(30):{data:[],error:null} as any;
   if(whatsapp.error)throw whatsapp.error;
   setData({process:p,movements:m.data||[],deadlines:d.data||[],hearings:h.data||[],judge:j.data,clientEvents:e.data||[],clientWhatsApp:whatsapp.data||[]});
  }catch(e:any){setError(e?.message||'Não foi possível carregar o Dossiê. Verifique a conexão e tente novamente.')}
  finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[processId]);
 async function generate(){
  if(!supabase||!data)return;
  setGenerating(true);setError('');
  try{
   const p=data.process;
   const source={
    processo:{numero:p.cnj_number||p.internal_number,assunto:p.subject,classe:p.class_name,area:p.area,tribunal:p.tribunal_name||p.court,comarca:p.comarca,vara:p.vara,cliente:p.clients?.name,parte_contraria:p.opposing_party,polo:p.pole,observacoes_cliente:p.clients?.notes},
    prazos:data.deadlines.map((x:any)=>({titulo:x.title,descricao:x.description,vencimento:x.due_at,status:x.status,prioridade:x.priority})),
    audiencias:data.hearings.map((x:any)=>({titulo:x.title,tipo:x.hearing_type,data:x.starts_at,local:x.location,observacoes:x.notes,status:x.status})),
    andamentos:data.movements.map((x:any)=>({data:x.movement_date,titulo:x.title,descricao:x.description})),
    analise_do_juizo:data.judge?.result||null,
    historico_do_cliente:{eventos:data.clientEvents.map((x:any)=>({data:x.created_at,tipo:x.type,titulo:x.title,descricao:x.description})),mensagens_whatsapp:data.clientWhatsApp.map((x:any)=>({data:x.created_at,direcao:x.direction,texto:x.body}))}
   };
   const result=await supabase.functions.invoke('ai-provider-gateway',{body:{
    org_id:p.org_id,purpose:'process_dossier',
    instructions:'Você é Helena, assistente da advogada. Faça um dossiê conciso e organizado, em português claro, usando somente os fatos do material fornecido. Não complete lacunas, não crie datas, pessoas, pedidos, fatos ou teses. Se o material não informar algo, escreva “Não identificado nos dados disponíveis”. Separe: resumo da causa; partes; prazos e audiências; últimos andamentos; análise do juízo (reproduza os dados sem prometer resultado); histórico do cliente; pontos favoráveis observáveis; pontos que precisam de atenção; perguntas para a reunião; riscos processuais a conferir; próximos passos sugeridos. Os pontos favoráveis, riscos e perguntas são sugestões para conferência da advogada, não fatos confirmados. Não dê previsão nem promessa de resultado.',
    input:JSON.stringify(source)
   }});
   if(result.error||!result.data?.ok||!result.data?.text)throw result.error||new Error('A IA não conseguiu preparar o Dossiê.');
   setDraft(String(result.data.text));
  }catch(e:any){setError(e?.message||'Não foi possível gerar o Dossiê. Confira a conexão e tente novamente.')}
  finally{setGenerating(false)}
 }
 if(loading)return <main style={{padding:24,fontSize:20,color:'#fff'}}>Carregando o Dossiê…</main>;
 if(error&&!data)return <main style={{padding:24,color:'#fff'}}><button className="secondary" onClick={()=>navigate('/processos')}><ArrowLeft/> Voltar aos processos</button><p role="alert" style={{fontSize:18}}>{error}</p><button className="primary" onClick={()=>void load()}><RefreshCw/> Tentar novamente</button></main>;
 const p=data.process;
 const section={background:'#151515',border:'1px solid #9a7837',borderRadius:14,padding:18,margin:'0 0 14px',color:'#fff'} as const;
 const heading={fontSize:20,color:'#e7c56a',margin:'0 0 10px'} as const;
 return <main style={{padding:'20px 16px 100px',maxWidth:1000,margin:'0 auto',color:'#fff'}}>
  <div className="no-print" style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:18}}>
   <button className="secondary" style={{minHeight:48,fontSize:17}} onClick={()=>navigate('/processos')}><ArrowLeft size={20}/> Voltar aos processos</button>
   <button className="primary" style={{minHeight:48,fontSize:17}} onClick={()=>window.print()}><Printer size={20}/> Imprimir / salvar PDF</button>
   <button className="secondary" style={{minHeight:48,fontSize:17}} onClick={()=>void generate()} disabled={generating||!p.org_id}>{generating?'Helena está preparando…':'Gerar sugestão da Helena'}</button>
  </div>
  <h1 style={{fontSize:30,margin:'0 0 8px'}}>Dossiê do processo</h1>
  <p style={{fontSize:18,margin:'0 0 18px'}}>{p.cnj_number||p.internal_number||'Sem número'} · {p.clients?.name||'Cliente não vinculado'}</p>
  {p.is_confidential&&<aside style={{...section,borderColor:'#c98585',background:'#351b22',fontSize:18}}><strong>Segredo de justiça:</strong> este processo contém acesso restrito.</aside>}
  {error&&<p role="alert" style={{...section,borderColor:'#c98585',fontSize:17}}>{error}</p>}
  <section style={section}><h2 style={heading}>Dados registrados</h2><p style={{fontSize:17,lineHeight:1.6,whiteSpace:'pre-wrap'}}>Assunto: {p.subject||'Não informado'}<br/>Classe: {p.class_name||'Não informada'}<br/>Área: {p.area||'Não informada'}<br/>Tribunal: {p.tribunal_name||p.court||'Não informado'}<br/>Comarca: {p.comarca||'Não informada'} · Vara: {p.vara||'Não informada'}<br/>Cliente: {p.clients?.name||'Não vinculado'} · Parte contrária: {p.opposing_party||'Não informada'} · Polo: {p.pole||'Não informado'}<br/>Contato cadastrado: {p.clients?.phone||p.clients?.email||'Não informado'}</p></section>
  <section style={section}><h2 style={heading}>Prazos</h2><p style={{fontSize:17,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{listText(data.deadlines,(x:any)=>'• '+x.title+' — '+datePt(x.due_at)+' — '+(x.status||'status não informado')+(x.description?' — '+x.description:''))}</p></section>
  <section style={section}><h2 style={heading}>Audiências e reuniões</h2><p style={{fontSize:17,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{listText(data.hearings,(x:any)=>'• '+x.title+' — '+datePt(x.starts_at)+(x.location?' — '+x.location:'')+(x.notes?' — '+x.notes:''))}</p></section>
  <section style={section}><h2 style={heading}>Últimos andamentos</h2><p style={{fontSize:17,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{listText(data.movements.slice(0,10),(x:any)=>'• '+datePt(x.movement_date)+' — '+(x.title||x.description||'Sem descrição'))}</p></section>
  <section style={section}><h2 style={heading}>Análise do Juízo salva</h2><p style={{fontSize:17,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{data.judge?JSON.stringify(data.judge.result,null,2):'Não há análise salva para este processo.'}</p><small style={{fontSize:14}}>A análise usa publicações públicas e não prevê resultado.</small></section>
  <section style={section}><h2 style={heading}>Histórico do cliente</h2><h3 style={{fontSize:17}}>Eventos cadastrados</h3><p style={{fontSize:17,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{listText(data.clientEvents,(x:any)=>'• '+datePt(x.created_at)+' — '+(x.title||x.type||'Evento')+(x.description?' — '+x.description:''))}</p><h3 style={{fontSize:17}}>Mensagens recentes do WhatsApp</h3><p style={{fontSize:17,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{listText(data.clientWhatsApp,(x:any)=>'• '+datePt(x.created_at)+' — '+(x.direction==='inbound'?'Cliente':'Escritório')+': '+(x.body||'Mensagem sem texto'))}</p>{!data.clientEvents.length&&!data.clientWhatsApp.length&&<small style={{fontSize:15}}>Não há eventos ou mensagens disponíveis para este cliente.</small>}</section>
  {draft&&<section style={section}><h2 style={heading}>Sugestão da IA — revisar antes de usar</h2><p style={{fontSize:17,lineHeight:1.65,whiteSpace:'pre-wrap'}}>{draft}</p><small style={{fontSize:14}}>Conteúdo elaborado por Helena com base nos dados exibidos. Confirme fatos, prazos e estratégia antes de usar.</small></section>}
  <p style={{fontSize:15,color:'#ddd'}}>Documento interno de apoio à advogada. A IA não substitui a análise profissional.</p>
  <style>{'@media print{.no-print{display:none!important}body{background:#fff!important;color:#111!important}main{max-width:none!important;padding:0!important}section{break-inside:avoid;color:#111!important;background:#fff!important;border-color:#555!important}h1,h2,p,small{color:#111!important}}'}</style>
 </main>
}

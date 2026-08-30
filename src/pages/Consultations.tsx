import {useEffect,useMemo,useState} from 'react';
import {Search,Phone,Building2,Car,MapPin,ShieldCheck,Database,BriefcaseBusiness,Landmark,UsersRound,BadgeDollarSign,FileBadge2,Network,House,Layers3,RotateCw,Star} from 'lucide-react';
import {supabase} from '../lib/supabase';
import './integrations.css';

type CatalogItem={slug:string;title:string;description:string;category:string;input_kind:string;provider_mode:string;novelty:boolean;sort_order:number};
type SearchResult={slug?:string;title?:string;status:string;source?:string;result?:any;error?:string;search_id?:string};

const fallbackCatalog:CatalogItem[]=[
 {slug:'phone-data',title:'Dados por telefone',description:'Informações básicas sobre uma pessoa física a partir de um número de telefone.',category:'Pessoa',input_kind:'phone',provider_mode:'provider_required',novelty:true,sort_order:10},
 {slug:'financed-properties',title:'Imóveis financiados',description:'Identifique imóveis financiados e status das operações por CPF.',category:'Patrimônio',input_kind:'cpf',provider_mode:'provider_required',novelty:true,sort_order:20},
 {slug:'rural-properties',title:'Imóveis rurais',description:'Consulta de imóveis rurais com informações obtidas em bases oficiais autorizadas.',category:'Patrimônio',input_kind:'cpf_cnpj',provider_mode:'provider_required',novelty:true,sort_order:30},
 {slug:'vehicle-debts',title:'Débitos veiculares',description:'Consulte multas, IPVA e licenciamento pela placa.',category:'Veículos',input_kind:'plate',provider_mode:'provider_required',novelty:false,sort_order:40},
 {slug:'cnh-data',title:'Dados da CNH',description:'Consulte informações sobre a CNH para fins jurídicos autorizados.',category:'Veículos',input_kind:'cpf',provider_mode:'provider_required',novelty:false,sort_order:50},
 {slug:'vehicle-tracking',title:'Rastreamento de veículo',description:'Informações para rastrear referências de veículos por integrações autorizadas.',category:'Veículos',input_kind:'plate',provider_mode:'provider_required',novelty:false,sort_order:60},
 {slug:'economic-group',title:'Grupo econômico',description:'Relação entre empresas para identificação de possível grupo econômico.',category:'Empresa',input_kind:'cnpj',provider_mode:'public_cnpj',novelty:false,sort_order:70},
 {slug:'registration-status',title:'Situação cadastral',description:'Situação cadastral da pessoa jurídica nos registros públicos disponíveis.',category:'Empresa',input_kind:'cnpj',provider_mode:'public_cnpj',novelty:false,sort_order:80},
 {slug:'professional-data',title:'Dados profissionais',description:'Histórico profissional disponível em dados internos e fontes autorizadas.',category:'Pessoa',input_kind:'name_or_cpf',provider_mode:'internal',novelty:false,sort_order:90},
 {slug:'trademarks-patents',title:'Marcas e patentes',description:'Informações e histórico de marcas e patentes relacionadas à pessoa física ou jurídica.',category:'Empresa',input_kind:'name_or_document',provider_mode:'provider_required',novelty:false,sort_order:100},
 {slug:'processes',title:'Processos',description:'Informações de processos envolvendo a pessoa física ou jurídica.',category:'Jurídico',input_kind:'name_or_document',provider_mode:'internal',novelty:false,sort_order:110},
 {slug:'credit-restrictions',title:'Restrição de crédito',description:'Informações de crédito de pessoas físicas ou jurídicas por provedor autorizado.',category:'Financeiro',input_kind:'cpf_cnpj',provider_mode:'provider_required',novelty:false,sort_order:120},
 {slug:'relationships',title:'Relacionamentos',description:'Informações de relações familiares ou societárias disponíveis em fontes autorizadas.',category:'Pessoa',input_kind:'name_or_document',provider_mode:'provider_required',novelty:false,sort_order:130},
 {slug:'shareholdings',title:'Participações societárias',description:'Informações sobre sociedades relacionadas à pessoa física ou jurídica.',category:'Empresa',input_kind:'cnpj',provider_mode:'public_cnpj',novelty:false,sort_order:140},
 {slug:'company-data',title:'Dados da empresa',description:'Informações da pessoa jurídica, incluindo CNAEs e quadro societário.',category:'Empresa',input_kind:'cnpj',provider_mode:'public_cnpj',novelty:false,sort_order:150},
 {slug:'person-location',title:'Localização de pessoa',description:'Dados de contato e endereço existentes no cadastro interno do escritório.',category:'Pessoa',input_kind:'name_or_cpf',provider_mode:'internal',novelty:false,sort_order:160},
 {slug:'vehicle-ownership',title:'Propriedade veicular',description:'Veículos registrados em nome da pessoa física ou jurídica por provedor autorizado.',category:'Veículos',input_kind:'cpf_cnpj',provider_mode:'provider_required',novelty:false,sort_order:170},
 {slug:'vehicle-data',title:'Dados do veículo',description:'Informações completas sobre o veículo e proprietário por integração autorizada.',category:'Veículos',input_kind:'plate',provider_mode:'provider_required',novelty:false,sort_order:180}
];

const icons:Record<string,any>={
 'phone-data':Phone,'financed-properties':House,'rural-properties':MapPin,'vehicle-debts':Car,'cnh-data':FileBadge2,'vehicle-tracking':Car,
 'economic-group':Network,'registration-status':FileBadge2,'professional-data':BriefcaseBusiness,'trademarks-patents':Star,'processes':Landmark,
 'credit-restrictions':BadgeDollarSign,'relationships':UsersRound,'shareholdings':Building2,'company-data':Building2,'person-location':MapPin,
 'vehicle-ownership':Car,'vehicle-data':Car
};

const inputLabel=(kind:string)=>({phone:'Telefone',cpf:'CPF',cnpj:'CNPJ',cpf_cnpj:'CPF ou CNPJ',plate:'Placa',name_or_cpf:'Nome ou CPF',name_or_document:'Nome, CPF ou CNPJ',document_or_name:'Nome ou documento'} as Record<string,string>)[kind]||'Dado da consulta';
const statusLabel=(status:string)=>status==='completed'?'Concluída':status==='provider_required'?'Integração necessária':status==='not_applicable'?'Não aplicável ao dado informado':status==='failed'?'Falhou':status;

async function functionError(error:any){
 try{const body=await error?.context?.clone?.().json?.();return body?.error||body?.message||error?.message||'Falha na consulta.'}catch{return error?.message||'Falha na consulta.'}
}

export default function Consultations(){
 const [catalog,setCatalog]=useState<CatalogItem[]>(fallbackCatalog),[query,setQuery]=useState(''),[category,setCategory]=useState('Todos'),[selected,setSelected]=useState<CatalogItem|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[results,setResults]=useState<SearchResult[]>([]);
 const cats=useMemo(()=>['Todos',...Array.from(new Set(catalog.map(x=>x.category)))],[catalog]);
 const visible=useMemo(()=>category==='Todos'?catalog:catalog.filter(x=>x.category===category),[catalog,category]);

 useEffect(()=>{(async()=>{if(!supabase)return;const {data,error}=await supabase.functions.invoke('investigation-search',{body:{action:'catalog'}});if(!error&&Array.isArray(data?.catalog)&&data.catalog.length)setCatalog(data.catalog)})()},[]);

 async function runOne(item:CatalogItem){
  setSelected(item);setNotice('');setResults([]);
  const q=query.trim();if(!q){setNotice(`Informe ${inputLabel(item.input_kind).toLowerCase()} para iniciar a consulta.`);return}
  if(!supabase){setNotice('Banco de dados indisponível.');return}
  setBusy(true);
  try{const {data,error}=await supabase.functions.invoke('investigation-search',{body:{action:'single',slug:item.slug,query:q}});if(error)throw new Error(await functionError(error));if(data?.error)throw new Error(data.error);setResults([{slug:item.slug,title:item.title,status:data.status,source:data.source,result:data.result,search_id:data.search_id}]);setNotice(data.status==='provider_required'?'A categoria é compatível com o dado, mas ainda depende de integração oficial/autorizada.':data.status==='not_applicable'?'O dado informado não é compatível com esta categoria. Use o formato indicado no cartão.':'Consulta concluída e registrada no histórico.')}catch(e:any){setNotice(e?.message||'Falha na consulta.')}finally{setBusy(false)}
 }

 async function runBatch(){
  setSelected(null);setNotice('');setResults([]);
  const q=query.trim();if(!q){setNotice('Informe o documento, nome, telefone ou placa que deseja investigar.');return}
  if(!supabase){setNotice('Banco de dados indisponível.');return}
  setBusy(true);
  try{const {data,error}=await supabase.functions.invoke('investigation-search',{body:{action:'batch',query:q,slugs:catalog.map(x=>x.slug)}});if(error)throw new Error(await functionError(error));if(data?.error)throw new Error(data.error);setResults(data.results||[]);const s=data.summary||{};setNotice(data.status==='failed'?'Não foi possível concluir as múltiplas consultas.':`Dado identificado como ${data.input_type||'desconhecido'}. ${s.completed||0} consulta(s) concluída(s), ${s.provider_required||0} aguardando integração, ${s.not_applicable||0} não aplicável(is) ao formato e ${s.failed||0} falha(s) real(is).`)}catch(e:any){setNotice(e?.message||'Falha nas múltiplas consultas.')}finally{setBusy(false)}
 }

 return <div className="module investigation-page">
  <div className="page-head"><div><h1>Investigação</h1><p>Consultas de pessoas, empresas, processos, patrimônio e veículos com fontes públicas, dados internos e integrações autorizadas.</p></div></div>
  <div className="system-bar"><span><ShieldCheck size={14}/> INVESTIGAÇÃO DE DADOS</span><span className="online">● CONSULTAS REGISTRADAS E AUDITÁVEIS</span></div>

  <div className="integration-panel investigation-search">
   <h3><Search size={17}/> Dado a investigar</h3>
   <div className="integration-form"><label className="wide">Nome, CPF, CNPJ, telefone, placa ou número CNJ<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={selected?`Informe ${inputLabel(selected.input_kind).toLowerCase()}`:'Digite o dado que deseja investigar'} onKeyDown={e=>{if(e.key==='Enter'&&selected)runOne(selected)}}/></label></div>
   <div className="investigation-tabs">{cats.map(c=><button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
  </div>

  <div className="investigation-grid">
   <button className="investigation-card" onClick={runBatch} disabled={busy} style={{textAlign:'left'}}>
    <div className="investigation-iconrow"><div className="investigation-icon"><Layers3 size={20}/></div><RotateCw size={15}/></div>
    <h3>Múltiplas Consultas</h3><p>Detecta automaticamente o tipo de dado e executa somente o que for compatível.</p><small>{busy?'EXECUTANDO...':'COMEÇAR'}</small>
   </button>
   {visible.map(item=>{const I=icons[item.slug]||Database;const available=item.provider_mode!=='provider_required';return <button key={item.slug} className={`investigation-card ${selected?.slug===item.slug?'selected':''}`} onClick={()=>runOne(item)} disabled={busy} style={{textAlign:'left'}}>
    {item.novelty&&<div style={{margin:'-18px -18px 14px',padding:'7px 10px',borderRadius:'14px 14px 0 0',textAlign:'center',fontSize:11,fontWeight:800,letterSpacing:'.04em',background:'#4a160f',color:'#f2d58e'}}>★ Novidade</div>}
    <div className="investigation-iconrow"><div className="investigation-icon"><I size={20}/></div><Star size={15}/></div>
    <h3>{item.title}</h3><p>{item.description}</p>
    <small style={{color:available?'#8be6bd':'#d6b36a'}}>{available?'CONSULTA DISPONÍVEL':'INTEGRAÇÃO NECESSÁRIA'}</small>
   </button>})}
  </div>

  {notice&&<div className="integration-notice">{busy?'Consultando fontes e registrando a pesquisa...':notice}</div>}

  {results.length>0&&<div className="integration-panel investigation-results"><h3><Database size={17}/> Resultado das consultas</h3><div className="signature-list">{results.map((x,i)=><div className="signature-row" key={`${x.slug||i}-${i}`} style={{alignItems:'flex-start'}}><div style={{width:'100%'}}><strong>{x.title||x.slug||'Consulta'}</strong><small>{statusLabel(x.status)} · {x.source||'fonte não informada'}</small>{x.error&&<p style={{margin:'8px 0 0',color:'#ffadba'}}>{x.error}</p>}{x.result?.message&&<p style={{margin:'8px 0 0'}}>{x.result.message}</p>}{x.result&&x.status==='completed'&&<pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word',fontSize:11,lineHeight:1.5,color:'#c9bea9',margin:'10px 0 0',padding:12,border:'1px solid rgba(217,164,65,.16)',borderRadius:10,background:'#090b0c',maxHeight:360,overflow:'auto'}}>{JSON.stringify(x.result,null,2)}</pre>}</div></div>)}</div></div>}

  <div className="integration-panel investigation-responsible"><h3><ShieldCheck size={17}/> Fontes e segurança</h3><p>O LEXOFFICE consulta apenas dados internos autorizados, fontes públicas permitidas e integrações oficiais. O lote detecta o formato informado e não trata categorias incompatíveis como falha. Categorias que realmente dependem de bureaus, DETRAN, bases patrimoniais, CNH ou outros fornecedores permanecem identificadas como “Integração necessária” até existir um provedor autorizado configurado.</p></div>
 </div>
}

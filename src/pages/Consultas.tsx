import { useMemo,useState } from 'react';
import { Search,Filter,Star,Phone,Home,Car,Network,IdCard,Briefcase,Copyright,Scale,Landmark,Users,Building2,MapPin,DollarSign } from 'lucide-react';

type Consulta={title:string;description:string;icon:any;kind:string};
const consultas:Consulta[]=[
 {title:'Dados por telefone',description:'Consulta de informações cadastrais disponíveis a partir de um número de telefone.',icon:Phone,kind:'Pessoa'},
 {title:'Imóveis financiados',description:'Consulta de imóveis financiados e situação das operações vinculadas ao CPF/CNPJ.',icon:Home,kind:'Patrimônio'},
 {title:'Imóveis rurais',description:'Consulta de informações de imóveis rurais em fontes oficiais disponíveis.',icon:Landmark,kind:'Patrimônio'},
 {title:'Débitos veiculares',description:'Consulta de débitos, multas, IPVA e licenciamento quando a fonte integrada permitir.',icon:Car,kind:'Veículos'},
 {title:'Dados da CNH',description:'Consulta de informações de CNH em fontes autorizadas e integradas.',icon:IdCard,kind:'Veículos'},
 {title:'Rastreamento de veículo',description:'Central para consultas de rastreamento veicular quando houver provedor autorizado conectado.',icon:Car,kind:'Veículos'},
 {title:'Grupo econômico',description:'Relações empresariais para identificação de possível grupo econômico.',icon:Network,kind:'Empresas'},
 {title:'Situação cadastral',description:'Situação cadastral de pessoa física ou jurídica em fontes oficiais disponíveis.',icon:IdCard,kind:'Pessoa'},
 {title:'Dados profissionais',description:'Consulta de vínculos e dados profissionais disponíveis em fontes autorizadas.',icon:Briefcase,kind:'Pessoa'},
 {title:'Marcas e patentes',description:'Informações e histórico de marcas e patentes relacionadas à pessoa física ou jurídica.',icon:Copyright,kind:'Empresas'},
 {title:'Processos',description:'Pesquisa de processos envolvendo pessoa física ou jurídica nas fontes judiciais integradas.',icon:Scale,kind:'Jurídico'},
 {title:'Restrição de crédito',description:'Consulta de restrições e informações de crédito por meio de provedor autorizado.',icon:DollarSign,kind:'Crédito'},
 {title:'Relacionamentos',description:'Consulta de relações familiares e societárias disponíveis em fontes autorizadas.',icon:Users,kind:'Pessoa'},
 {title:'Participações societárias',description:'Informações sobre sociedades relacionadas à pessoa física ou jurídica.',icon:Building2,kind:'Empresas'},
 {title:'Dados da empresa',description:'Dados cadastrais da pessoa jurídica, CNAEs e quadro societário em fontes oficiais.',icon:Building2,kind:'Empresas'},
 {title:'Localização de pessoa',description:'Consulta de endereços e meios de contato somente por provedores legalmente autorizados.',icon:MapPin,kind:'Pessoa'},
 {title:'Propriedade veicular',description:'Consulta de veículos vinculados à pessoa quando disponível em fonte autorizada.',icon:Car,kind:'Veículos'},
 {title:'Dados do veículo',description:'Consulta de dados cadastrais do veículo e informações disponibilizadas pelo provedor conectado.',icon:Car,kind:'Veículos'}
];
export default function Consultas(){
 const [q,setQ]=useState(''),[filter,setFilter]=useState('Todos'),[selected,setSelected]=useState<Consulta|null>(null);
 const kinds=['Todos',...Array.from(new Set(consultas.map(x=>x.kind)))];
 const list=useMemo(()=>consultas.filter(x=>(filter==='Todos'||x.kind===filter)&&(`${x.title} ${x.description}`.toLowerCase().includes(q.toLowerCase()))),[q,filter]);
 return <><div className="page-title"><h1>Consultas</h1><p>Central de pesquisas cadastrais, patrimoniais, empresariais e processuais.</p></div>
 <div className="integration-panel"><div className="integration-head"><div><span className="integration-pill"><Search size={14}/> NOVA CONSULTA</span><h2>O que deseja pesquisar?</h2><p>As consultas utilizam somente fontes públicas ou provedores autorizados conectados ao LEXOFFICE.</p></div></div>
 <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12}}><label className="field"><span>Pesquisar</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Pesquise pelo título ou descrição"/></label><label className="field"><span><Filter size={14}/> Filtro</span><select value={filter} onChange={e=>setFilter(e.target.value)}>{kinds.map(k=><option key={k}>{k}</option>)}</select></label></div></div>
 {selected&&<div className="integration-panel selected"><div className="integration-head"><div><span className="integration-pill">CONSULTA SELECIONADA</span><h2>{selected.title}</h2><p>{selected.description}</p></div><button className="integration-action" type="button" onClick={()=>setSelected(null)}>Fechar</button></div><div className="integration-notice">Para executar esta pesquisa, conecte um provedor autorizado em Integrações. O LEXOFFICE não consulta bases privadas sem autorização nem inventa resultados.</div></div>}
 <div className="cards" style={{gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))'}}>{list.map((x,i)=>{const Icon=x.icon;return <button type="button" key={x.title} className={`card ${selected?.title===x.title?'selected':''}`} style={{textAlign:'left',minHeight:220,cursor:'pointer'}} onClick={()=>setSelected(x)}><div className="card-icon"><Icon size={20}/></div><strong style={{fontSize:'1.15rem'}}>{x.title}</strong><span style={{lineHeight:1.65}}>{x.description}</span><small style={{marginTop:'auto'}}>{x.kind} · Iniciar consulta</small><Star size={16} style={{position:'absolute',right:18,top:18}}/></button>})}</div></>;
}

import {useEffect,useRef,useState} from 'react';
import {NavLink,Link,useLocation,useNavigate} from 'react-router-dom';
import {ChevronRight,ShieldCheck,CalendarDays,ClipboardList,VolumeX,Volume2,FileText,MessageCircle,X} from 'lucide-react';
import {areas,areaOf,type NavItem} from '../navigation/areas';
import './workspace-sidebar.css';
const STORAGE='lexoffice-expanded-area-v1';
const PLAY_STORAGE='sf-guardian-play-enabled-v1';
function welcomeMessage(){
 const hour=Number(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 const greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
 return `${greeting}, Dra.! 🐾 Já estou de olho em tudo por aqui!`;
}
export default function WorkspaceSidebar({canSee,onNavigate,unread=0}:{canSee:(item:NavItem)=>boolean;onNavigate:()=>void;unread?:number}){
 const {pathname}=useLocation();const navigate=useNavigate();const current=areaOf(pathname);
 const [expanded,setExpanded]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');return saved?.currentArea===current.label&&typeof saved.expanded==='string'?saved.expanded:current.label}catch{return current.label}});
 const [playEnabled,setPlayEnabled]=useState(()=>{try{return localStorage.getItem(PLAY_STORAGE)!=='false'}catch{return true}});
 const [reduceMotion,setReduceMotion]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [menuOpen,setMenuOpen]=useState(false),[showWelcome,setShowWelcome]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduceMotion(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
 useEffect(()=>{try{localStorage.setItem(PLAY_STORAGE,String(playEnabled))}catch{}},[playEnabled]);
 useEffect(()=>{try{if(!sessionStorage.getItem('sf-guardian-welcomed-v1')){sessionStorage.setItem('sf-guardian-welcomed-v1','1');setShowWelcome(true);const timer=setTimeout(()=>setShowWelcome(false),8000);return()=>clearTimeout(timer)}}catch{}},[]);
 const previousArea=useRef(current.label);useEffect(()=>{if(previousArea.current!==current.label){setExpanded(current.label);previousArea.current=current.label}},[current.label]);
 useEffect(()=>{try{localStorage.setItem(STORAGE,JSON.stringify({currentArea:current.label,expanded}))}catch{}},[expanded,current.label]);
 const go=(path:string)=>{setMenuOpen(false);navigate(path);onNavigate()};
 const animated=playEnabled&&!reduceMotion;
 return <div className="workspace-sidebar">
  <div className={`sf-guardian ${animated?'sf-guardian-animated':''} ${showWelcome&&animated?'sf-guardian-welcome':''}`}>
   {showWelcome&&<div className="sf-guardian-greeting" role="status" aria-live="polite">{welcomeMessage()}</div>}
   <button type="button" className="sf-guardian-trigger" aria-expanded={menuOpen} aria-controls="sf-guardian-actions" onClick={()=>setMenuOpen(value=>!value)} aria-label="Abrir opções da Guardiã SF">
    <span className="sf-guardian-portrait"><img className="sf-guardian-dog" src="/brand/guardia-sf.webp" alt="" aria-hidden="true"/><ShieldCheck size={17} aria-hidden="true"/></span>
    <span className="sf-guardian-copy"><strong>Guardiã SF</strong><small>{unread>0?`${unread} mensagem(ns) aguardando atenção`:'Superadvogadas em ação'}</small></span>
    <ChevronRight className="sf-guardian-chevron" size={16} aria-hidden="true"/>
   </button>
   {menuOpen&&<div className="sf-guardian-menu" id="sf-guardian-actions" aria-label="Ações da Guardiã SF">
    <button type="button" className="sf-guardian-close" onClick={()=>setMenuOpen(false)} aria-label="Fechar opções da Guardiã"><X size={16}/></button>
    <button type="button" onClick={()=>go('/afazeres')}><ClipboardList size={17}/>Ver minhas prioridades</button>
    <button type="button" onClick={()=>go('/processos')}><FileText size={17}/>Consultar prazos</button>
    <button type="button" onClick={()=>go('/agenda')}><CalendarDays size={17}/>Ver audiências</button>
    <button type="button" onClick={()=>go('/donna')}><MessageCircle size={17}/>Abrir briefing da Donna</button>
    <button type="button" aria-pressed={!playEnabled} onClick={()=>setPlayEnabled(value=>!value)}>{playEnabled?<VolumeX size={17}/>:<Volume2 size={17}/>} {playEnabled?'Silenciar animações':'Ativar animações'}</button>
   </div>}
  </div>
  <span className="workspace-sidebar-label">ÁREAS DE TRABALHO</span>
  {areas.map((area,index)=>{const items=area.tabs.filter(canSee);if(!items.length)return null;const open=expanded===area.label;const active=current.label===area.label;return <div className={`workspace-nav-group ${area.footer?'workspace-nav-footer':''}`} key={area.label}>{items.length===1?<NavLink to={items[0].path} onClick={onNavigate} className={`workspace-area-toggle ${active?'is-current-area':''}`}><area.icon size={18}/><span>{area.label}</span></NavLink>:<><button className={`workspace-area-toggle ${active?'is-current-area':''}`} aria-expanded={open} aria-controls={`workspace-submenu-${index}`} onClick={()=>setExpanded(open?'':area.label)}><area.icon size={18}/><span>{area.label}</span>{area.label==='Atendimento'&&unread>0&&<small className="workspace-nav-count">{unread>99?'99+':unread}</small>}<ChevronRight size={14} className="workspace-area-chevron"/></button><div id={`workspace-submenu-${index}`} className="workspace-submenu" hidden={!open}>{items.map(item=>{const exact=pathname===item.path;const match=exact||(item.path!=='/'&&pathname.startsWith(item.path+'/')&&!items.some(other=>other.path!==item.path&&(pathname===other.path||pathname.startsWith(other.path+'/'))&&other.path.length>item.path.length));return <Link key={item.path} to={item.path} className={`workspace-submenu-link ${match?'is-current-page':''}`} aria-current={match?'page':undefined} onClick={onNavigate}>{item.label}</Link>})}</div></>}</div>})}
 </div>
}
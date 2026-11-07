import {useEffect,useState,useRef} from 'react';
import {NavLink,Link,useLocation} from 'react-router-dom';
import {ChevronRight,ShieldCheck} from 'lucide-react';
import {areas,areaOf,type NavItem} from '../navigation/areas';
import './workspace-sidebar.css';
const STORAGE='lexoffice-expanded-area-v1';
const PLAY_STORAGE='sf-guardian-play-enabled-v1';
const PLAY_MOODS=['ball','peek','nap','wag','run'] as const;
type PlayMood=typeof PLAY_MOODS[number];
export default function WorkspaceSidebar({canSee,onNavigate,unread=0}:{canSee:(item:NavItem)=>boolean;onNavigate:()=>void;unread?:number}){
 const {pathname}=useLocation();const current=areaOf(pathname);
 const [expanded,setExpanded]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');return saved?.currentArea===current.label&&typeof saved.expanded==='string'?saved.expanded:current.label}catch{return current.label}});
 const [playEnabled,setPlayEnabled]=useState(()=>{try{return localStorage.getItem(PLAY_STORAGE)!=='false'}catch{return true}});
 const [playMood,setPlayMood]=useState<PlayMood|null>(null);
 const [reduceMotion,setReduceMotion]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduceMotion(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
 useEffect(()=>{try{localStorage.setItem(PLAY_STORAGE,String(playEnabled))}catch{}},[playEnabled]);
 useEffect(()=>{
  if(!playEnabled||reduceMotion||unread>0){setPlayMood(null);return}
  let next:ReturnType<typeof setTimeout>;let clear:ReturnType<typeof setTimeout>;
  const schedule=()=>{next=setTimeout(()=>{
   const active=document.activeElement;
   const editing=active instanceof HTMLElement&&(active.matches('input,textarea,select,[contenteditable="true"]')||active.closest('[role="dialog"]'));
   if(document.visibilityState==='visible'&&!editing&&!document.querySelector('[aria-modal="true"],[data-critical-alert="true"]')){
    setPlayMood(PLAY_MOODS[Math.floor(Math.random()*PLAY_MOODS.length)]);
    clear=setTimeout(()=>setPlayMood(null),3200);
   }
   schedule();
  },90000+Math.random()*150000)};
  schedule();return()=>{clearTimeout(next);clearTimeout(clear);setPlayMood(null)}
 },[playEnabled,reduceMotion,unread]);
 const previousArea=useRef(current.label);useEffect(()=>{if(previousArea.current!==current.label){setExpanded(current.label);previousArea.current=current.label}},[current.label]);
 useEffect(()=>{try{localStorage.setItem(STORAGE,JSON.stringify({currentArea:current.label,expanded}))}catch{}},[expanded,current.label]);
 return <div className="workspace-sidebar"><div className="sf-guardian" aria-label="Guardiã SF, mascote do escritório"><span className={`sf-guardian-dog ${playMood?'sf-play-'+playMood:''}`} aria-hidden="true">🐶</span><div><strong>Guardiã SF</strong><small>{playMood==='ball'?'🎾 Hora da bolinha!':playMood==='nap'?'💤 Soneca rápida':playMood==='peek'?'🐾 Oi, estou aqui!':playMood==='run'?'🐾 Corridinha!':playMood==='wag'?'💖 Um carinho para você':'Superadvogadas em ação'}</small></div><button type="button" className="sf-guardian-play-toggle" aria-pressed={playEnabled} aria-label={playEnabled?'Pausar brincadeiras da Guardiã SF':'Ativar brincadeiras da Guardiã SF'} title={playEnabled?'Pausar brincadeiras':'Ativar brincadeiras'} onClick={()=>setPlayEnabled(v=>!v)}>{playEnabled?'Ⅱ':'▶'}</button><ShieldCheck size={19} aria-hidden="true"/></div><span className="workspace-sidebar-label">ÁREAS DE TRABALHO</span>{areas.map((area,index)=>{const items=area.tabs.filter(canSee);if(!items.length)return null;const open=expanded===area.label;const active=current.label===area.label;return <div className={`workspace-nav-group ${area.footer?'workspace-nav-footer':''}`} key={area.label}>{items.length===1?<NavLink to={items[0].path} onClick={onNavigate} className={`workspace-area-toggle ${active?'is-current-area':''}`}><area.icon size={18}/><span>{area.label}</span></NavLink>:<><button className={`workspace-area-toggle ${active?'is-current-area':''}`} aria-expanded={open} aria-controls={`workspace-submenu-${index}`} onClick={()=>setExpanded(open?'':area.label)}><area.icon size={18}/><span>{area.label}</span>{area.label==='Atendimento'&&unread>0&&<small className="workspace-nav-count">{unread>99?'99+':unread}</small>}<ChevronRight size={14} className="workspace-area-chevron"/></button><div id={`workspace-submenu-${index}`} className="workspace-submenu" hidden={!open}>{items.map(item=>{const exact=pathname===item.path;const match=exact||(item.path!=='/'&&pathname.startsWith(item.path+'/')&&!items.some(other=>other.path!==item.path&&(pathname===other.path||pathname.startsWith(other.path+'/'))&&other.path.length>item.path.length));return <Link key={item.path} to={item.path} className={`workspace-submenu-link ${match?'is-current-page':''}`} aria-current={match?'page':undefined} onClick={onNavigate}>{item.label}</Link>})}</div></>}</div>})}</div>
}

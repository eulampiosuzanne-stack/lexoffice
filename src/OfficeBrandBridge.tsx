import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { applyVisibility, readVisibility, VISIBILITY_KEY } from './lib/visualPreferences';
import { applyLexTheme, readLexTheme, type LexTheme } from './ThemeController';
export default function OfficeBrandBridge({children}:{children:React.ReactNode}){
  const [visibility,setVisibility]=useState(readVisibility);
  const [theme,setTheme]=useState<LexTheme>(readLexTheme);
  const [scale,setScale]=useState(()=>{try{return Math.min(1.25,Math.max(1,Number(localStorage.getItem('lexoffice-font-scale')||1)))}catch{return 1}});
  useEffect(()=>{
    const sync=(event:Event)=>setTheme((event as CustomEvent<LexTheme>).detail);
    const storage=(event:StorageEvent)=>{if(event.key==='lexoffice-theme')applyLexTheme(readLexTheme());if(event.key===VISIBILITY_KEY){const value=readVisibility();applyVisibility(value);setVisibility(value)}};
    window.addEventListener('lexoffice-theme-change',sync);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('lexoffice-theme-change',sync);window.removeEventListener('storage',storage)};
  },[]);
  useEffect(()=>{document.documentElement.style.setProperty('--vision-scale',String(scale));try{localStorage.setItem('lexoffice-font-scale',String(scale))}catch{}},[scale]);
  useEffect(()=>{applyVisibility(visibility)},[visibility]);
  return <>{children}<div className="vision-dock" role="group" aria-label="Acessibilidade visual"><button type="button" onClick={()=>setScale(v=>Math.max(1,Number((v-.05).toFixed(2))))} disabled={scale<=1} aria-label="Diminuir tamanho do texto">A−</button><span aria-live="polite">{Math.round(scale*100)}%</span><button type="button" onClick={()=>setScale(v=>Math.min(1.25,Number((v+.05).toFixed(2))))} disabled={scale>=1.25} aria-label="Aumentar tamanho do texto">A+</button><button type="button" className="vision-visibility" aria-pressed={visibility} onClick={()=>setVisibility(value=>!value)} title="Reforçar bordas, sombras e legibilidade"><Eye size={18}/>{visibility?'Visibilidade ativada':'Maior visibilidade'}</button><button type="button" className="vision-theme" onClick={()=>applyLexTheme(theme==='dark'?'light':'dark')} aria-label={theme==='dark'?'Ativar modo claro':'Ativar modo escuro'}>{theme==='dark'?'☀ Claro':'☾ Escuro'}</button></div></>;
}

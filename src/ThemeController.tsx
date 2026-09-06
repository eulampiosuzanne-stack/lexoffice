import { useEffect,useState } from 'react';
import { Moon,Sun } from 'lucide-react';

type Theme='dark'|'light';
const STORAGE_KEY='lexoffice-theme';

function resolveInitialTheme():Theme{
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved==='dark'||saved==='light')return saved;
  }catch{}
  return window.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark';
}

function applyTheme(theme:Theme){
  document.documentElement.dataset.lexTheme=theme;
  document.documentElement.style.colorScheme=theme;
  try{localStorage.setItem(STORAGE_KEY,theme)}catch{}
}

export default function ThemeController(){
  const [theme,setTheme]=useState<Theme>(resolveInitialTheme);
  const [visible,setVisible]=useState(false);

  useEffect(()=>{applyTheme(theme)},[theme]);
  useEffect(()=>{
    const sync=()=>setVisible(Boolean(document.querySelector('.app')));
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  if(!visible)return null;
  const isDark=theme==='dark';
  return <button
    type="button"
    className="lex-theme-toggle"
    onClick={()=>setTheme(isDark?'light':'dark')}
    aria-label={isDark?'Ativar tema claro':'Ativar tema escuro'}
    title={isDark?'Tema claro':'Tema escuro'}
  >
    {isDark?<Sun size={17}/>:<Moon size={17}/>}<span>{isDark?'Claro':'Escuro'}</span>
  </button>;
}

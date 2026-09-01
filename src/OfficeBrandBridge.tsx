import { useEffect, useState } from 'react';

/**
 * Ponte visual global do LEXOFFICE.
 * Mantém a identidade institucional e oferece controles persistentes de
 * acessibilidade visual (tema e escala de leitura) sem alterar os dados do sistema.
 */
export default function OfficeBrandBridge({children}:{children:React.ReactNode}){
  const [dark,setDark]=useState(()=>localStorage.getItem('lexoffice-theme')==='dark');
  const [scale,setScale]=useState(()=>Math.min(1.25,Math.max(1,Number(localStorage.getItem('lexoffice-font-scale')||1))));

  useEffect(()=>{
    const root=document.documentElement;
    root.classList.remove('has-office-logo');
    root.style.removeProperty('--office-logo');
    root.style.removeProperty('--office-primary');
    root.style.removeProperty('--office-secondary');
    root.classList.toggle('dark',dark);
    root.style.setProperty('--vision-scale',String(scale));
    localStorage.setItem('lexoffice-theme',dark?'dark':'light');
    localStorage.setItem('lexoffice-font-scale',String(scale));
  },[dark,scale]);

  const smaller=()=>setScale(v=>Math.max(1,Number((v-.05).toFixed(2))));
  const larger=()=>setScale(v=>Math.min(1.25,Number((v+.05).toFixed(2))));

  return <>
    {children}
    <div className="vision-dock" role="group" aria-label="Acessibilidade visual">
      <button type="button" onClick={smaller} disabled={scale<=1} aria-label="Diminuir tamanho do texto">A−</button>
      <span aria-live="polite">{Math.round(scale*100)}%</span>
      <button type="button" onClick={larger} disabled={scale>=1.25} aria-label="Aumentar tamanho do texto">A+</button>
      <button type="button" className="vision-theme" onClick={()=>setDark(v=>!v)} aria-label={dark?'Ativar modo claro':'Ativar modo escuro'}>{dark?'☀ Claro':'☾ Escuro'}</button>
    </div>
  </>;
}

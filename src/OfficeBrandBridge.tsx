import { useEffect } from 'react';
import { applyVisibility } from './lib/visualPreferences';
import { applyLexTheme, readLexTheme } from './ThemeController';

// Melhor visibilidade sempre ligada e letra um pouco menor; sem a régua flutuante (pedido da Dra., 27/11).
export default function OfficeBrandBridge({children}:{children:React.ReactNode}){
  useEffect(()=>{applyVisibility(true);document.documentElement.style.setProperty('--vision-scale','0.92')},[]);
  useEffect(()=>{
    // O tema claro/escuro (botão do topo) acompanha outras abas; 'lexoffice-theme-change' segue no ThemeController.
    const storage=(event:StorageEvent)=>{if(event.key==='lexoffice-theme')applyLexTheme(readLexTheme())};
    window.addEventListener('storage',storage);
    return()=>window.removeEventListener('storage',storage);
  },[]);
  return <>{children}</>;
}

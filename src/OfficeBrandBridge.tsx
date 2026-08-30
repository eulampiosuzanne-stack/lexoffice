import { useEffect } from 'react';

/**
 * LEXOFFICE mantém identidade visual própria em toda a aplicação.
 * Logo e cores cadastradas do escritório são usadas em documentos/timbrados,
 * nunca para substituir a marca da interface do produto.
 */
export default function OfficeBrandBridge({children}:{children:React.ReactNode}){
  useEffect(()=>{
    const root=document.documentElement;
    root.classList.remove('has-office-logo');
    root.style.removeProperty('--office-logo');
    root.style.removeProperty('--office-primary');
    root.style.removeProperty('--office-secondary');
  },[]);
  return children;
}

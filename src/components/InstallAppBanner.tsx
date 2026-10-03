import {useEffect,useState} from 'react';
import {canPromptInstall,isIOS,isStandalone,onInstallChange,promptInstall} from '../pwa-install';

// Convite para o cliente instalar o app na tela inicial (Android/Chrome: instalação direta; iPhone: passo a passo).
export default function InstallAppBanner(){
  const[,refresh]=useState(0),[help,setHelp]=useState(false),[hidden,setHidden]=useState(()=>sessionStorage.getItem('sf-install-hidden')==='1');
  useEffect(()=>onInstallChange(()=>refresh(x=>x+1)),[]);
  if(hidden||isStandalone())return null;
  const ios=isIOS();
  async function install(){
    if(canPromptInstall()){await promptInstall();return}
    setHelp(true);
  }
  function close(){sessionStorage.setItem('sf-install-hidden','1');setHidden(true)}
  return <div className="cp-install" role="region" aria-label="Baixar o aplicativo">
    <div className="cp-install-text"><strong>📲 Baixe o app do escritório</strong><span>Acompanhe seu processo e receba avisos direto no celular.</span></div>
    <div className="cp-install-actions"><button type="button" className="cp-install-btn" onClick={install}>Baixar app</button><button type="button" className="cp-install-close" aria-label="Agora não" onClick={close}>Agora não</button></div>
    {help&&<div className="cp-install-help">{ios
      ?<>No iPhone: toque em <b>Compartilhar</b> (quadrado com seta para cima) e depois em <b>Adicionar à Tela de Início</b>.</>
      :<>Toque no menu <b>⋮</b> do navegador e escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</>}</div>}
  </div>;
}

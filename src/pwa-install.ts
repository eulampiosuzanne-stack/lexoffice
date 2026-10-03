// Captura o convite de instalação do navegador o mais cedo possível (importado em main.tsx)
// e expõe para os componentes mostrarem o botão "Baixar o app".
let deferredPrompt:any=null;
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(fn=>fn());

export const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||(navigator as any).standalone===true;
export const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
export const canPromptInstall=()=>!!deferredPrompt;
export function onInstallChange(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}

export async function promptInstall():Promise<'accepted'|'dismissed'|'unavailable'>{
  if(!deferredPrompt)return 'unavailable';
  deferredPrompt.prompt();
  const choice=await deferredPrompt.userChoice.catch(()=>null);
  deferredPrompt=null;notify();
  return choice?.outcome==='accepted'?'accepted':'dismissed';
}

window.addEventListener('beforeinstallprompt',(event:any)=>{event.preventDefault();deferredPrompt=event;notify()});
window.addEventListener('appinstalled',()=>{deferredPrompt=null;notify()});

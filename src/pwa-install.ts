let deferredPrompt:any=null;
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);

function removeButton(){document.getElementById('lexoffice-install-app')?.remove()}
function ensureButton(){
  if(isStandalone()||document.getElementById('lexoffice-install-app'))return;
  const b=document.createElement('button');
  b.id='lexoffice-install-app';b.className='lexoffice-install-app';b.type='button';b.textContent='Instalar LEXOFFICE';
  b.setAttribute('aria-label','Instalar aplicativo LEXOFFICE');
  b.addEventListener('click',async()=>{
    if(deferredPrompt){deferredPrompt.prompt();const choice=await deferredPrompt.userChoice.catch(()=>null);if(choice?.outcome==='accepted'){deferredPrompt=null;removeButton()}return}
    if(isIOS()){
      alert('No iPhone/iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.');
      return;
    }
    alert('Abra o menu do navegador e escolha “Instalar LEXOFFICE” ou “Adicionar à tela inicial”.');
  });
  document.body.appendChild(b);
}

window.addEventListener('beforeinstallprompt',(event:any)=>{event.preventDefault();deferredPrompt=event;ensureButton()});
window.addEventListener('appinstalled',()=>{deferredPrompt=null;removeButton()});
window.addEventListener('load',()=>{if(!isStandalone())setTimeout(ensureButton,1200)});

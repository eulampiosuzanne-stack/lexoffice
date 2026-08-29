import { cloneElement, isValidElement, useEffect, useState } from 'react';

const IDLE_REFRESH_MS=45000;

function userIsEditing(){
  const el=document.activeElement as HTMLElement|null;
  if(!el)return false;
  const tag=el.tagName?.toLowerCase();
  return tag==='input'||tag==='textarea'||tag==='select'||el.isContentEditable;
}

export default function AutoRefreshBridge({children}:{children:any}){
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    let lastInteraction=Date.now();
    const touch=()=>{lastInteraction=Date.now()};
    const refresh=()=>{
      if(document.hidden||userIsEditing())return;
      if(Date.now()-lastInteraction<12000)return;
      setVersion(v=>v+1);
    };
    const timer=window.setInterval(refresh,IDLE_REFRESH_MS);
    const onVisible=()=>{if(!document.hidden)window.setTimeout(refresh,800)};
    const onFocus=()=>window.setTimeout(refresh,800);
    ['keydown','pointerdown','touchstart','input','change'].forEach(evt=>window.addEventListener(evt,touch,{passive:true}));
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('focus',onFocus);
    return()=>{
      window.clearInterval(timer);
      ['keydown','pointerdown','touchstart','input','change'].forEach(evt=>window.removeEventListener(evt,touch as any));
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('focus',onFocus);
    };
  },[]);
  return isValidElement(children)?cloneElement(children as any,{key:`auto-refresh-${version}`}):children;
}

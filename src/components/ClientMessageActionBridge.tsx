import { useEffect,useState } from 'react';
import { supabase } from '../lib/supabase';
import ClientMessageScheduler from './ClientMessageScheduler';

type ClientTarget={id:string;name:string;phone:string|null;whatsapp:string|null};
const clean=(v:any)=>String(v??'').replace(/\s+/g,' ').trim();
const digits=(v:any)=>String(v??'').replace(/\D/g,'');

export default function ClientMessageActionBridge(){
 const [target,setTarget]=useState<ClientTarget|null>(null);
 const [initialMessage,setInitialMessage]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  const onClick=async(event:MouseEvent)=>{
   if(window.location.pathname!=='/clientes')return;
   const button=(event.target as HTMLElement|null)?.closest?.('button') as HTMLButtonElement|null;
   if(!button)return;
   const label=clean(button.innerText);
   if(label!=='Mensagem'&&label!=='Enviar mensagem')return;
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
   let name='',phone='';
   const row=button.closest('tr');
   if(row){const cells=Array.from(row.querySelectorAll('td'));name=clean(cells[1]?.querySelector('b')?.textContent||cells[1]?.textContent);phone=clean(cells[4]?.textContent)}
   if(!name){const card=button.closest('.modal-card');name=clean(card?.querySelector('.modal-head h2')?.textContent).replace(/^\s*/,'');const whats=Array.from(card?.querySelectorAll('.card')||[]).find(x=>clean(x.querySelector('span')?.textContent)==='WhatsApp');phone=clean(whats?.querySelector('strong')?.textContent)}
   if(!name)return;
   if(!supabase)return;
   let query=supabase.from('clients').select('id,name,phone,whatsapp').eq('name',name).limit(5);
   const {data}=await query;
   const candidates=(data||[]) as ClientTarget[];
   const p=digits(phone);
   const found=candidates.find(c=>p&&[digits(c.whatsapp),digits(c.phone)].includes(p))||candidates[0];
   if(found){setInitialMessage('');setTarget(found)}
  };
  document.addEventListener('click',onClick,true);
  return()=>document.removeEventListener('click',onClick,true)
 },[]);
 if(!target)return null;
 return <><ClientMessageScheduler client={target} initialMessage={initialMessage} onClose={()=>setTarget(null)} onSent={(m)=>{setNotice(m);setTarget(null)}}/>{notice&&null}</>
}

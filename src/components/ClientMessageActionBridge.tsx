import { useEffect,useState } from 'react';
import { supabase } from '../lib/supabase';
import ClientMessageScheduler from './ClientMessageScheduler';

type ClientTarget={id?:string|null;name:string;phone:string|null;whatsapp:string|null};
type SchedulerTarget={client:ClientTarget;conversationId?:string|null;initialMessage?:string};
const clean=(v:any)=>String(v??'').replace(/\s+/g,' ').trim();
const digits=(v:any)=>String(v??'').replace(/\D/g,'');

export default function ClientMessageActionBridge(){
 const [target,setTarget]=useState<SchedulerTarget|null>(null);
 useEffect(()=>{
  const onClick=async(event:MouseEvent)=>{
   const button=(event.target as HTMLElement|null)?.closest?.('button') as HTMLButtonElement|null;
   if(!button||!supabase)return;
   const path=window.location.pathname,label=clean(button.innerText);

   if(path==='/atendimento'&&(label==='Programar'||label==='Programar mensagem')){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const chat=document.querySelector('.service-chat-person');
    const name=clean(chat?.querySelector('b')?.textContent)||'Contato';
    const phone=clean(chat?.querySelector('small')?.textContent);
    if(!phone)return;
    const activeButton=document.querySelector('.service-conv.active') as HTMLButtonElement|null;
    let conversationId:string|null=null,clientId:string|null=null,contactName=name;
    if(activeButton){
      const listedName=clean(activeButton.querySelector('strong')?.textContent);if(listedName)contactName=listedName;
      const {data:convs}=await supabase.from('whatsapp_conversations').select('id,contact:whatsapp_contacts(client_id,name,phone)').order('last_message_at',{ascending:false,nullsFirst:false}).limit(150);
      const p=digits(phone);
      const match=(convs||[]).find((c:any)=>digits(c.contact?.phone)===p);
      if(match){conversationId=match.id;clientId=match.contact?.client_id||null;contactName=match.contact?.name||contactName}
    }
    setTarget({client:{id:clientId,name:contactName,phone,whatsapp:phone},conversationId,initialMessage:(document.querySelector('.service-compose textarea') as HTMLTextAreaElement|null)?.value||''});
    return;
   }

   if(path!=='/clientes')return;
   if(label!=='Mensagem'&&label!=='Enviar mensagem')return;
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
   let name='',phone='';
   const row=button.closest('tr');
   if(row){const cells=Array.from(row.querySelectorAll('td'));name=clean(cells[1]?.querySelector('b')?.textContent||cells[1]?.textContent);phone=clean(cells[4]?.textContent)}
   if(!name){const card=button.closest('.modal-card');name=clean(card?.querySelector('.modal-head h2')?.textContent);const whats=Array.from(card?.querySelectorAll('.card')||[]).find(x=>clean(x.querySelector('span')?.textContent)==='WhatsApp');phone=clean(whats?.querySelector('strong')?.textContent)}
   if(!name)return;
   const {data}=await supabase.from('clients').select('id,name,phone,whatsapp').eq('name',name).limit(5);
   const candidates=(data||[]) as ClientTarget[];const p=digits(phone);
   const found=candidates.find(c=>p&&[digits(c.whatsapp),digits(c.phone)].includes(p))||candidates[0];
   if(found)setTarget({client:found,initialMessage:''});
  };
  document.addEventListener('click',onClick,true);
  return()=>document.removeEventListener('click',onClick,true)
 },[]);
 if(!target)return null;
 return <ClientMessageScheduler client={target.client} conversationId={target.conversationId} initialMessage={target.initialMessage||''} onClose={()=>setTarget(null)} onSent={()=>setTarget(null)}/>;
}

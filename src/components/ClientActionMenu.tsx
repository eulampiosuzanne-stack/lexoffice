import {useEffect,useId,useRef,useState} from 'react';
import {MoreHorizontal} from 'lucide-react';
// React 18 DOM typings predate this standard HTML attribute.
const nativePopover={popover:'auto'};
export default function ClientActionMenu({name,onOpen,onDelete}:{name:string;onOpen:()=>void;onDelete:()=>void}){
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId();const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0});
 useEffect(()=>{const menu=panel.current;if(!menu)return;const sync=()=>setOpen(menu.matches(':popover-open'));menu.addEventListener('toggle',sync);return()=>menu.removeEventListener('toggle',sync);},[]);
 function toggle(){const menu=panel.current;if(!menu)return;if(menu.matches(':popover-open')){menu.hidePopover();setOpen(false);return;}const rect=trigger.current?.getBoundingClientRect();if(!rect)return;setPosition({top:Math.max(8,Math.min(rect.bottom+8,window.innerHeight-130)),left:Math.max(8,Math.min(rect.right-200,window.innerWidth-208))});menu.showPopover();setOpen(true);}
 function act(action:()=>void){panel.current?.hidePopover();trigger.current?.focus();action();}
 return <><button type="button" ref={trigger} className="clients-icon-action" aria-label={`Mais ações de ${name}`} aria-controls={id} aria-expanded={open} onClick={toggle}><MoreHorizontal size={18}/></button><div ref={panel} id={id} {...nativePopover} className="clients-action-popover" role="group" aria-label={`Ações de ${name}`} style={position}><button type="button" onClick={()=>act(onOpen)}>Abrir ficha</button><button type="button" className="clients-danger" onClick={()=>act(onDelete)}>Excluir cliente</button></div></>;
}

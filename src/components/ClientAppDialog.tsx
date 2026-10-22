import {useEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
export default function ClientAppDialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const id=useId();const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const el=dialog.current;el?.showModal();return()=>{el?.close();previous?.focus();};},[]);
 return <dialog className="client-app-dialog" ref={dialog} aria-labelledby={id} onCancel={event=>{event.preventDefault();close.current();}}><header><h2 id={id}>{title}</h2><button type="button" className="app-message-icon-button" onClick={onClose} aria-label="Fechar janela"><X size={20}/></button></header>{children}</dialog>;
}

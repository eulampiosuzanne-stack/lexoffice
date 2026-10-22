import {Children,cloneElement,isValidElement,useEffect,useRef,type ReactElement,type ReactNode,type KeyboardEvent} from 'react';

type ItemProps={children?:ReactNode;className?:string|((state:any)=>string);role?:string;style?:unknown;disabled?:boolean;type?:string;'aria-selected'?:boolean;'aria-pressed'?:boolean;'aria-current'?:string|boolean;[key:string]:any};
type Props={children:ReactNode;label?:string;'aria-label'?:string;variant?:'underline'|'segmented'|'sections';id?:string};
function textOf(node:ReactNode):string{return Children.toArray(node).map(child=>typeof child==='string'||typeof child==='number'?String(child):isValidElement<{children?:ReactNode}>(child)?textOf(child.props.children):'').join(' ').replace(/\s+/g,' ').trim()}
function selected(props:ItemProps){return props['aria-selected']===true||props['aria-pressed']===true||!!props['aria-current']||(typeof props.className==='string'&&/(^|\s)(active|selected|primary)(\s|$)/.test(props.className))}
/** Links keep routing semantics; local sections and filters remain labelled buttons. */
export default function InternalNavigation({children,label,'aria-label':ariaLabel,variant='underline',id}:Props){
 const root=useRef<HTMLDivElement>(null);const items=Children.toArray(children);const current=items.findIndex(child=>isValidElement<ItemProps>(child)&&selected(child.props));const name=label||ariaLabel||'Navegação desta área';
 useEffect(()=>{const el=root.current?.querySelector<HTMLElement>('[aria-current]:not([aria-current="false"]),[aria-pressed="true"],.active');const strip=root.current?.querySelector<HTMLElement>('.lx-navigation-strip');if(el&&strip&&variant!=='sections'){const left=el.offsetLeft-strip.offsetLeft;if(left<strip.scrollLeft)strip.scrollLeft=left;else if(left+el.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=left+el.offsetWidth-strip.clientWidth}},[children,current,variant]);
 function move(event:KeyboardEvent<HTMLDivElement>){if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const controls=Array.from(root.current?.querySelectorAll<HTMLElement>('.lx-navigation-strip > button:not(:disabled),.lx-navigation-strip > a[href]')||[]);const index=controls.indexOf(document.activeElement as HTMLElement);if(index<0||!controls.length)return;if(variant!=='sections'&&['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?controls.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+controls.length)%controls.length;controls[next].focus()}
 return <div ref={root} id={id} className={`lx-navigation lx-navigation--${variant}`}>
 {variant==='sections'&&<label className="lx-navigation-mobile">{name}<select value={current<0?'':String(current)} onChange={event=>root.current?.querySelector<HTMLElement>(`[data-navigation-index="${event.target.value}"]`)?.click()}>{current<0&&<option value="" disabled>Escolha uma seção</option>}{items.map((child,index)=>isValidElement<ItemProps>(child)?<option key={child.key||index} value={index} disabled={child.props.disabled}>{textOf(child.props.children)}</option>:null)}</select></label>}
 <div className="lx-navigation-strip" role="group" aria-label={name} onKeyDown={move}>{items.map((child,index)=>{
  if(!isValidElement<ItemProps>(child))return child;const props=child.props;const active=selected(props);const isButton=child.type==='button';const next:ItemProps={role:undefined,'data-navigation-index':index,'aria-selected':undefined};
  // Remove presentation from legacy controls while retaining events, routes and disabled state.
  next.style=undefined;next.className=typeof props.className==='function'?(state:any)=>`lx-navigation-item ${state.isActive?'is-current':''}`:`lx-navigation-item ${active?'is-current':''}`;
  if(isButton){next.type='button';next['aria-current']=undefined;next['aria-pressed']=active;}else if(active)next['aria-current']='page';
  return cloneElement(child as ReactElement<ItemProps>,next);
 })}</div></div>
}
export function SectionWorkspace({navigation,children}:{navigation:ReactNode;children:ReactNode}){return <div className={navigation?'lx-section-workspace':'lx-section-workspace-single'}>{navigation&&<aside className="lx-section-sidebar">{navigation}</aside>}<div className="lx-section-content">{children}</div></div>}

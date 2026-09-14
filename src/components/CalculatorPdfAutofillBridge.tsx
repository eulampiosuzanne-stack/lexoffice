import {useEffect,useState} from 'react';
import {FileSearch,Loader2,X} from 'lucide-react';
import {supabase} from '../lib/supabase';

type Notice={kind:'loading'|'ok'|'error';text:string}|null;

type FieldMeta={label:string;type:string;options?:{optionValue:string;optionLabel:string}[]};

function labelText(label:HTMLLabelElement){
  const clone=label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input,select,textarea,small,svg,button').forEach(x=>x.remove());
  return (clone.textContent||'').replace(/\s+/g,' ').trim();
}
function toBase64(file:File){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const s=String(r.result||'');resolve(s.includes(',')?s.slice(s.indexOf(',')+1):s)};r.onerror=()=>reject(new Error('Não foi possível ler o PDF.'));r.readAsDataURL(file)})}
function setNativeValue(el:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement,value:string){
  const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
  if(setter)setter.call(el,value);else (el as any).value=value;
  if(el instanceof HTMLSelectElement)el.dispatchEvent(new Event('change',{bubbles:true}));
  else{el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
}
function collectFields(){
  const rows=Array.from(document.querySelectorAll<HTMLLabelElement>('.calculator-form > label'));
  return rows.map(label=>{
    const text=labelText(label);
    const control=label.querySelector<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input:not([type="file"]),textarea,select');
    if(!control||['Cliente','Processo','PDF de apoio'].includes(text))return null;
    const meta:FieldMeta={label:text,type:control instanceof HTMLSelectElement?'select':control instanceof HTMLTextAreaElement?'textarea':control.type||'text'};
    if(control instanceof HTMLSelectElement)meta.options=Array.from(control.options).map(o=>({optionValue:o.value,optionLabel:o.text}));
    return {label,control,meta};
  }).filter(Boolean) as {label:HTMLLabelElement;control:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;meta:FieldMeta}[];
}
function currentCalculator(){return (document.querySelector('.calculator-page-head h1')?.textContent||'').trim()}

export default function CalculatorPdfAutofillBridge(){
  const [notice,setNotice]=useState<Notice>(null);
  useEffect(()=>{
    let active=true;
    const onChange=async(event:Event)=>{
      const input=event.target as HTMLInputElement|null;
      if(!input||input.type!=='file'||!window.location.pathname.startsWith('/calculadoras'))return;
      if(!input.accept?.includes('application/pdf'))return;
      const file=input.files?.[0];if(!file)return;
      if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))return;
      if(file.size>8*1024*1024){setNotice({kind:'error',text:'PDF muito grande. Use um arquivo de até 8 MB.'});return}
      const calculator=currentCalculator();const rows=collectFields();
      if(!calculator||!rows.length){setNotice({kind:'error',text:'Não consegui identificar os campos desta calculadora.'});return}
      if(!supabase){setNotice({kind:'error',text:'Backend indisponível para leitura do PDF.'});return}
      try{
        setNotice({kind:'loading',text:'Lendo o PDF e preenchendo os campos automaticamente...'});
        const pdf_base64=await toBase64(file);
        const {data,error}=await supabase.functions.invoke('calculator-pdf-autofill',{body:{calculator,file_name:file.name,pdf_base64,fields:rows.map(x=>x.meta)}});
        if(error)throw error;
        if((data as any)?.ok===false)throw new Error((data as any)?.error||'Falha no autopreenchimento.');
        const values=(data as any)?.values||{};let applied=0;
        for(const row of rows){
          let value=values[row.meta.label];if(value===undefined||value===null||String(value).trim()==='')continue;value=String(value).trim();
          if(row.control instanceof HTMLSelectElement){
            const exact=Array.from(row.control.options).some(o=>o.value===value);
            if(!exact){const byLabel=Array.from(row.control.options).find(o=>o.text.trim().toLowerCase()===value.toLowerCase());if(byLabel)value=byLabel.value;else continue}
          }
          setNativeValue(row.control,value);applied++;
        }
        if(!active)return;
        const note=String((data as any)?.notes||'').trim();
        setNotice(applied?{kind:'ok',text:`PDF lido. ${applied} campo${applied===1?'':'s'} preenchido${applied===1?'':'s'} automaticamente.${note?` ${note}`:''}`}:{kind:'error',text:`O PDF foi lido, mas não encontrei valores seguros para preencher nesta calculadora.${note?` ${note}`:''}`});
      }catch(e:any){if(active)setNotice({kind:'error',text:e?.message||'Não foi possível preencher a calculadora pelo PDF.'})}
    };
    document.addEventListener('change',onChange,true);
    return()=>{active=false;document.removeEventListener('change',onChange,true)};
  },[]);
  if(!notice)return null;
  return <div style={{position:'fixed',right:24,bottom:24,zIndex:3000,maxWidth:460,padding:'14px 16px',borderRadius:14,border:'1px solid #334258',background:'#0f1621',color:'#eef2f6',boxShadow:'0 18px 50px rgba(0,0,0,.45)',display:'flex',alignItems:'flex-start',gap:10}} role="status">
    <div style={{marginTop:2}}>{notice.kind==='loading'?<Loader2 size={18} className="spin"/>:<FileSearch size={18}/>}</div>
    <div style={{flex:1,fontSize:13,lineHeight:1.45}}>{notice.text}</div>
    {notice.kind!=='loading'&&<button onClick={()=>setNotice(null)} aria-label="Fechar" style={{border:0,background:'transparent',color:'#b9c2ce',cursor:'pointer',padding:0}}><X size={17}/></button>}
  </div>
}

import { useState } from 'react';
import { createVisualPetition, inspectTemplate, type VisualProfile } from '../lib/typographyEngine';
export default function VisualPetitionEngine(){
 const [profile,setProfile]=useState<VisualProfile|null>(null);
 const [fields,setFields]=useState({title:'PETIÇÃO',facts:'',law:'',requests:'',timeline:''});
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const change=(key:keyof typeof fields,value:string)=>setFields(v=>({...v,[key]:value}));
 async function inspect(file?:File){if(!file)return;setBusy(true);try{setProfile(await inspectTemplate(file));setNotice('Modelo analisado. Revise o perfil antes de gerar.')}catch(e:any){setNotice(e?.message||'Falha na análise.')}finally{setBusy(false)}}
 async function generate(){if(!fields.facts.trim()||!fields.requests.trim()){setNotice('Informe os fatos e os pedidos.');return;}setBusy(true);try{const blob=await createVisualPetition({...fields,profile:profile||undefined});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='peticao-visual-law.docx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Word editável gerado. Revise o conteúdo antes do protocolo.')}catch(e:any){setNotice(e?.message||'Falha na geração.')}finally{setBusy(false)}}
 return <section style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:16,padding:22,marginBottom:22}}>
 <h2>Motor de Tipografia Jurídica</h2>
 <p>Analise a estrutura de um modelo DOCX e gere uma nova peça editável. O motor identifica títulos, tabelas, destaques e cronologias; não reproduz automaticamente o layout exato do arquivo de origem.</p>
 <label>Modelo visual de referência (.docx) <input type="file" accept=".docx" onChange={e=>void inspect(e.target.files?.[0])}/></label>
 {profile&&<div style={{padding:12,background:'#f1f5f9',margin:'12px 0',borderRadius:8}}><strong>Perfil: {profile.name}</strong><p>Elementos detectados: {profile.blocks.join(', ')}</p><p>Títulos reconhecidos: {profile.headings.slice(0,5).join(' · ')||'Nenhum'}</p>{profile.warnings.length>0&&<small>Observações: {profile.warnings.join('; ')}</small>}</div>}
 {([['title','Título da peça'],['facts','Fatos (não inventar dados)'],['law','Fundamentação jurídica (revisar citações)'],['requests','Pedidos'],['timeline','Cronologia, um evento por linha (opcional)']] as const).map(([key,label])=><label key={key} style={{display:'block',margin:'12px 0'}}><strong>{label}</strong>{key==='title'?<input style={{display:'block',width:'100%',padding:10}} value={fields[key]} onChange={e=>change(key,e.target.value)}/>:<textarea rows={key==='timeline'?3:5} style={{display:'block',width:'100%',padding:10}} value={fields[key]} onChange={e=>change(key,e.target.value)}/>}</label>)}
 <button type="button" disabled={busy} onClick={()=>void generate()} style={{padding:'12px 20px',borderRadius:8,background:'#17365D',color:'white'}}>{busy?'Processando...':'Gerar Word editável'}</button>
 {notice&&<p role="status">{notice}</p>}
 </section>;
}

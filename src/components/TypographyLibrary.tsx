import { useMemo, useState } from 'react';
import { FileText, Download, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

type TemplateDoc = { id:string; name:string; file_path:string; category?:string|null; notes?:string|null; created_at:string };
const CATEGORY = 'Modelo de peça (Tipografia)';
export default function TypographyLibrary({documents, onRefresh}:{documents:TemplateDoc[];onRefresh:()=>Promise<void>|void}) {
  const [query,setQuery] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const items = useMemo(()=>documents.filter(d=>d.category===CATEGORY && (!query || (d.name+' '+(d.notes||'')).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))),[documents,query]);
  async function upload(files:FileList|null) {
    if(!files?.length || !supabase)return;
    setBusy(true);setMessage('');
    let count=0;const failures:string[]=[];
    try {
      const {data:org,error:orgError}=await supabase.rpc('current_org_id');
      const {data:user}=await supabase.auth.getUser();
      if(orgError||!org||!user.user)throw new Error('Entre novamente para identificar o escritório.');
      for(const file of Array.from(files)){
        if(!/\.docx$/i.test(file.name)){failures.push(file.name+' (use DOCX)');continue;}
        if(file.size>20*1024*1024){failures.push(file.name+' (acima de 20 MB)');continue;}
        const path=org+'/documents/tipografia/'+crypto.randomUUID()+'.docx';
        const {error:storageError}=await supabase.storage.from('lexoffice-documents').upload(path,file,{contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
        if(storageError){failures.push(file.name);continue;}
        const {error:dbError}=await supabase.from('documents').insert({org_id:org,name:file.name,file_path:path,mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size_bytes:file.size,category:CATEGORY,notes:'Modelo visual Word editável',uploaded_by:user.user.id});
        if(dbError){await supabase.storage.from('lexoffice-documents').remove([path]);failures.push(file.name);continue;}
        count++;
      }
      setMessage(count+' modelo(s) cadastrado(s).'+(failures.length?' Falharam: '+failures.join(', '):''));
      await onRefresh();
    }catch(e:any){setMessage(e?.message||'Falha no cadastro dos modelos.');}
    finally{setBusy(false);}
  }
  async function download(item:TemplateDoc){
    if(!supabase)return;
    const {data,error}=await supabase.storage.from('lexoffice-documents').createSignedUrl(item.file_path,120);
    if(error||!data?.signedUrl){setMessage('Não foi possível acessar o modelo.');return;}
    const response=await fetch(data.signedUrl);
    if(!response.ok){setMessage('Falha ao baixar o modelo.');return;}
    const blob=await response.blob();const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=item.name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section style={{border:'1px solid #cbd5e1',borderRadius:16,padding:22,margin:'20px 0',background:'#fff'}}>
    <h2 style={{marginTop:0}}>Tipografia Jurídica · Biblioteca Word</h2>
    <p>Cadastre modelos DOCX com quadros, tabelas, cronologias e estilos. Os arquivos originais ficam preservados e disponíveis para download editável.</p>
    <label style={{display:'inline-block',padding:'12px 18px',background:'#154bd4',color:'white',borderRadius:8,cursor:'pointer',fontWeight:700}}>
      {busy?'Enviando modelos...':'Adicionar modelos Word'}
      <input type="file" accept=".docx" multiple disabled={busy} onChange={e=>{void upload(e.target.files);e.target.value='';}} style={{display:'none'}}/>
    </label>
    <p style={{fontSize:13,color:'#64748b'}}>Até 20 MB por arquivo. Os modelos não são aplicados automaticamente a peças sem sua seleção.</p>
    <div style={{display:'flex',gap:8,alignItems:'center',margin:'16px 0'}}><Search size={18}/><input aria-label="Buscar modelos" placeholder="Buscar modelos por nome" value={query} onChange={e=>setQuery(e.target.value)} style={{padding:10,border:'1px solid #cbd5e1',borderRadius:8,flex:1}}/></div>
    {message&&<p role="status">{message}</p>}
    <p><strong>{items.length} modelo(s) cadastrado(s)</strong></p>
    <div style={{display:'grid',gap:8}}>{items.map(item=><div key={item.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:12,border:'1px solid #e2e8f0',borderRadius:8}}><span style={{display:'flex',alignItems:'center',gap:8,overflowWrap:'anywhere'}}><FileText size={18}/>{item.name}</span><button type="button" onClick={()=>void download(item)} aria-label={'Baixar '+item.name} style={{display:'flex',alignItems:'center',gap:5,padding:8}}><Download size={16}/> Word</button></div>)}</div>
  </section>;
}

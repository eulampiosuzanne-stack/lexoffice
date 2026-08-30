import { useEffect,useMemo,useRef,useState } from 'react';
import { FileText,Upload,Search,UserRound,Scale,Tags,Eye,Download,Trash2,RefreshCw,WandSparkles,CheckCircle2,Loader2,FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './integrations.css';
import './document-library.css';

type Template={id:string;name:string;category?:string|null;description?:string|null;signature_enabled?:boolean|null};
type Client={id:string;name:string;cpf_cnpj?:string|null};
type Process={id:string;client_id?:string|null;cnj_number?:string|null;internal_number?:string|null;subject?:string|null};
type Doc={id:string;client_id?:string|null;process_id?:string|null;name:string;file_path:string;mime_type?:string|null;size_bytes?:number|null;category?:string|null;notes?:string|null;created_at:string};

const CATEGORIES=['Petição','Procuração','Contrato','Documento do cliente','Prova','Decisão','Sentença','Laudo','Comprovante','Outros'];
const safe=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120);
const size=(n?:number|null)=>!n?'—':n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;

export default function Documents(){
 const [templates,setTemplates]=useState<Template[]>([]),[clients,setClients]=useState<Client[]>([]),[processes,setProcesses]=useState<Process[]>([]),[docs,setDocs]=useState<Doc[]>([]);
 const [clientId,setClientId]=useState(''),[processId,setProcessId]=useState(''),[category,setCategory]=useState(''),[tags,setTags]=useState(''),[search,setSearch]=useState('');
 const [busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[templateSearch,setTemplateSearch]=useState('');
 const fileRef=useRef<HTMLInputElement|null>(null);

 async function load(){
  if(!supabase)return;
  setBusy('load');
  const [{data:t,error:te},{data:c},{data:p},{data:d,error:de}]=await Promise.all([
   supabase.from('document_templates').select('id,name,category,description,signature_enabled').eq('active',true).order('category').order('name'),
   supabase.from('clients').select('id,name,cpf_cnpj').order('name').limit(1500),
   supabase.from('processes').select('id,client_id,cnj_number,internal_number,subject').order('updated_at',{ascending:false}).limit(1500),
   supabase.from('documents').select('id,client_id,process_id,name,file_path,mime_type,size_bytes,category,notes,created_at').order('created_at',{ascending:false}).limit(2000)
  ]);
  if(te||de)setNotice((te||de)?.message||'Não foi possível carregar os documentos.');
  setTemplates((t||[]) as Template[]);setClients((c||[]) as Client[]);setProcesses((p||[]) as Process[]);setDocs((d||[]) as Doc[]);setBusy('');
 }
 useEffect(()=>{load()},[]);

 const availableProcesses=useMemo(()=>clientId?processes.filter(p=>p.client_id===clientId):processes,[processes,clientId]);
 const clientMap=useMemo(()=>new Map(clients.map(c=>[c.id,c.name])),[clients]);
 const processMap=useMemo(()=>new Map(processes.map(p=>[p.id,p.cnj_number||p.internal_number||p.subject||'Processo'])),[processes]);
 const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return docs.filter(d=>{const hay=[d.name,d.category,d.notes,clientMap.get(d.client_id||''),processMap.get(d.process_id||'')].filter(Boolean).join(' ').toLowerCase();return !q||hay.includes(q)})},[docs,search,clientMap,processMap]);
 const visibleTemplates=useMemo(()=>{const q=templateSearch.trim().toLowerCase();return templates.filter(t=>!q||`${t.name} ${t.category||''} ${t.description||''}`.toLowerCase().includes(q))},[templates,templateSearch]);

 async function upload(file:File){
  if(!supabase)return;
  setBusy('upload');setNotice('');
  try{
   const {data:org,error:oe}=await supabase.rpc('current_org_id');if(oe||!org)throw new Error('Não foi possível identificar o escritório desta sessão.');
   const {data:u}=await supabase.auth.getUser();if(!u?.user)throw new Error('Sua sessão expirou. Entre novamente.');
   const ext=file.name.includes('.')?'.'+file.name.split('.').pop():'';
   const path=`${org}/documents/${crypto.randomUUID()}-${safe(file.name.replace(ext,''))}${ext}`;
   const {error:ue}=await supabase.storage.from('lexoffice-documents').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(ue)throw ue;
   const {error:ie}=await supabase.from('documents').insert({org_id:org,client_id:clientId||null,process_id:processId||null,name:file.name,file_path:path,mime_type:file.type||null,size_bytes:file.size,category:category||'Outros',notes:tags.trim()||null,uploaded_by:u.user.id});
   if(ie){await supabase.storage.from('lexoffice-documents').remove([path]);throw ie}
   setNotice('Documento enviado e vinculado com sucesso.');setTags('');await load();
  }catch(e:any){setNotice(e?.message||'Falha ao enviar documento.')}finally{setBusy('')}
 }

 async function openDoc(d:Doc,download=false){
  if(!supabase)return;
  setBusy(`open:${d.id}`);
  try{
   const {data,error}=await supabase.storage.from('lexoffice-documents').createSignedUrl(d.file_path,300,{download:download?d.name:undefined});
   if(error)throw error;if(!data?.signedUrl)throw new Error('Link do documento não foi gerado.');window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }catch(e:any){setNotice(e?.message||'Não foi possível abrir o documento.')}finally{setBusy('')}
 }
 async function removeDoc(d:Doc){
  if(!supabase||!confirm(`Excluir "${d.name}"? Esta ação não pode ser desfeita.`))return;
  setBusy(`delete:${d.id}`);setNotice('');
  try{const {error:se}=await supabase.storage.from('lexoffice-documents').remove([d.file_path]);if(se)throw se;const {error:de}=await supabase.from('documents').delete().eq('id',d.id);if(de)throw de;setDocs(v=>v.filter(x=>x.id!==d.id));setNotice('Documento excluído.')}catch(e:any){setNotice(e?.message||'Não foi possível excluir o documento.')}finally{setBusy('')}
 }
 async function generate(t:Template){
  if(!supabase)return;if(!clientId){setNotice('Selecione um cliente antes de gerar o modelo.');return}
  setBusy(`template:${t.id}`);setNotice('');
  try{const {data,error}=await supabase.functions.invoke('document-generate',{body:{template_id:t.id,client_id:clientId,process_id:processId||null,title:t.name,include_logo:true,signature_requested:t.signature_enabled!==false}});if(error)throw error;if((data as any)?.error)throw new Error((data as any).error);setNotice(`${t.name} gerado com preenchimento automático.`);const url=(data as any)?.filled_docx_url||(data as any)?.signed_url;if(url)window.open(url,'_blank','noopener,noreferrer');await load()}catch(e:any){setNotice(e?.message||'Falha ao gerar documento.')}finally{setBusy('')}
 }

 return <div className="documents-v2-page">
  <div className="documents-v2-header"><div><h1>Documentos</h1><p>Centralize arquivos do escritório, vincule cliente e processo e gere documentos pelos modelos do LEXOFFICE.</p></div><button className="doc-refresh" onClick={load} disabled={busy==='load'}><RefreshCw size={17} className={busy==='load'?'spin':''}/>Atualizar</button></div>

  {notice&&<div className="documents-v2-notice"><CheckCircle2 size={17}/><span>{notice}</span></div>}

  <section className="doc-upload-card">
   <div className="doc-section-title"><div className="doc-section-icon"><Upload size={20}/></div><div><h2>Adicionar documento</h2><p>O arquivo será salvo na biblioteca e pode ser vinculado automaticamente ao cliente e ao processo.</p></div></div>
   <div className="doc-upload-grid">
    <label><span><UserRound size={14}/>Cliente</span><select value={clientId} onChange={e=>{setClientId(e.target.value);setProcessId('')}}><option value="">Sem cliente vinculado</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.cpf_cnpj?` — ${c.cpf_cnpj}`:''}</option>)}</select></label>
    <label><span><Scale size={14}/>Processo</span><select value={processId} onChange={e=>setProcessId(e.target.value)}><option value="">Sem processo vinculado</option>{availableProcesses.map(p=><option key={p.id} value={p.id}>{p.cnj_number||p.internal_number||p.subject||'Processo'}</option>)}</select></label>
    <label><span><FolderOpen size={14}/>Categoria</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Selecione</option>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></label>
    <label><span><Tags size={14}/>Tags</span><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="Ex.: urgente, cliente, inicial"/></label>
   </div>
   <input ref={fileRef} hidden type="file" onChange={e=>{const f=e.target.files?.[0];if(f)upload(f);e.currentTarget.value=''}}/>
   <button className="doc-primary" disabled={busy==='upload'} onClick={()=>fileRef.current?.click()}>{busy==='upload'?<Loader2 className="spin" size={18}/>:<Upload size={18}/>}Selecionar arquivo e enviar</button>
  </section>

  <section className="doc-library-card">
   <div className="doc-section-head"><div><h2>Biblioteca de documentos</h2><p>{filtered.length} documento(s) encontrado(s)</p></div><div className="doc-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, cliente, processo, categoria ou tag..."/></div></div>
   {filtered.length===0?<div className="doc-empty"><FileText size={32}/><b>Nenhum documento encontrado.</b><span>Envie um arquivo acima ou altere os termos da busca.</span></div>:<div className="doc-table-wrap"><table className="doc-table"><thead><tr><th>Documento</th><th>Cliente</th><th>Processo</th><th>Categoria / Tags</th><th>Data</th><th>Ações</th></tr></thead><tbody>{filtered.map(d=><tr key={d.id}><td><div className="doc-name"><FileText size={18}/><div><b>{d.name}</b><span>{d.mime_type||'Arquivo'} • {size(d.size_bytes)}</span></div></div></td><td>{clientMap.get(d.client_id||'')||'—'}</td><td className="doc-process">{processMap.get(d.process_id||'')||'—'}</td><td><div className="doc-tags"><span>{d.category||'Outros'}</span>{d.notes&&<small>{d.notes}</small>}</div></td><td>{new Date(d.created_at).toLocaleDateString('pt-BR')}</td><td><div className="doc-actions"><button title="Visualizar" onClick={()=>openDoc(d)}><Eye size={16}/></button><button title="Baixar" onClick={()=>openDoc(d,true)}><Download size={16}/></button><button className="danger" title="Excluir" onClick={()=>removeDoc(d)} disabled={busy===`delete:${d.id}`}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>}
  </section>

  <section className="doc-templates-card">
   <div className="doc-section-head"><div><span className="doc-kicker"><WandSparkles size={14}/> MODELOS LEXOFFICE</span><h2>Gerar documento com preenchimento automático</h2><p>Escolha cliente e processo acima; o modelo utiliza os dados já cadastrados no sistema.</p></div><div className="doc-search"><Search size={17}/><input value={templateSearch} onChange={e=>setTemplateSearch(e.target.value)} placeholder="Buscar modelo..."/></div></div>
   <div className="doc-template-grid-v2">{visibleTemplates.map(t=><article key={t.id} className="doc-template-card-v2"><div className="doc-template-icon"><FileText size={22}/></div><span>{t.category||'Documento jurídico'}</span><h3>{t.name}</h3><p>{t.description||'Modelo jurídico do LEXOFFICE com preenchimento automático.'}</p><div className="doc-template-tags"><em><UserRound size={12}/>Cliente</em><em><Scale size={12}/>Processo</em><em><Tags size={12}/>Auto-preenchimento</em></div><button onClick={()=>generate(t)} disabled={busy===`template:${t.id}`}>{busy===`template:${t.id}`?<Loader2 size={16} className="spin"/>:<WandSparkles size={16}/>}Gerar documento</button></article>)}</div>
  </section>
 </div>
}

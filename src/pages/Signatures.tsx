import { useEffect,useState } from 'react';
import { AlertTriangle,CheckCircle2,Clock3,RefreshCw,ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import LexSignPanel from './LexSignPanel';

type ProviderStatus='loading'|'available'|'error'|'offline'|'unknown'|'unconfigured';
const connected=new Set(['active','connected','online','ok']);
function labelStatus(status:ProviderStatus){
 if(status==='loading')return'Verificando';
 if(status==='available')return'Disponível';
 if(status==='error')return'Com erro';
 if(status==='offline')return'Fora do ar';
 if(status==='unconfigured')return'Não configurado';
 return'Não foi possível verificar';
}

export default function Signatures() {
  const [documenso,setDocumenso]=useState<ProviderStatus>('loading');
  useEffect(()=>{
    let active=true;
    async function checkProvider(){
      if(!supabase){setDocumenso('unknown');return}
      try{
        const {data,error}=await supabase.from('integration_connections')
          .select('status')
          .eq('provider','documenso')
          .order('updated_at',{ascending:false})
          .limit(1)
          .maybeSingle();
        if(error)throw error;
        if(!active)return;
        if(!data){setDocumenso('unconfigured');return}
        const current=String(data.status||'').toLowerCase();
        setDocumenso(connected.has(current)?'available':current==='error'?'error':'offline');
      }catch{
        if(active)setDocumenso('unknown');
      }
    }
    void checkProvider();
    return()=>{active=false};
  },[]);
  const documensoAvailable=documenso==='available';
  return (
    <div className="module">
      <div className="page-head">
        <div>
          <h1>Central de Assinaturas</h1>
          <p>Envie documentos para o cliente assinar pelo celular, com código no WhatsApp, foto do documento e selfie com prova de vida.</p>
        </div>
      </div>
      <section aria-label="Status dos provedores de assinatura" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:12,marginBottom:18}}>
        <div style={{border:"2px solid var(--lx-accent)",borderRadius:"var(--lx-radius-md)",padding:16,background:"var(--lx-canvas)",color:"var(--lx-text)"}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <ShieldCheck size={22} color="var(--lx-accent)"/>
            <div><strong style={{display:'block',fontSize:"var(--lx-section-size)"}}>Assinatura LEX</strong><span style={{fontSize:"var(--lx-font-lg)",color:"var(--lx-text)"}}>Disponível no LEXOFFICE</span></div>
            <CheckCircle2 size={20} color="var(--lx-accent)" style={{marginLeft:'auto',flexShrink:0}}/>
          </div>
        </div>
        <div role="status" aria-live="polite" style={{border:`2px solid ${documenso==='available'?"var(--lx-accent)":"var(--lx-accent)"}`,borderRadius:"var(--lx-radius-md)",padding:16,background:"var(--lx-canvas)",color:"var(--lx-text)"}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {documenso==='loading'?<RefreshCw size={22} color="var(--lx-accent)"/>:documensoAvailable?<CheckCircle2 size={22} color="var(--lx-accent)"/>:<AlertTriangle size={22} color="var(--lx-text)"/>}
            <div><strong style={{display:'block',fontSize:"var(--lx-section-size)"}}>Documenso</strong><span style={{fontSize:"var(--lx-font-lg)",color:"var(--lx-text)"}}>{labelStatus(documenso)}</span></div>
            {documenso==='loading'&&<Clock3 size={20} style={{marginLeft:'auto',flexShrink:0}}/>}
          </div>
          {documenso!=='available'&&documenso!=='loading'&&<small style={{display:'block',marginTop:10,fontSize:"var(--lx-font-md)",lineHeight:1.45,color:"var(--lx-text)"}}>Este provedor não está disponível para uso agora.</small>}
        </div>
      </section>
      {documensoAvailable&&<div className="integration-notice" style={{marginBottom:14}}><CheckCircle2 size={17}/> Documenso está disponível. A assinatura biométrica LEX permanece ativa.</div>}
      <LexSignPanel />
    </div>
  );
}

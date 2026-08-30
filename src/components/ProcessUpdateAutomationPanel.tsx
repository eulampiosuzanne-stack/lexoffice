import {useEffect,useState} from 'react';
import {BellRing,Clock3,MessageSquare,Save,ShieldCheck,Sparkles} from 'lucide-react';
import {supabase} from '../lib/supabase';

type Props={orgId:string};

type ProcessSettings={
  proactive_updates_enabled:boolean;
  ai_summary_enabled:boolean;
  require_approval_for_sensitive:boolean;
  default_channel:string;
  hearing_7_days_enabled:boolean;
  hearing_3_days_enabled:boolean;
  hearing_1_day_enabled:boolean;
  hearing_same_day_enabled:boolean;
};

const defaults:ProcessSettings={
  proactive_updates_enabled:true,
  ai_summary_enabled:true,
  require_approval_for_sensitive:true,
  default_channel:'whatsapp',
  hearing_7_days_enabled:true,
  hearing_3_days_enabled:true,
  hearing_1_day_enabled:true,
  hearing_same_day_enabled:true,
};

export default function ProcessUpdateAutomationPanel({orgId}:Props){
  const [settings,setSettings]=useState<ProcessSettings>(defaults);
  const [hoursEnabled,setHoursEnabled]=useState(false);
  const [start,setStart]=useState('08:00');
  const [end,setEnd]=useState('18:00');
  const [prompt,setPrompt]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');

  async function load(){
    if(!supabase||!orgId)return;
    setLoading(true);setNotice('');
    const [{data:s,error:se},{data:p,error:pe}]=await Promise.all([
      supabase.from('process_notification_settings').select('*').eq('org_id',orgId).maybeSingle(),
      supabase.from('ai_agent_policies').select('business_hours_enabled,business_hours,system_prompt').eq('org_id',orgId).eq('agent_key','client_process_updates').maybeSingle(),
    ]);
    if(s)setSettings({...defaults,...(s as any)});
    if(p){
      setHoursEnabled(p.business_hours_enabled===true);
      setStart(String((p.business_hours as any)?.start||'08:00').slice(0,5));
      setEnd(String((p.business_hours as any)?.end||'18:00').slice(0,5));
      setPrompt(String(p.system_prompt||''));
    }
    if(se||pe)setNotice((se||pe)?.message||'Não foi possível carregar a programação.');
    setLoading(false);
  }

  useEffect(()=>{load()},[orgId]);

  async function save(){
    if(!supabase)return;
    setSaving(true);setNotice('');
    const now=new Date().toISOString();
    const {error:se}=await supabase.from('process_notification_settings').upsert({
      org_id:orgId,
      ...settings,
      updated_at:now,
    },{onConflict:'org_id'});
    if(se){setSaving(false);setNotice(se.message);return}
    const {error:pe}=await supabase.from('ai_agent_policies').update({
      business_hours_enabled:hoursEnabled,
      business_hours:{start,end,timezone:'America/Sao_Paulo',outside_window:'next_day_start'},
      system_prompt:prompt.trim()||null,
      updated_at:now,
    }).eq('org_id',orgId).eq('agent_key','client_process_updates');
    setSaving(false);
    if(pe){setNotice(pe.message);return}
    setNotice('Programação, régua de audiências, horário e prompt salvos.');
  }

  const set=(patch:Partial<ProcessSettings>)=>setSettings(v=>({...v,...patch}));

  if(loading)return <section className="integration-panel"><p>Carregando programação de envio aos clientes...</p></section>;

  return <section className="integration-panel" style={{marginBottom:18}}>
    <div className="doc-section-title" style={{marginBottom:14}}><div className="doc-section-icon"><BellRing size={20}/></div><div><h2 style={{margin:0}}>Envio de processos aos clientes</h2><p style={{margin:'4px 0 0'}}>Configure aqui o que o Agente de Andamento Processual envia, quando envia e como explica ao cliente.</p></div></div>
    {notice&&<div className="integration-notice">{notice}</div>}

    <div className="advanced-section">
      <h3><MessageSquare size={18}/> Andamentos processuais</h3>
      <Toggle title="Enviar novos andamentos automaticamente" desc="Quando um novo andamento elegível chegar, o agente prepara a explicação e envia pelo canal configurado." value={settings.proactive_updates_enabled} onChange={v=>set({proactive_updates_enabled:v})}/>
      <Toggle title="Explicar em linguagem simples com IA" desc="O cliente recebe uma explicação clara em vez do texto bruto do tribunal." value={settings.ai_summary_enabled} onChange={v=>set({ai_summary_enabled:v})}/>
      <Toggle title="Revisar andamentos sensíveis antes do envio" desc="Andamentos marcados como sensíveis ficam aguardando sua aprovação." value={settings.require_approval_for_sensitive} onChange={v=>set({require_approval_for_sensitive:v})}/>
      <div className="agent-form"><label>Canal de envio<select value={settings.default_channel} onChange={e=>set({default_channel:e.target.value})}><option value="whatsapp">WhatsApp</option></select></label></div>
    </div>

    <div className="advanced-section">
      <h3><BellRing size={18}/> Régua de avisos de audiência</h3>
      <p className="section-note">Marque em quais momentos o cliente deve receber lembrete de audiência.</p>
      <Toggle title="Avisar 7 dias antes" desc="Envia lembrete sete dias antes da audiência." value={settings.hearing_7_days_enabled} onChange={v=>set({hearing_7_days_enabled:v})}/>
      <Toggle title="Avisar 3 dias antes" desc="Envia novo lembrete três dias antes." value={settings.hearing_3_days_enabled} onChange={v=>set({hearing_3_days_enabled:v})}/>
      <Toggle title="Avisar 1 dia antes" desc="Envia lembrete no dia anterior." value={settings.hearing_1_day_enabled} onChange={v=>set({hearing_1_day_enabled:v})}/>
      <Toggle title="Avisar no dia" desc="Envia o último lembrete no próprio dia da audiência." value={settings.hearing_same_day_enabled} onChange={v=>set({hearing_same_day_enabled:v})}/>
    </div>

    <div className="advanced-section">
      <h3><Clock3 size={18}/> Horário permitido para envio</h3>
      <Toggle title="Restringir os envios ao horário configurado" desc="Andamentos e avisos de audiência que vencerem fora da janela ficam para o próximo horário permitido." value={hoursEnabled} onChange={setHoursEnabled}/>
      <div className="agent-form"><label>Início<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Fim<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
      <div className="integration-notice"><Clock3 size={15}/> Fora do horário, o envio é transferido para o dia seguinte no horário inicial configurado.</div>
    </div>

    <div className="advanced-section">
      <h3><Sparkles size={18}/> Prompt do Agente de Andamento Processual</h3>
      <p className="section-note">Este é o texto que orienta a IA na explicação de andamentos e na comunicação processual com o cliente.</p>
      <div className="agent-form"><label className="wide">Prompt<textarea className="instructions" style={{minHeight:220}} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Defina como o agente deve interpretar e explicar os andamentos..."/></label></div>
      <div className="integration-notice"><ShieldCheck size={15}/> O motor usa este prompt e os dados reais do processo. Ele não deve inventar prazo, audiência, decisão ou providência.</div>
    </div>

    <div className="agent-save"><button className="primary" disabled={saving} onClick={save}><Save size={15}/>{saving?'Salvando...':'Salvar programação de envio'}</button></div>
  </section>
}

function Toggle({title,desc,value,onChange}:{title:string;desc:string;value:boolean;onChange:(v:boolean)=>void}){
  return <div className="setting-row"><div className="setting-copy"><b>{title}</b><small>{desc}</small></div><button type="button" className={`switch ${value?'on':''}`} aria-pressed={value} onClick={()=>onChange(!value)}/></div>
}

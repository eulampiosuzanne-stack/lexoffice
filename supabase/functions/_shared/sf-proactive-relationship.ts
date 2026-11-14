// LexOffice SF — motor de relacionamento proativo (v1).
// Gera propostas internas; nunca envia mensagens nem pratica atos jurídicos automaticamente.
// Execução server-side com credenciais de serviço e organização autenticada.
export type Processo = {id:string;status:string|null;updated_at:string|null;last_movement_at:string|null;last_verified_at:string|null};
export type Cliente = {id:string;name:string;status:string|null;relationship_tier?:string|null;opt_in:boolean;opt_out:boolean};
export type Proposta = {client_id:string;process_id:string|null;kind:string;dedupe_key:string;priority:"normal"|"review";text:string;requires_approval:true};
const days=(a:string,b:Date)=>Math.floor((b.getTime()-new Date(a).getTime())/86400000);
const date=(d:Date)=>d.toISOString().slice(0,10);
export type PendenciaRelacionamento = {
  id:string;
  client_id:string;
  kind:"document"|"request";
  state:"pending"|"resolved";
  due_at:string;
  last_reminder_at?:string|null;
};
export function planejarRelacionamento(cliente:Cliente, processos:Processo[], hoje:Date, ultimaInteracao?:string|null, pendencias:PendenciaRelacionamento[]=[]):Proposta[]{
  if(!cliente.opt_in||cliente.opt_out||!["ativo","active","cliente","cliente_ativo","cliente_private"].includes((cliente.status||"").toLowerCase()))return [];
  const out:Proposta[]=[];
  const first=(cliente.name||"").trim().split(/\s+/)[0]||"cliente";
  const week=Math.floor((Date.UTC(hoje.getUTCFullYear(),hoje.getUTCMonth(),hoje.getUTCDate())-Date.UTC(2026,0,5))/604800000);
  if(processos.length){
    const verified=processos.filter(p=>p.last_verified_at&&days(p.last_verified_at,hoje)<=7);
    if(verified.length===processos.length){
      out.push({client_id:cliente.id,process_id:null,kind:"weekly_briefing",dedupe_key:`weekly:${cliente.id}:${week}`,priority:"review",requires_approval:true,text:`Olá, ${first}! 🌷 Preparamos sua atualização semanal. Nossa equipe conferiu o acompanhamento dos seus processos. O resumo individualizado ficará disponível após a validação jurídica. Você não precisa solicitar uma atualização; avisaremos quando houver informação relevante.`});
    }
    for(const p of processos){
      const base=p.last_movement_at||p.updated_at;
      if(base&&days(base,hoje)>=30&&p.last_verified_at&&days(p.last_verified_at,hoje)<=2){
        const cycle=Math.floor(days(base,hoje)/30);
        out.push({client_id:cliente.id,process_id:p.id,kind:"inactivity_radar",dedupe_key:`inactivity:${p.id}:${cycle}`,priority:"review",requires_approval:true,text:`Olá, ${first}. Conferimos seu processo e, até a última verificação registrada, não identificamos nova movimentação no período. Seguimos acompanhando e avisaremos sobre novidades relevantes. A ausência de movimentação não significa abandono do caso.`});
      }
    }
  }
  if(ultimaInteracao&&days(ultimaInteracao,hoje)<7)return out;
  for(const pending of pendencias){
    if(pending.client_id!==cliente.id||pending.state!=="pending"||!pending.id)continue;
    const due=Date.parse(pending.due_at);
    if(!Number.isFinite(due)||due>hoje.getTime())continue;
    if(pending.last_reminder_at)continue;
    const text=pending.kind==="document"
      ? `Oi, ${first}! 😊 Ainda estamos aguardando o documento solicitado. Você pode enviá-lo pelo nosso aplicativo. 📄`
      : `Olá, ${first}! Sua solicitação está em acompanhamento pela equipe. Você pode consultar a atualização pelo nosso aplicativo. 💛`;
    out.push({client_id:cliente.id,process_id:null,kind:"care_checkin",dedupe_key:`care:${cliente.id}:${pending.kind}:${pending.id}`,priority:"review",requires_approval:true,text});
  }
  return out;
}
export function deduplicar(propostas:Proposta[],chavesExistentes:Set<string>){return propostas.filter(p=>!chavesExistentes.has(p.dedupe_key));}

import { planejarMotoresSF } from "./sf-care-engines.ts";
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
const now=new Date("2026-11-10T12:00:00Z");
const base={
 cliente:{id:"c1",name:"Ana Silva",status:"ativo",opt_in:true,opt_out:false},
 processos:[{id:"p1",status:"ativo",updated_at:null,last_movement_at:null,last_verified_at:null}],
 agora:now,ultimaInteracao:now.toISOString(),eventos:[],chavesEnviadas:new Set<string>(),chavesPendentes:new Set<string>(),
 humanoAtivo:false,urgente:false,bloqueioFinanceiro:false,janelaMetaAberta:false,modeloMetaAprovado:false
};
Deno.test("sem consentimento não propõe",()=>{
 assert(planejarMotoresSF({...base,cliente:{...base.cliente,opt_in:false}}).length===0,"consentimento");
});
Deno.test("respeita silêncio após atendimento humano",()=>{
 assert(planejarMotoresSF({...base,ultimaMensagemHumana:"2026-11-10T11:50:00Z",eventos:[{kind:"movement_verified" as const,process_id:"p1",movement_id:"m1",verified_at:now.toISOString(),explanation:"Andamento confirmado"}]}).length===0,"silêncio");
});
Deno.test("movimentação verificada gera uma proposta no aplicativo sem janela Meta",()=>{
 const event={kind:"movement_verified" as const,process_id:"p1",movement_id:"m1",verified_at:now.toISOString(),explanation:"Andamento confirmado"};
 const result=planejarMotoresSF({...base,eventos:[event,event]});
 assert(result.length===1&&result[0].media==="audio"&&result[0].channel==="app"&&result[0].requires_approval,"proposta");
});
Deno.test("não repete chave já pendente",()=>{
 const event={kind:"movement_verified" as const,process_id:"p1",movement_id:"m1",verified_at:now.toISOString(),explanation:"Andamento confirmado"};
 assert(planejarMotoresSF({...base,eventos:[event],chavesPendentes:new Set(["movement:p1:m1"])}).length===0,"dedupe");
});
Deno.test("ignora evento de processo de outro cliente",()=>{
 const event={kind:"movement_verified" as const,process_id:"outro",movement_id:"m1",verified_at:now.toISOString(),explanation:"Andamento confirmado"};
 assert(planejarMotoresSF({...base,eventos:[event]}).length===0,"vínculo");
});

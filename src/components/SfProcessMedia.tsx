import React, { useEffect, useState } from "react";
import { PlayCircle, Volume2, Square } from "lucide-react";

type Props = {
  clientName?: string;
  processStatus: string;
  explanation: string;
  nextStep?: string;
  verifiedAt?: string | null;
  videoUrl?: string | null;
};

/** Accessible client-facing explanation. Never claims an audit without verifiedAt. */
export default function SfProcessMedia({ clientName, processStatus, explanation, nextStep, verifiedAt, videoUrl }: Props) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);
  const safeText = [clientName ? `Olá, ${clientName.split(" ")[0]}.` : "Olá.",
    `Situação atual: ${processStatus}.`, explanation,
    nextStep ? `Próximo passo: ${nextStep}.` : "",
    verifiedAt ? `Última verificação registrada: ${new Date(verifiedAt).toLocaleDateString("pt-BR")}.` : ""
  ].filter(Boolean).join(" ");
  const toggleSpeech = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(safeText);
    utterance.lang = "pt-BR";
    utterance.rate = 0.94;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };
  return (
    <section aria-label="Entenda seu processo" style={{padding:20,borderRadius:18,background:"#f2ebe5",color:"#34252a",border:"1px solid #cbbba8"}}>
      <h3 style={{fontSize:"1.3rem",marginTop:0}}>Entenda seu processo</h3>
      <p style={{fontSize:"1.08rem",lineHeight:1.6}}>{explanation}</p>
      <button type="button" onClick={toggleSpeech} aria-label={speaking ? "Parar áudio" : "Ouvir minha atualização"}
        style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,width:"100%",minHeight:58,borderRadius:14,background:"#65001f",color:"white",fontSize:"1.1rem",fontWeight:700,cursor:"pointer"}}>
        {speaking ? <Square aria-hidden="true"/> : <Volume2 aria-hidden="true"/>}
        {speaking ? "Parar áudio" : "Ouvir minha atualização"}
      </button>
      {videoUrl ? (
        <div style={{marginTop:16}}>
          <p style={{display:"flex",alignItems:"center",gap:8,fontWeight:700}}><PlayCircle aria-hidden="true"/> Assista à explicação desta fase</p>
          <video controls playsInline preload="none" src={videoUrl} style={{width:"100%",maxHeight:420,borderRadius:12}} aria-label="Vídeo explicativo da fase processual"/>
        </div>
      ) : <p style={{fontSize:14,marginBottom:0}}>Vídeo explicativo desta fase ainda não disponível.</p>}
      {verifiedAt && <p style={{fontSize:14}}>Verificação registrada em {new Date(verifiedAt).toLocaleDateString("pt-BR")}.</p>}
    </section>
  );
}

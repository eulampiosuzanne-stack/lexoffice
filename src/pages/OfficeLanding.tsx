import './OfficeLanding.visual.css';
import { MessageCircle, ShieldCheck, UsersRound, BarChart3, MapPin, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function OfficeLanding(){
  const [open,setOpen]=useState(false);
  const whatsapp='https://wa.me/';
  return <div className="sf-site">

    <header className="sf-wrap sf-top">
      <a className="sf-brand" href="#inicio"><span className="sf-monogram">SF</span><strong>SUZANNE FIGUEIREDO</strong><small>ADVOCACIA E SOLUÇÕES JURÍDICAS</small></a>
      <nav className={`sf-nav ${open?'open':''}`}><a href="#inicio" onClick={()=>setOpen(false)}>Início</a><a href="#atuacao" onClick={()=>setOpen(false)}>Áreas de Atuação</a><a href="#sobre" onClick={()=>setOpen(false)}>Sobre</a><a href="#depoimentos" onClick={()=>setOpen(false)}>Depoimentos</a><a href="#contato" onClick={()=>setOpen(false)}>Contato</a><a href="/cliente" onClick={()=>setOpen(false)}>Área do Cliente</a></nav>
      <a className="sf-btn" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={22}/> FALAR COM O ESCRITÓRIO</a>
      <button className="sf-mobile" onClick={()=>setOpen(!open)} aria-label="Abrir menu">{open?<X/>:<Menu/>}</button>
    </header>
    <main id="inicio" className="sf-hero"><div className="sf-wrap sf-grid">
      <section className="sf-copy"><div className="sf-kicker">ADVOCACIA ESTRATÉGICA · MINAS GERAIS</div><h1>Direito tratado<br/>com <em>clareza,<br/>estratégia</em> e<br/><em>presença.</em></h1><p>Atendimento jurídico personalizado para decisões que exigem análise cuidadosa, comunicação clara e acompanhamento próximo.</p>
        <div className="sf-actions"><a className="sf-btn" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={21}/> FALAR COM O ESCRITÓRIO</a><a className="sf-btn ghost" href="/cliente">ÁREA DO CLIENTE</a></div>
        <div className="sf-points"><div className="sf-point"><ShieldCheck/>Atendimento<br/>Personalizado</div><div className="sf-point"><UsersRound/>Sigilo e<br/>Confiança</div><div className="sf-point"><BarChart3/>Estratégia<br/>em Cada Etapa</div><div className="sf-point"><MapPin/>Atuação em<br/>todo o Estado de MG</div></div>
      </section>
      <section className="sf-visual" id="sobre"><div className="sf-quote"><blockquote>“Mais que direito,<br/>soluções para a sua vida.”</blockquote><div className="sf-line"/><b>SUZANNE FIGUEIREDO</b><small>OAB/MG 131.880</small></div></section>
    </div></main>
    <footer className="sf-wrap sf-strip" id="atuacao"><div className="sf-areas"><span>FAMÍLIA</span><span>SUCESSÕES</span><span>CONSUMIDOR</span><span>BANCÁRIO</span><span>CÍVEL</span><span>TRABALHISTA</span><span>SAÚDE</span><span>PENAL</span><span>USUCAPIÃO</span></div><div className="sf-tag">SEMPRE AO SEU LADO<br/>NAS DECISÕES QUE IMPORTAM</div></footer>
    <span id="depoimentos"/><span id="contato"/>
  </div>
}

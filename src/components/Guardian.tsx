import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, CalendarDays, ClipboardList, VolumeX, Volume2, FileText, MessageCircle, X } from "lucide-react";
import "./guardian.css";

const PLAY_STORAGE = "sf-guardian-play-enabled-v1";

function welcomeMessage() {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return greeting + ", Dra.! 🐾 Já estou de olho em tudo por aqui!";
}

export default function Guardian() {
  const navigate = useNavigate();
  const trigger = useRef<HTMLButtonElement>(null);
  const [playEnabled, setPlayEnabled] = useState(() => { try { return localStorage.getItem(PLAY_STORAGE) !== "false"; } catch { return true; } });
  const [reduceMotion, setReduceMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { try { localStorage.setItem(PLAY_STORAGE, String(playEnabled)); } catch {} }, [playEnabled]);
  useEffect(() => {
    try {
      if (!sessionStorage.getItem("sf-guardian-welcomed-v1")) {
        sessionStorage.setItem("sf-guardian-welcomed-v1", "1");
        setShowWelcome(true);
        const timer = setTimeout(() => setShowWelcome(false), 8000);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, []);
  const go = (path: string) => { setMenuOpen(false); navigate(path); };
  const animated = playEnabled && !reduceMotion;

  const closeMenu = () => { setMenuOpen(false); trigger.current?.focus(); };
  return (
    <section className={"sf-guardian" + (animated ? " sf-guardian-animated" : "") + (showWelcome && animated ? " sf-guardian-welcome" : "")} aria-label="Guardiã SF" onKeyDown={event => { if (event.key === "Escape" && menuOpen) { event.stopPropagation(); closeMenu(); } }}>
      {showWelcome && !menuOpen && <div className="sf-guardian-greeting" role="status" aria-live="polite">{welcomeMessage()}</div>}
      <button type="button" ref={trigger} className="sf-guardian-trigger" aria-expanded={menuOpen} aria-controls="sf-guardian-actions" onClick={() => setMenuOpen((value) => !value)} aria-label="Abrir opções da Guardiã SF">
        <span className="sf-guardian-portrait"><img className="sf-guardian-dog" src="/brand/guardia-sf.webp" alt="" aria-hidden="true" /><ShieldCheck size={18} aria-hidden="true" /></span>
      </button>
      {menuOpen && <div className="sf-guardian-menu" id="sf-guardian-actions" aria-label="Ações da Guardiã SF">
        <strong>Guardiã SF</strong>
        <button type="button" className="sf-guardian-close" onClick={closeMenu} aria-label="Fechar opções da Guardiã"><X size={16} /></button>
        <button type="button" onClick={() => go("/afazeres")}><ClipboardList size={17} />Ver minhas prioridades</button>
        <button type="button" onClick={() => go("/processos")}><FileText size={17} />Consultar prazos</button>
        <button type="button" onClick={() => go("/agenda")}><CalendarDays size={17} />Ver audiências</button>
        <button type="button" onClick={() => go("/donna")}><MessageCircle size={17} />Abrir briefing da Donna</button>
        <button type="button" aria-pressed={!playEnabled} onClick={() => setPlayEnabled((value) => !value)}>{playEnabled ? <VolumeX size={17} /> : <Volume2 size={17} />}{playEnabled ? "Silenciar animações" : "Ativar animações"}</button>
      </div>}
    </section>
  );
}

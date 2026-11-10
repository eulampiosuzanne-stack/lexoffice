import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, CalendarDays, ClipboardList, VolumeX, Volume2, FileText, MessageCircle, X, PawPrint, Bone, Heart } from "lucide-react";
import "./guardian.css";

// Guardiã SF (10/11/2026): de vez em quando ela caminha de verdade pela tela, deixa marquinhas de patinha,
// pede atenção da Dra. e pode ser alimentada (pedido de uma criança, filha de uma amiga da Dra.).
// Tudo respeita "Silenciar animações" e a preferência do sistema por menos movimento.

const PLAY_STORAGE = "sf-guardian-play-enabled-v1";
const FED_STORAGE = "sf-guardian-fed-at-v1";
const TREATS_STORAGE = "sf-guardian-treats-v1";
const HUNGRY_AFTER_MS = 4 * 60 * 60 * 1000; // fica com fominha 4 horas depois do último petisco
const WALK_SPEED = 70; // px por segundo
const PAW_STEP = 30; // distância entre as patinhas
const PAW_LIFE_MS = 7000;

type Mood = "idle" | "walking" | "asking" | "hungry" | "eating" | "happy";
type Paw = { id: number; x: number; y: number; flip: boolean; angle: number };

const readNumber = (key: string, fallback: number) => { try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : fallback; } catch { return fallback; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* sem armazenamento */ } };
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function welcomeMessage() {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return greeting + ", Dra.! Já estou de olho em tudo por aqui!";
}
const ASK_LINES = ["Dra., me faz um carinho?", "Ei, Dra.! Olha eu aqui!", "Vim conferir se está tudo bem por aí.", "Posso ficar pertinho da senhora?"];
const HUNGRY_LINES = ["Dra., estou com fominha... me dá um petisco?", "Meu potinho está vazio, Dra.!", "Um petisco para a Guardiã?"];
const HAPPY_LINES = ["Obrigada, Dra.! Agora vou trabalhar feliz.", "Que delícia! Barriguinha cheia.", "Eba! A senhora é a melhor!"];
const PET_LINES = ["Que carinho bom!", "Abanando o rabinho aqui!", "Adoro quando a senhora faz isso."];

export default function Guardian() {
  const navigate = useNavigate();
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  const [playEnabled, setPlayEnabled] = useState(() => { try { return localStorage.getItem(PLAY_STORAGE) !== "false"; } catch { return true; } });
  const [reduceMotion, setReduceMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const [offset, setOffset] = useState(0); // deslocamento horizontal (px, negativo = para a esquerda)
  const [facingLeft, setFacingLeft] = useState(true);
  const [paws, setPaws] = useState<Paw[]>([]);
  const [hearts, setHearts] = useState<number[]>([]);
  const [fedAt, setFedAt] = useState(() => readNumber(FED_STORAGE, Date.now()));
  const [treats, setTreats] = useState(() => readNumber(TREATS_STORAGE, 0));
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef(0);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const frame = useRef<number | null>(null);
  const pawId = useRef(0);
  const menuOpenRef = useRef(menuOpen);
  useEffect(() => { menuOpenRef.current = menuOpen; }, [menuOpen]);

  const animated = playEnabled && !reduceMotion;
  const hungry = now - fedAt > HUNGRY_AFTER_MS;
  const fullness = Math.max(0, Math.min(1, 1 - (now - fedAt) / (HUNGRY_AFTER_MS * 1.5)));

  const later = useCallback((ms: number, fn: () => void) => { const t = window.setTimeout(fn, ms); timers.current.push(t); return t; }, []);
  const say = useCallback((text: string | null, ms = 6000) => { setBubble(text); if (text) later(ms, () => setBubble((b) => (b === text ? null : b))); }, [later]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { save(PLAY_STORAGE, String(playEnabled)); }, [playEnabled]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(t); }, []);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); if (frame.current) cancelAnimationFrame(frame.current); }, []);
  useEffect(() => {
    try {
      if (!sessionStorage.getItem("sf-guardian-welcomed-v1")) {
        sessionStorage.setItem("sf-guardian-welcomed-v1", "1");
        say(welcomeMessage(), 8000);
      }
    } catch { /* sem armazenamento */ }
  }, [say]);
  // Patinhas somem sozinhas.
  useEffect(() => {
    if (!paws.length) return;
    const t = window.setTimeout(() => setPaws((list) => list.filter((p) => Date.now() - p.id < PAW_LIFE_MS)), 1000);
    return () => window.clearTimeout(t);
  }, [paws]);

  // Caminhada de verdade: anda até um ponto da tela deixando patinhas, para, pede atenção e volta para o cantinho.
  const walkTo = useCallback((target: number) => new Promise<void>((resolve) => {
    const start = offsetRef.current;
    const distance = target - start;
    if (Math.abs(distance) < 4) { resolve(); return; }
    setFacingLeft(distance < 0);
    const duration = (Math.abs(distance) / WALK_SPEED) * 1000;
    const t0 = performance.now();
    let lastPaw = start;
    let flip = false;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const x = start + distance * k;
      offsetRef.current = x;
      setOffset(x);
      if (Math.abs(x - lastPaw) >= PAW_STEP && root.current) {
        lastPaw = x;
        flip = !flip;
        const box = root.current.getBoundingClientRect();
        const id = Date.now() + pawId.current++ / 1000;
        setPaws((list) => [...list.slice(-24), { id, x: box.left + box.width / 2 + (distance < 0 ? 14 : -14), y: box.bottom - 6 + (flip ? -9 : 0), flip, angle: distance < 0 ? -90 : 90 }]);
      }
      if (k < 1) frame.current = requestAnimationFrame(tick);
      else { frame.current = null; resolve(); }
    };
    frame.current = requestAnimationFrame(tick);
  }), []);

  const stroll = useCallback(async () => {
    if (busy.current || !root.current) return;
    busy.current = true;
    setMenuOpen(false);
    const home = root.current.getBoundingClientRect();
    const room = Math.max(0, home.left - 24); // quanto ela pode andar para a esquerda sem sair da tela
    const target = -Math.round(room * (0.35 + Math.random() * 0.5));
    setMood("walking");
    await walkTo(target);
    const isHungry = Date.now() - readNumber(FED_STORAGE, Date.now()) > HUNGRY_AFTER_MS;
    setMood(isHungry ? "hungry" : "asking");
    say(pick(isHungry ? HUNGRY_LINES : ASK_LINES), 5500);
    await new Promise((r) => later(6000, () => r(null)));
    setBubble(null);
    setMood("walking");
    await walkTo(0);
    setMood(isHungry ? "hungry" : "idle");
    busy.current = false;
  }, [later, say, walkTo]);

  // De vez em quando (a cada 2 a 5 minutos) ela sai para passear, se a Dra. não estiver mexendo nela.
  useEffect(() => {
    if (!animated) { if (frame.current) cancelAnimationFrame(frame.current); frame.current = null; busy.current = false; offsetRef.current = 0; setOffset(0); setMood("idle"); return; }
    let cancelled = false;
    const schedule = (first = false) => {
      const wait = first ? 25000 + Math.random() * 20000 : 120000 + Math.random() * 180000;
      later(wait, () => {
        if (cancelled) return;
        if (document.visibilityState === "visible" && !menuOpenRef.current && window.innerWidth >= 360) void stroll();
        schedule();
      });
    };
    schedule(true);
    return () => { cancelled = true; };
  }, [animated, later, stroll]);

  const showHearts = () => { const base = Date.now(); setHearts([base, base + 1, base + 2]); later(1800, () => setHearts([])); };
  const feed = () => {
    const t = Date.now();
    setFedAt(t); setNow(t); save(FED_STORAGE, String(t));
    setTreats((n) => { const v = n + 1; save(TREATS_STORAGE, String(v)); return v; });
    setMenuOpen(false);
    setMood("eating");
    say("Nhac, nhac, nhac...", 2600);
    later(2600, () => { setMood("happy"); showHearts(); say(pick(HAPPY_LINES), 4500); later(4500, () => setMood((m) => (m === "happy" ? "idle" : m))); });
  };
  const pet = () => { setMenuOpen(false); setMood("happy"); showHearts(); say(pick(PET_LINES), 3500); later(3500, () => setMood((m) => (m === "happy" ? "idle" : m))); };

  // Mantém balão e menu dentro da tela quando ela está longe do cantinho (principalmente no celular).
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const panelWidth = Math.min(272, vw - 32);
  const dogLeft = vw - 16 - 64 + offset;
  const panelLeft = Math.max(16, Math.min(dogLeft + 32 - panelWidth / 2, vw - 16 - panelWidth));
  const panelStyle = offset ? { left: panelLeft - dogLeft, right: "auto", width: panelWidth } : undefined;

  const go = (path: string) => { setMenuOpen(false); navigate(path); };
  const closeMenu = () => { setMenuOpen(false); trigger.current?.focus(); };
  const onDogClick = () => {
    if (mood === "asking") { pet(); return; }
    setMenuOpen((value) => !value);
  };

  return (
    <>
      {paws.length > 0 && (
        <div className="sf-guardian-paws" aria-hidden="true">
          {paws.map((p) => (
            <PawPrint key={p.id} className="sf-guardian-paw" style={{ left: p.x, top: p.y, transform: `translate(-50%, -50%) rotate(${p.angle + (p.flip ? 12 : -12)}deg)` }} />
          ))}
        </div>
      )}
      <section
        ref={root}
        className={["sf-guardian", animated ? "sf-guardian-animated" : "", `sf-guardian-${mood}`, facingLeft ? "sf-guardian-left" : "sf-guardian-right"].filter(Boolean).join(" ")}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        aria-label="Guardiã SF"
        onKeyDown={(event) => { if (event.key === "Escape" && menuOpen) { event.stopPropagation(); closeMenu(); } }}
      >
        <div className="sf-guardian-motion">
          {bubble && !menuOpen && (
            <div className="sf-guardian-greeting" role="status" aria-live="polite" style={panelStyle}>
              <span>{bubble}</span>
              {mood === "hungry" && <button type="button" className="sf-guardian-bubble-action" onClick={feed}><Bone size={15} aria-hidden="true" />Dar petisco</button>}
              {mood === "asking" && <button type="button" className="sf-guardian-bubble-action" onClick={pet}><Heart size={15} aria-hidden="true" />Fazer carinho</button>}
            </div>
          )}
          {hearts.length > 0 && <div className="sf-guardian-hearts" aria-hidden="true">{hearts.map((h) => <Heart key={h} />)}</div>}
          {mood === "eating" && <span className="sf-guardian-bowl" aria-hidden="true"><Bone /></span>}
          <button type="button" ref={trigger} className="sf-guardian-trigger" aria-expanded={menuOpen} aria-controls="sf-guardian-actions" onClick={onDogClick} aria-label={hungry ? "Guardiã SF está com fome. Abrir opções" : "Abrir opções da Guardiã SF"}>
            <span className="sf-guardian-portrait">
              <img className="sf-guardian-dog" src="/brand/guardia-sf.webp" alt="" aria-hidden="true" />
              {hungry && mood !== "eating" ? <Bone size={18} className="sf-guardian-hunger-badge" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
            </span>
          </button>
          {menuOpen && (
            <div className="sf-guardian-menu" id="sf-guardian-actions" aria-label="Ações da Guardiã SF" style={panelStyle}>
              <strong>Guardiã SF</strong>
              <button type="button" className="sf-guardian-close" onClick={closeMenu} aria-label="Fechar opções da Guardiã"><X size={16} /></button>
              <div className="sf-guardian-meter" aria-label={`Barriguinha ${Math.round(fullness * 100)}% cheia`}>
                <span>Barriguinha</span>
                <span className="sf-guardian-meter-bar"><span style={{ width: `${Math.round(fullness * 100)}%` }} /></span>
                <small>{treats} petisco{treats === 1 ? "" : "s"}</small>
              </div>
              <button type="button" className="sf-guardian-feed" onClick={feed}><Bone size={17} />Dar petisco</button>
              <button type="button" onClick={pet}><Heart size={17} />Fazer carinho</button>
              {animated && <button type="button" onClick={() => void stroll()}><PawPrint size={17} />Passear agora</button>}
              <button type="button" onClick={() => go("/afazeres")}><ClipboardList size={17} />Ver minhas prioridades</button>
              <button type="button" onClick={() => go("/processos")}><FileText size={17} />Consultar prazos</button>
              <button type="button" onClick={() => go("/agenda")}><CalendarDays size={17} />Ver audiências</button>
              <button type="button" onClick={() => go("/donna")}><MessageCircle size={17} />Abrir briefing da Donna</button>
              <button type="button" aria-pressed={!playEnabled} onClick={() => setPlayEnabled((value) => !value)}>{playEnabled ? <VolumeX size={17} /> : <Volume2 size={17} />}{playEnabled ? "Silenciar animações" : "Ativar animações"}</button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

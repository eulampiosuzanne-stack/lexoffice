import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, CalendarDays, ClipboardList, VolumeX, Volume2, FileText, MessageCircle, X, PawPrint, Bone, Heart } from "lucide-react";
import "./guardian.css";
import GuardianWalker, { FEET, STRIDE_PX, WALKER_H, WALKER_W } from "./GuardianWalker";

// Guardiã SF (10/11/2026): de vez em quando ela caminha de verdade pela tela, deixa marquinhas de patinha,
// pede atenção da Dra. e pode ser alimentada (pedido de uma criança, filha de uma amiga da Dra.).
// 11/11/2026: passeia como cachorrinha de corpo inteiro (patas, rabo e orelhas se mexendo de verdade).
// Só o botão "Silenciar animações" do menu dela desliga; a opção "reduzir movimento" do Windows/celular
// não desliga mais a Guardiã (era isso que a deixava parada para a Dra.).

const PLAY_STORAGE = "sf-guardian-play-enabled-v2";
const FED_STORAGE = "sf-guardian-fed-at-v1";
const TREATS_STORAGE = "sf-guardian-treats-v1";
const HUNGRY_AFTER_MS = 4 * 60 * 60 * 1000; // fica com fominha 4 horas depois do último petisco
const WALK_SPEED = 85; // px por segundo
const RUN_SPEED = 190; // correndo para brincar
const PAW_LIFE_MS = 7000;

type Mood = "idle" | "walking" | "asking" | "hungry" | "eating" | "happy" | "playing";
type Paw = { id: number; born: number; x: number; y: number; angle: number };

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
const PLAY_LINES = ["Achei uma caixinha! Vou brincar!", "Olha, Dra., que caixa divertida!", "Au au! Essa caixinha é minha!"];
const PET_LINES = ["Que carinho bom!", "Abanando o rabinho aqui!", "Adoro quando a senhora faz isso."];

export default function Guardian() {
  const navigate = useNavigate();
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  const [playEnabled, setPlayEnabled] = useState(() => { try { return localStorage.getItem(PLAY_STORAGE) !== "false"; } catch { return true; } });
  const [menuOpen, setMenuOpen] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // deslocamento na tela (px; negativo = esquerda/para cima)
  const [facingLeft, setFacingLeft] = useState(true);
  const [paws, setPaws] = useState<Paw[]>([]);
  const [phase, setPhase] = useState(0); // fase da passada (patas)
  const [clock, setClock] = useState(0); // relógio (s) para rabo, orelhas e respiração
  const phaseRef = useRef(0);
  const [hearts, setHearts] = useState<number[]>([]);
  const [fedAt, setFedAt] = useState(() => readNumber(FED_STORAGE, Date.now()));
  const [treats, setTreats] = useState(() => readNumber(TREATS_STORAGE, 0));
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef({ x: 0, y: 0 });
  const facingLeftRef = useRef(true);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const frame = useRef<number | null>(null);
  const pawId = useRef(0);
  const menuOpenRef = useRef(menuOpen);
  useEffect(() => { menuOpenRef.current = menuOpen; }, [menuOpen]);

  const animated = playEnabled;
  const out = animated; // com animações ligadas ela fica sempre de corpo inteiro, nas 4 patas (sem a bolinha)
  const hungry = now - fedAt > HUNGRY_AFTER_MS;
  const fullness = Math.max(0, Math.min(1, 1 - (now - fedAt) / (HUNGRY_AFTER_MS * 1.5)));

  const later = useCallback((ms: number, fn: () => void) => { const t = window.setTimeout(fn, ms); timers.current.push(t); return t; }, []);
  const say = useCallback((text: string | null, ms = 6000) => { setBubble(text); if (text) later(ms, () => setBubble((b) => (b === text ? null : b))); }, [later]);

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
  // Relógio da cachorrinha enquanto ela está fora do cantinho ou há patinhas sumindo (feito em JS para
  // funcionar mesmo quando o sistema pede "reduzir movimento" e o CSS geral corta as animações).
  const ticking = animated;
  useEffect(() => {
    if (!ticking) return;
    let raf = 0;
    const loop = (t: number) => {
      setClock(t / 1000);
      setPaws((list) => (list.some((p) => Date.now() - p.born > PAW_LIFE_MS) ? list.filter((p) => Date.now() - p.born <= PAW_LIFE_MS) : list));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ticking]);

  // Caminhada de verdade em 2D: anda (ou corre) até um ponto da tela deixando patinhas por onde passa.
  const walkTo = useCallback((tx: number, ty: number, speed = WALK_SPEED) => new Promise<void>((resolve) => {
    const sx = offsetRef.current.x;
    const sy = offsetRef.current.y;
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) { resolve(); return; }
    const left = dx < 0 || (Math.abs(dx) < 2 && facingLeftRef.current);
    if (Math.abs(dx) >= 2) { setFacingLeft(left); facingLeftRef.current = left; }
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90; // patinha apontando para onde ela vai
    const duration = (dist / speed) * 1000;
    const t0 = performance.now();
    let travelled = 0;
    let step = Math.floor((phaseRef.current - Math.PI / 2) / Math.PI);
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // arranca e freia suavemente
      const x = sx + dx * e;
      const y = sy + dy * e;
      const moved = Math.hypot(x - offsetRef.current.x, y - offsetRef.current.y);
      travelled += moved;
      // A passada avança conforme a distância andada: a pata no chão acompanha o chão, sem escorregar.
      const ph = phaseRef.current + (moved * 2 * Math.PI) / STRIDE_PX;
      phaseRef.current = ph;
      offsetRef.current = { x, y };
      setPhase(ph);
      setOffset({ x, y });
      // Cada vez que um par de patas (em diagonal) encosta no chão, ficam duas marquinhas.
      const nowStep = Math.floor((ph - Math.PI / 2) / Math.PI);
      if (nowStep !== step && root.current && travelled > 6) {
        step = nowStep;
        const box = root.current.getBoundingClientRect();
        const svgLeft = box.right + 8 - WALKER_W;
        const svgTop = box.bottom + 14 - WALKER_H;
        const pairA = nowStep % 2 === 0;
        const feet = pairA ? [FEET.near.front, FEET.far.back] : [FEET.far.front, FEET.near.back];
        const born = Date.now();
        const fl = facingLeftRef.current;
        const fresh = feet.map(([fx, fy]) => ({ id: born + pawId.current++ / 1000, born, x: svgLeft + (fl ? fx : WALKER_W - fx), y: svgTop + fy, angle }));
        setPaws((list) => [...list.slice(-40), ...fresh]);
      }
      if (k < 1) frame.current = requestAnimationFrame(tick);
      else { frame.current = null; resolve(); }
    };
    frame.current = requestAnimationFrame(tick);
  }), []);

  // Pulinhos no lugar (brincando com a caixinha).
  const hop = useCallback((ms: number) => new Promise<void>((resolve) => {
    const base = offsetRef.current.y;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = (t - t0) / ms;
      const y = k >= 1 ? base : base - Math.abs(Math.sin(k * Math.PI * 5)) * 12;
      offsetRef.current = { x: offsetRef.current.x, y };
      setOffset({ x: offsetRef.current.x, y });
      if (k < 1) frame.current = requestAnimationFrame(tick);
      else { frame.current = null; resolve(); }
    };
    frame.current = requestAnimationFrame(tick);
  }), []);

  const pause = useCallback((ms: number) => new Promise((r) => later(ms, () => r(null))), [later]);

  const stroll = useCallback(async () => {
    if (busy.current || !root.current) return;
    busy.current = true;
    setMenuOpen(false);
    const now0 = root.current.getBoundingClientRect();
    const homeRight = now0.right - offsetRef.current.x;
    const homeBottom = now0.bottom - offsetRef.current.y;
    // Converte "onde quero que a cachorrinha fique" (centro dos pés, na tela) no deslocamento dela.
    const toOffset = (cx: number, feetY: number) => {
      const minCx = WALKER_W / 2 + 8;
      const maxCx = window.innerWidth - WALKER_W / 2 - 8;
      const c = Math.max(minCx, Math.min(maxCx, cx));
      const y = Math.max(-(homeBottom - WALKER_H - 8), feetY - (homeBottom + 14 - WALKER_H + 95));
      return { x: Math.round(c - (homeRight + 8 - WALKER_W / 2)), y: Math.round(Math.min(0, y)) };
    };
    // Procura uma das caixinhas 3D visíveis para brincar.
    const boxes = Array.from(document.querySelectorAll<HTMLElement>(".sf-3d-action, .hc-gold-action")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 40 && r.height > 30 && r.top > 60 && r.bottom < window.innerHeight - 20 && r.left >= 0 && r.right <= window.innerWidth;
    });
    const isHungry = Date.now() - readNumber(FED_STORAGE, Date.now()) > HUNGRY_AFTER_MS;
    const toy = boxes.length && !isHungry && Math.random() < 0.85 ? pick(boxes) : null;
    if (toy) {
      const r = toy.getBoundingClientRect();
      const target = toOffset(r.left + r.width / 2 + 30, r.bottom + 4);
      setMood("walking");
      await walkTo(target.x, target.y, RUN_SPEED); // sai correndo
      setFacingLeft(true); facingLeftRef.current = true; // vira para a caixinha
      setMood("playing");
      say(pick(PLAY_LINES), 3800);
      toy.classList.add("sf-guardian-toy");
      await hop(1800);
      toy.classList.remove("sf-guardian-toy");
      await pause(300);
      toy.classList.add("sf-guardian-toy");
      await hop(1200);
      toy.classList.remove("sf-guardian-toy");
      setMood("asking");
      say(pick(ASK_LINES), 4500);
      await pause(4800);
    } else {
      const room = Math.max(0, now0.left - offsetRef.current.x - 24);
      setMood("walking");
      await walkTo(-Math.round(room * (0.35 + Math.random() * 0.5)), 0);
      setMood(isHungry ? "hungry" : "asking");
      say(pick(isHungry ? HUNGRY_LINES : ASK_LINES), 5500);
      await pause(6000);
    }
    setBubble(null);
    setMood("walking");
    await walkTo(0, 0);
    setFacingLeft(true); facingLeftRef.current = true; // de volta ao cantinho, olhando para a tela
    setMood(isHungry ? "hungry" : "idle");
    busy.current = false;
  }, [hop, pause, say, walkTo]);

  // Passeia com frequência (a primeira logo depois de abrir, depois a cada 25 a 60 segundos) ela sai para passear, se a Dra. não estiver mexendo nela.
  useEffect(() => {
    if (!animated) { if (frame.current) cancelAnimationFrame(frame.current); frame.current = null; busy.current = false; offsetRef.current = { x: 0, y: 0 }; setOffset({ x: 0, y: 0 }); document.querySelectorAll(".sf-guardian-toy").forEach((el) => el.classList.remove("sf-guardian-toy")); setMood("idle"); return; }
    let cancelled = false;
    const schedule = (first = false) => {
      const wait = first ? 5000 + Math.random() * 4000 : 25000 + Math.random() * 35000;
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
  const away = offset.x !== 0 || offset.y !== 0;
  const dogLeft = vw - 16 - 64 + offset.x;
  const panelLeft = Math.max(16, Math.min(dogLeft + 32 - panelWidth / 2, vw - 16 - panelWidth));
  const panelStyle = away ? { left: panelLeft - dogLeft, right: "auto", width: panelWidth } : undefined;

  const toggleMotion = () => {
    setPlayEnabled(!animated);
  };
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
          {paws.map((p) => {
            const age = (Date.now() - p.born) / PAW_LIFE_MS;
            const opacity = age < 0.05 ? age * 17 : age < 0.6 ? 0.85 - (age - 0.05) * 0.55 : Math.max(0, 0.55 * (1 - (age - 0.6) / 0.4));
            return <PawPrint key={p.id} className="sf-guardian-paw" style={{ left: p.x, top: p.y, opacity, transform: `translate(-50%, -50%) rotate(${p.angle}deg)` }} />;
          })}
        </div>
      )}
      <section
        ref={root}
        className={["sf-guardian", animated ? "sf-guardian-animated" : "", animated ? "sf-guardian-force-motion" : "", out ? "sf-guardian-out" : "", `sf-guardian-${mood}`, facingLeft ? "sf-guardian-left" : "sf-guardian-right"].filter(Boolean).join(" ")}
        style={away ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
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
          <button type="button" ref={trigger} className={"sf-guardian-trigger" + (out ? " sf-guardian-walker-btn" : "")} aria-expanded={menuOpen} aria-controls="sf-guardian-actions" onClick={onDogClick} aria-label={hungry ? "Guardiã SF está com fome. Abrir opções" : "Abrir opções da Guardiã SF"}>
            {out ? (
              <GuardianWalker phase={phase} time={clock} moving={mood === "walking"} mood={mood} facingLeft={facingLeft} />
            ) : (
              <span className="sf-guardian-portrait">
                <img className="sf-guardian-dog" src="/brand/guardia-sf.webp" alt="" aria-hidden="true" />
                {hungry && mood !== "eating" ? <Bone size={18} className="sf-guardian-hunger-badge" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
              </span>
            )}
          </button>
          {menuOpen && (
            <div className="sf-guardian-menu" id="sf-guardian-actions" aria-label="Ações da Guardiã SF" style={panelStyle}>
              <strong className="sf-guardian-menu-title"><img src="/brand/guardia-sf.webp" alt="" aria-hidden="true" />Guardiã SF</strong>
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
              <button type="button" aria-pressed={!animated} onClick={toggleMotion}>{animated ? <VolumeX size={17} /> : <Volume2 size={17} />}{animated ? "Silenciar animações" : "Ativar animações"}</button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

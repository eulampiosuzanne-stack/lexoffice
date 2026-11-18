// Guardiã SF de corpo inteiro (11/11/2026, v2): o rostinho é a própria imagem original dela
// (recortada, sem fundo: public/brand/guardia-sf-cabeca.webp) e o corpo peludinho é desenhado nas
// mesmas cores do pelo dela, montado em partes para andar como cachorro de verdade: trote em diagonal
// (dianteira de um lado junto com a traseira do outro), joelho dobrando ao levantar a pata, corpo
// subindo e descendo a cada passada, rabo abanando e cabecinha balançando.
// Componente puro (sem hooks): quem anima é o Guardian.tsx, que passa a fase da passada e o relógio.

export type WalkerMood = "walking" | "asking" | "hungry" | "idle" | "happy" | "eating" | "playing";

type Props = {
  phase: number; // fase da passada (radianos); avança conforme a distância andada, então a pata não "escorrega"
  time: number; // relógio em segundos, para rabo, respiração e cabeça
  moving: boolean;
  mood: WalkerMood;
  facingLeft: boolean;
};

// Cores tiradas da imagem original dela.
const FUR = "#D08445";
const FUR_LIGHT = "#E8A865";
const FUR_DARK = "#A85A1E";

export const WALKER_W = 140;
export const WALKER_H = 100;
export const LEG_SWING = 20; // graus de abertura da pata para frente/trás
export const STRIDE_PX = 24; // distância (px na tela) de uma passada completa
// Onde os pezinhos encostam no chão (coordenadas do desenho, virado para a esquerda).
export const FEET = { near: { front: [43, 95], back: [90, 95] }, far: { front: [45, 91], back: [92, 91] } } as const;

// Ângulos de uma pata: coxa gira no quadril/ombro, canela dobra quando a pata está no ar.
export function legPose(phase: number, offset: number, moving: boolean) {
  if (!moving) return { upper: 0, lower: 0 };
  const p = phase + offset;
  const lift = Math.max(0, Math.cos(p)); // >0 = pata no ar indo para frente
  return { upper: LEG_SWING * Math.sin(p), lower: -48 * lift };
}

// Silhueta com tufinhos de pelo na borda (em vez de bolinhas), para parecer pelo de verdade.
function furPath(cx: number, cy: number, rx: number, ry: number, tufts: number, amp: number, belly = 0) {
  let d = "";
  for (let i = 0; i <= tufts; i++) {
    const a0 = (i / tufts) * Math.PI * 2;
    const am = ((i + 0.5) / tufts) * Math.PI * 2;
    const extra = 1 + amp + (Math.sin(am) > 0.3 ? belly : 0); // franja maior embaixo
    const x0 = cx + rx * Math.cos(a0);
    const y0 = cy + ry * Math.sin(a0);
    if (i === 0) { d += `M${x0.toFixed(1)} ${y0.toFixed(1)}`; continue; }
    const cxm = cx + rx * extra * Math.cos(am - 0.08);
    const cym = cy + ry * extra * Math.sin(am - 0.08);
    d += ` Q${cxm.toFixed(1)} ${cym.toFixed(1)} ${x0.toFixed(1)} ${y0.toFixed(1)}`;
  }
  return d + "Z";
}
const BODY = furPath(82, 58, 33, 16, 30, 0.16, 0.18);
const CHEST = furPath(50, 63, 15, 15, 16, 0.2, 0.15);

function Leg({ x, y, pose, far, hind }: { x: number; y: number; pose: { upper: number; lower: number }; far?: boolean; hind?: boolean }) {
  const upperW = hind ? 15 : 12;
  return (
    <g transform={`translate(${x} ${y}) rotate(${pose.upper.toFixed(2)})`} style={far ? { filter: "brightness(0.74)" } : undefined}>
      <g>
        <path d={`M${-upperW / 2} -5 h${upperW} l1.5 4 -1.5 3 1.5 4 -1.5 3 1 4 -2 4 h${-(upperW - 2)} l-2 -4 1 -4 -1.5 -3 1.5 -4 -1.5 -3 Z`} fill="url(#sfGuardianFur)" />
      </g>
      <g transform={`translate(0 15) rotate(${pose.lower.toFixed(2)})`}>
        <rect x={-5.5} y={-2} width={11} height={16} rx={5} fill="url(#sfGuardianFur)" />
        <path d="M-9.5 15 q1 -5 4 -5 h8 q3 0 4 5 q-8 4 -16 0 Z" fill="url(#sfGuardianFur)" />
        <path d="M-9.5 15 q8 4 16 0" stroke={FUR_DARK} strokeWidth={1} fill="none" opacity={0.6} />
      </g>
    </g>
  );
}

export default function GuardianWalker({ phase, time, moving, mood, facingLeft }: Props) {
  const playing = !moving && mood === "playing";
  const begging = !moving && (mood === "asking" || mood === "hungry" || playing);
  const happy = mood === "happy";
  const eating = mood === "eating";
  const bob = moving ? -1.8 * Math.abs(Math.sin(phase)) : begging ? -1.4 * Math.abs(Math.sin(time * 5)) : 0.7 * Math.sin(time * 2.4);
  const tailSpeed = moving ? 11 : playing ? 22 : begging || happy ? 16 : 4;
  const tailAmp = moving ? 14 : begging || happy ? 26 : 9;
  const tail = -10 + tailAmp * Math.sin(time * tailSpeed);
  const headTilt = begging ? -8 + 3 * Math.sin(time * 2.5) : eating ? 8 + 3 * Math.sin(time * 18) : moving ? 2.5 * Math.sin(phase * 2) : 1.5 * Math.sin(time * 1.3);
  const headBob = moving ? -1.2 * Math.abs(Math.sin(phase)) : 0;

  const nearFront = playing ? { upper: 70 + 22 * Math.sin(time * 14), lower: -60 } : begging ? { upper: 62 + 8 * Math.sin(time * 6), lower: -70 } : legPose(phase, 0, moving);
  const farBack = legPose(phase, 0, moving);
  const farFront = legPose(phase, Math.PI, moving);
  const nearBack = legPose(phase, Math.PI, moving);

  // A imagem do rosto nunca fica espelhada (a medalha SF continua legível quando ela vira para a direita).
  const head = (
    <g transform={`translate(40 54) rotate(${headTilt.toFixed(2)}) translate(0 ${headBob.toFixed(2)})`}>
      <g transform={facingLeft ? undefined : "scale(-1 1)"}>
        <image href="/brand/guardia-sf-cabeca.webp" x={-35} y={-54} width={70} height={68} preserveAspectRatio="xMidYMid meet" />
      </g>
    </g>
  );

  return (
    <svg className="sf-guardian-walker" viewBox={`0 0 ${WALKER_W} ${WALKER_H}`} width={WALKER_W} height={WALKER_H} aria-hidden="true" focusable="false">
      <defs>
        {/* Textura do pelo tirada da imagem original dela. */}
        <pattern id="sfGuardianFur" patternUnits="userSpaceOnUse" width="64" height="48">
          <rect width="64" height="48" fill={FUR} />
          <image href="/brand/guardia-sf-pelo.webp" width="64" height="48" preserveAspectRatio="none" />
        </pattern>
        <linearGradient id="sfGuardianShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE2B0" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#FFE2B0" stopOpacity="0" />
          <stop offset="1" stopColor="#5A2A08" stopOpacity="0.38" />
        </linearGradient>
      </defs>
      <ellipse cx="72" cy="96" rx="42" ry="3.2" fill="#000" opacity="0.14" />
      <g transform={facingLeft ? undefined : `translate(${WALKER_W} 0) scale(-1 1)`}>
        <g transform={`translate(0 ${bob.toFixed(2)})`}>
          {/* Patas do lado de lá (mais escuras, atrás do corpo). */}
          <Leg x={104} y={62} pose={farBack} far hind />
          <Leg x={60} y={63} pose={farFront} far />

          {/* Rabo peludo em pluma. */}
          <g transform={`translate(110 50) rotate(${tail.toFixed(2)})`}>
            <path d="M0 2 C 6 -4, 10 -12, 8 -22 C 7 -30, 12 -36, 18 -34 C 14 -30, 22 -28, 20 -22 C 24 -18, 20 -12, 22 -8 C 18 -6, 18 0, 12 4 C 10 8, 4 8, 0 2 Z" fill="url(#sfGuardianFur)" />
            <path d="M3 0 C 9 -8, 12 -18, 12 -28" stroke={FUR_LIGHT} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.7" />
          </g>

          {/* Corpo com a textura do pelo dela e franjinha embaixo. */}
          <path d={BODY} fill="url(#sfGuardianFur)" />
          <path d={BODY} fill="url(#sfGuardianShade)" />

          {/* Patas do lado de cá. */}
          <Leg x={102} y={64} pose={nearBack} hind />
          <Leg x={58} y={65} pose={nearFront} />

          {/* Peitinho/pescoço que liga a cabeça ao corpo. */}
          <path d={CHEST} fill="url(#sfGuardianFur)" />
          <path d={CHEST} fill="url(#sfGuardianShade)" />

          {head}
        </g>
      </g>
    </svg>
  );
}

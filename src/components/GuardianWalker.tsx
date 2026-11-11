// Guardiã SF de corpo inteiro (11/11/2026, v2): o rostinho é a própria imagem original dela
// (recortada, sem fundo: public/brand/guardia-sf-cabeca.webp) e o corpo peludinho é desenhado nas
// mesmas cores do pelo dela, montado em partes para andar como cachorro de verdade: trote em diagonal
// (dianteira de um lado junto com a traseira do outro), joelho dobrando ao levantar a pata, corpo
// subindo e descendo a cada passada, rabo abanando e cabecinha balançando.
// Componente puro (sem hooks): quem anima é o Guardian.tsx, que passa a fase da passada e o relógio.

export type WalkerMood = "walking" | "asking" | "hungry" | "idle" | "happy" | "eating";

type Props = {
  phase: number; // fase da passada (radianos); avança conforme a distância andada, então a pata não "escorrega"
  time: number; // relógio em segundos, para rabo, respiração e cabeça
  moving: boolean;
  mood: WalkerMood;
  facingLeft: boolean;
};

// Cores tiradas da imagem original dela.
const FUR = "#D98A45";
const FUR_LIGHT = "#EDAE63";
const FUR_DARK = "#B8682A";
const FUR_FAR = "#A65A20";
const INK = "#3A1F0C";

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

function Leg({ x, y, pose, fill, hind }: { x: number; y: number; pose: { upper: number; lower: number }; fill: string; hind?: boolean }) {
  const upperW = hind ? 14 : 11;
  return (
    <g transform={`translate(${x} ${y}) rotate(${pose.upper.toFixed(2)})`}>
      <rect x={-upperW / 2} y={-5} width={upperW} height={21} rx={upperW / 2} fill={fill} />
      <circle cx={-upperW / 2 + 2} cy={6} r={3.2} fill={fill} />
      <circle cx={upperW / 2 - 2} cy={10} r={3} fill={fill} />
      <g transform={`translate(0 15) rotate(${pose.lower.toFixed(2)})`}>
        <rect x={-5} y={-2} width={10} height={16} rx={5} fill={fill} />
        <ellipse cx={-2.5} cy={14.5} rx={6.8} ry={3.8} fill={fill} />
        <path d="M-7.5 15.6 q1.7 -1.7 3.2 0 M-3.8 15.9 q1.7 -1.7 3.2 0" stroke={INK} strokeOpacity={0.3} strokeWidth={0.8} fill="none" />
      </g>
    </g>
  );
}

// Tufinhos cacheados (pelo encaracolado como o dela).
function Curls({ points, fill, stroke }: { points: [number, number, number][]; fill: string; stroke: string }) {
  return (
    <g>
      {points.map(([cx, cy, r], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r} fill={fill} />
          <path d={`M${cx - r * 0.55} ${cy + r * 0.1} q${r * 0.55} ${-r * 0.7} ${r * 1.1} 0`} stroke={stroke} strokeWidth={1.1} strokeLinecap="round" fill="none" opacity={0.55} />
        </g>
      ))}
    </g>
  );
}

export default function GuardianWalker({ phase, time, moving, mood, facingLeft }: Props) {
  const begging = !moving && (mood === "asking" || mood === "hungry");
  const happy = mood === "happy";
  const eating = mood === "eating";
  const bob = moving ? -1.8 * Math.abs(Math.sin(phase)) : begging ? -1.4 * Math.abs(Math.sin(time * 5)) : 0.7 * Math.sin(time * 2.4);
  const tailSpeed = moving ? 9 : begging || happy ? 16 : 4;
  const tailAmp = moving ? 14 : begging || happy ? 26 : 9;
  const tail = -10 + tailAmp * Math.sin(time * tailSpeed);
  const headTilt = begging ? -8 + 3 * Math.sin(time * 2.5) : eating ? 8 + 3 * Math.sin(time * 18) : moving ? 2.5 * Math.sin(phase * 2) : 1.5 * Math.sin(time * 1.3);
  const headBob = moving ? -1.2 * Math.abs(Math.sin(phase)) : 0;

  const nearFront = begging ? { upper: 62 + 8 * Math.sin(time * 6), lower: -70 } : legPose(phase, 0, moving);
  const farBack = legPose(phase, 0, moving);
  const farFront = legPose(phase, Math.PI, moving);
  const nearBack = legPose(phase, Math.PI, moving);

  // A imagem do rosto nunca fica espelhada (a medalha SF continua legível quando ela vira para a direita).
  const head = (
    <g transform={`translate(40 54) rotate(${headTilt.toFixed(2)}) translate(0 ${headBob.toFixed(2)})`}>
      <g transform={facingLeft ? undefined : "scale(-1 1)"}>
        <image href="/brand/guardia-sf-cabeca.webp" x={-33} y={-54} width={66} height={68} preserveAspectRatio="xMidYMid meet" />
      </g>
    </g>
  );

  return (
    <svg className="sf-guardian-walker" viewBox={`0 0 ${WALKER_W} ${WALKER_H}`} width={WALKER_W} height={WALKER_H} aria-hidden="true" focusable="false">
      <ellipse cx="72" cy="96" rx="42" ry="3.2" fill="#000" opacity="0.14" />
      <g transform={facingLeft ? undefined : `translate(${WALKER_W} 0) scale(-1 1)`}>
        <g transform={`translate(0 ${bob.toFixed(2)})`}>
          {/* Patas do lado de lá (mais escuras, atrás do corpo). */}
          <Leg x={104} y={62} pose={farBack} fill={FUR_FAR} hind />
          <Leg x={60} y={63} pose={farFront} fill={FUR_FAR} />

          {/* Rabo peludo em pluma. */}
          <g transform={`translate(110 50) rotate(${tail.toFixed(2)})`}>
            <path d="M0 0 C 10 -6, 17 -19, 13 -32 C 22 -24, 24 -8, 10 5 Z" fill={FUR} />
            <circle cx="13" cy="-28" r="5" fill={FUR} /><circle cx="15" cy="-18" r="4.6" fill={FUR} /><circle cx="11" cy="-8" r="4.4" fill={FUR} />
            <path d="M3 -2 C 10 -9, 15 -18, 13 -27" stroke={FUR_LIGHT} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </g>

          {/* Corpo peludinho e cacheado. */}
          <ellipse cx="82" cy="57" rx="32" ry="16" fill={FUR} />
          <Curls fill={FUR} stroke={FUR_DARK} points={[[60, 45, 7.5], [72, 42, 7.5], [85, 42, 7.5], [98, 44, 7.5], [109, 51, 6.5], [66, 70, 6.5], [80, 72, 6.5], [95, 70, 6.5], [108, 63, 6]]} />
          <g opacity="0.45"><Curls fill={FUR_LIGHT} stroke="none" points={[[70, 54, 5.5], [84, 55, 5.5], [97, 56, 5]]} /></g>

          {/* Patas do lado de cá. */}
          <Leg x={102} y={64} pose={nearBack} fill={FUR} hind />
          <Leg x={58} y={65} pose={nearFront} fill={FUR} />

          {head}
        </g>
      </g>
    </svg>
  );
}

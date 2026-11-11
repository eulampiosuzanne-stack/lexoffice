// Guardiã SF de corpo inteiro (11/11/2026): desenho próprio da cachorrinha caramelo peludinha,
// com coleira dourada e medalha SF, montada em partes (patas com coxa, canela e pezinho, rabo,
// orelhas e cabeça) para andar como um cachorro de verdade: trote em diagonal (pata dianteira de um
// lado junto com a traseira do outro), joelho dobrando ao levantar a pata, corpo subindo e descendo
// a cada passada, rabo abanando e orelhas balançando.
// Componente puro (sem hooks): quem anima é o Guardian.tsx, que passa a fase da passada e o relógio.

export type WalkerMood = "walking" | "asking" | "hungry" | "idle" | "happy" | "eating";

type Props = {
  phase: number; // fase da passada (radianos); avança conforme a distância andada, então a pata não "escorrega"
  time: number; // relógio em segundos, para rabo, respiração e orelhas
  moving: boolean;
  mood: WalkerMood;
  facingLeft: boolean;
};

const FUR = "#D9964A";
const FUR_LIGHT = "#EDB878";
const FUR_DARK = "#B97636";
const FUR_FAR = "#A9672D";
const GOLD = "#D4AF37";
const GOLD_DARK = "#9C7A1C";
const INK = "#2A1A12";

export const LEG_SWING = 24; // graus de abertura da pata para frente/trás
export const STRIDE_PX = 40; // distância (px na tela) de uma passada completa

// Ângulos de uma pata: coxa gira no quadril/ombro, canela dobra quando a pata está no ar.
export function legPose(phase: number, offset: number, moving: boolean) {
  if (!moving) return { upper: 0, lower: 0 };
  const p = phase + offset;
  const lift = Math.max(0, Math.cos(p)); // >0 = pata no ar indo para frente
  return { upper: LEG_SWING * Math.sin(p), lower: -48 * lift };
}

function Leg({ x, y, pose, fill, hind }: { x: number; y: number; pose: { upper: number; lower: number }; fill: string; hind?: boolean }) {
  // Coxa (traseira é mais grossa), canela e pezinho; pivô no topo de cada segmento.
  const upperW = hind ? 13 : 10;
  return (
    <g transform={`translate(${x} ${y}) rotate(${pose.upper.toFixed(2)})`}>
      <rect x={-upperW / 2} y={-4} width={upperW} height={20} rx={upperW / 2} fill={fill} />
      <g transform={`translate(0 15) rotate(${pose.lower.toFixed(2)})`}>
        <rect x={-4.5} y={-2} width={9} height={16} rx={4.5} fill={fill} />
        <ellipse cx={-2.5} cy={14.5} rx={6.4} ry={3.6} fill={fill} />
        <path d="M-7 15.5 q1.6 -1.6 3 0 M-3.6 15.8 q1.6 -1.6 3 0" stroke={INK} strokeOpacity={0.25} strokeWidth={0.8} fill="none" />
      </g>
    </g>
  );
}

export default function GuardianWalker({ phase, time, moving, mood, facingLeft }: Props) {
  const begging = !moving && (mood === "asking" || mood === "hungry");
  const happy = mood === "happy";
  // Trote: duas "subidas" do corpo por passada.
  const bob = moving ? -1.6 * Math.abs(Math.sin(phase)) : begging ? -1.2 * Math.abs(Math.sin(time * 5)) : 0.6 * Math.sin(time * 2.4);
  const tailSpeed = moving ? 9 : begging || happy ? 16 : 4;
  const tailAmp = moving ? 14 : begging || happy ? 26 : 8;
  const tail = -10 + tailAmp * Math.sin(time * tailSpeed);
  const ear = moving ? 7 * Math.sin(phase * 2) : begging ? 5 * Math.sin(time * 5) : 2 * Math.sin(time * 2);
  const headTilt = begging ? -9 + 3 * Math.sin(time * 2.5) : moving ? 2 * Math.sin(phase * 2) : 0;
  const pant = moving || begging || happy;
  const tongue = pant ? 1 + 0.18 * Math.sin(time * 14) : 0;

  // Diagonais: dianteira de perto + traseira de longe juntas; dianteira de longe + traseira de perto juntas.
  const nearFront = begging ? { upper: 62 + 8 * Math.sin(time * 6), lower: -70 } : legPose(phase, 0, moving);
  const farBack = legPose(phase, 0, moving);
  const farFront = legPose(phase, Math.PI, moving);
  const nearBack = legPose(phase, Math.PI, moving);

  return (
    <svg className="sf-guardian-walker" viewBox="0 0 124 92" width="124" height="92" aria-hidden="true" focusable="false">
      <ellipse cx="62" cy="88" rx="40" ry="3.2" fill="#000" opacity="0.14" />
      <g transform={facingLeft ? undefined : "translate(124 0) scale(-1 1)"}>
        <g transform={`translate(0 ${bob.toFixed(2)})`}>
          {/* Patas do lado de lá (mais escuras, ficam atrás do corpo). */}
          <Leg x={88} y={52} pose={farBack} fill={FUR_FAR} hind />
          <Leg x={46} y={53} pose={farFront} fill={FUR_FAR} />

          {/* Rabo peludo em pluma. */}
          <g transform={`translate(92 40) rotate(${tail.toFixed(2)})`}>
            <path d="M0 0 C 10 -6, 16 -18, 12 -30 C 20 -22, 22 -8, 10 4 Z" fill={FUR} />
            <path d="M3 -2 C 10 -9, 14 -18, 12 -26" stroke={FUR_LIGHT} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </g>

          {/* Corpo com tufinhos de pelo. */}
          <ellipse cx="66" cy="47" rx="31" ry="16" fill={FUR} />
          <g fill={FUR}>
            <circle cx="46" cy="36" r="7" /><circle cx="58" cy="33" r="7" /><circle cx="71" cy="33" r="7" /><circle cx="84" cy="35" r="7" /><circle cx="93" cy="42" r="6" />
            <circle cx="52" cy="60" r="6" /><circle cx="66" cy="62" r="6" /><circle cx="80" cy="60" r="6" />
          </g>
          <path d="M52 40 q6 -4 12 0 M68 39 q6 -4 12 0 M58 52 q5 -3 10 0 M74 51 q5 -3 10 0" stroke={FUR_DARK} strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.55" />
          {/* Peito fofinho (mais claro). */}
          <ellipse cx="42" cy="50" rx="10" ry="12" fill={FUR_LIGHT} />

          {/* Patas do lado de cá. */}
          <Leg x={86} y={54} pose={nearBack} fill={FUR} hind />
          <Leg x={44} y={55} pose={nearFront} fill={FUR} />

          {/* Cabeça. */}
          <g transform={`translate(34 36) rotate(${headTilt.toFixed(2)})`}>
            {/* Orelha do lado de lá. */}
            <g transform={`translate(8 -10) rotate(${(12 - ear).toFixed(2)})`}>
              <ellipse cx="2" cy="12" rx="7" ry="14" fill={FUR_FAR} />
            </g>
            <circle cx="-4" cy="-8" r="15.5" fill={FUR} />
            <g fill={FUR}><circle cx="-12" cy="-21" r="5.5" /><circle cx="-3" cy="-24" r="6" /><circle cx="6" cy="-20" r="5.5" /></g>
            {/* Focinho. */}
            <ellipse cx="-16" cy="-2" rx="11" ry="8" fill={FUR_LIGHT} />
            <ellipse cx="-25" cy="-5" rx="3.8" ry="3.1" fill={INK} />
            <circle cx="-26.2" cy="-6.2" r="0.9" fill="#fff" opacity="0.7" />
            <path d="M-22 1 q4 3 9 0" stroke={INK} strokeWidth="1.3" strokeLinecap="round" fill="none" />
            {pant && (
              <g transform={`translate(-17 2) scale(1 ${tongue.toFixed(3)})`}>
                <path d="M-3 0 h6 v6 a3 3 0 0 1 -6 0 Z" fill="#E77A8A" />
                <path d="M0 1 v5" stroke="#C2566A" strokeWidth="0.8" />
              </g>
            )}
            {/* Olho brilhante. */}
            <ellipse cx="-11" cy="-11" rx="3" ry="3.3" fill={INK} />
            <circle cx="-12" cy="-12.3" r="1.1" fill="#fff" />
            <path d="M-15 -16 q4 -2.5 7 0" stroke={FUR_DARK} strokeWidth="1.2" strokeLinecap="round" fill="none" />
            {/* Orelha do lado de cá (comprida e caidinha). */}
            <g transform={`translate(3 -14) rotate(${(8 + ear).toFixed(2)})`}>
              <ellipse cx="3" cy="13" rx="7.5" ry="15" fill={FUR_DARK} />
              <path d="M0 4 q3 10 1 20 M5 5 q3 9 2 18" stroke={FUR} strokeWidth="1.1" fill="none" opacity="0.8" />
            </g>
            {/* Coleira dourada com medalha SF. */}
            <path d="M-6 6 Q 4 12 14 4" stroke={GOLD} strokeWidth="4.2" strokeLinecap="round" fill="none" />
            <path d="M-6 6 Q 4 12 14 4" stroke={GOLD_DARK} strokeWidth="0.8" fill="none" opacity="0.6" transform="translate(0 1.8)" />
            <g transform={`translate(3 15) rotate(${(moving ? 10 * Math.sin(phase * 2) : 0).toFixed(2)} 0 -5)`}>
              <circle cx="0" cy="0" r="5.2" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.9" />
              <text x="0" y="2" transform={facingLeft ? undefined : "scale(-1 1)"} textAnchor="middle" fontSize="5.4" fontWeight="700" fontFamily="Georgia, serif" fill={INK}>SF</text>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

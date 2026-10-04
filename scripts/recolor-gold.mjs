// Converte cores fora da paleta preto & dourado aprovada (03/10/2026) para a paleta oficial.
// Uso: node scripts/recolor-gold.mjs arquivo1 arquivo2 ...  (reescreve no lugar)
// Regras: tons dourados (matiz 34°–52°) são mantidos; cinzas neutros são mantidos;
// vermelho, vinho, rosa, laranja, azul, marinho, verde e roxo viram tons da paleta conforme a luminosidade.
import fs from 'node:fs';

const PALETTE = {
  bg: [8, 7, 5],          // #080705
  sidebar: [16, 12, 8],   // #100C08
  card: [23, 17, 12],     // #17110C
  card2: [36, 26, 17],    // #241a11
  bronze: [138, 87, 38],  // #8A5726
  gold: [201, 148, 67],   // #C99443
  gold2: [242, 197, 109], // #F2C56D
  subtle: [143, 133, 118],// #8f8576
  muted: [189, 180, 166], // #BDB4A6
  text2: [231, 223, 208], // #E7DFD0
  text: [245, 241, 232],  // #F5F1E8
};

function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

export function mapRgb(rgb) {
  const { h, s, l } = hsl(rgb);
  // Dourados, bronzes e cafés da paleta: matiz 22°–58° (exceto laranja vivo, que a Dra. Suzanne não aprova)
  const brightOrange = h < 34 && l >= 0.42 && s > 0.55;
  const isGoldHue = h >= 22 && h <= 58 && !brightOrange;
  if (s < 0.08) return null;                 // cinza neutro: mantém
  if (isGoldHue) return null;                // dourado, bronze, café ou cinza quente: mantém
  // Tons coloridos fora da paleta
  if (l < 0.05) return PALETTE.bg;
  if (l < 0.085) return PALETTE.sidebar;
  if (l < 0.13) return PALETTE.card;
  if (l < 0.2) return PALETTE.card2;
  if (s < 0.25) {                            // cinza azulado/esverdeado → cinza quente
    if (l < 0.3) return [46, 34, 22];        // #2E2216 borda quente
    if (l < 0.45) return PALETTE.subtle;
    if (l < 0.75) return PALETTE.muted;
    return PALETTE.text2;
  }
  if (l < 0.33) return PALETTE.bronze;
  if (l < 0.6) return PALETTE.gold;
  if (l < 0.82) return PALETTE.gold2;
  return PALETTE.text;
}

const hex2 = n => n.toString(16).padStart(2, '0');
function toHex([r, g, b], alpha) {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
  return alpha == null ? base : `rgba(${r},${g},${b},${alpha})`;
}

export function recolor(text) {
  let changed = 0;
  // Protege seletores de atributo como [style*="#b51f43"] (usados para neutralizar cores inline)
  const kept = [];
  text = text.replace(/\[style\*=[^\]]*\]/g, m => { kept.push(m); return `__KEEP${kept.length - 1}__`; });
  // #rgb, #rgba, #rrggbb, #rrggbbaa
  text = text.replace(/#([0-9a-fA-F]{3,8})\b/g, (m, h) => {
    if (![3, 4, 6, 8].includes(h.length)) return m;
    let r, g, b, a = null;
    if (h.length <= 4) { r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); if (h.length === 4) a = +(parseInt(h[3] + h[3], 16) / 255).toFixed(3); }
    else { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); if (h.length === 8) a = +(parseInt(h.slice(6, 8), 16) / 255).toFixed(3); }
    const mapped = mapRgb([r, g, b]);
    if (!mapped) return m;
    changed++;
    return toHex(mapped, a);
  });
  text = text.replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+%?)\s*)?\)/g, (m, r, g, b, a) => {
    const mapped = mapRgb([+r, +g, +b]);
    if (!mapped) return m;
    changed++;
    return a == null ? toHex(mapped) : `rgba(${mapped[0]},${mapped[1]},${mapped[2]},${a})`;
  });
  text = text.replace(/__KEEP(\d+)__/g, (_, i) => kept[+i]);
  return { text, changed };
}

if (process.argv[1] && process.argv[1].endsWith('recolor-gold.mjs')) {
  let total = 0;
  for (const f of process.argv.slice(2)) {
    const src = fs.readFileSync(f, 'utf8');
    const { text, changed } = recolor(src);
    if (changed) { fs.writeFileSync(f, text); total += changed; console.log(`${changed}\t${f}`); }
  }
  console.log(`total ${total}`);
}

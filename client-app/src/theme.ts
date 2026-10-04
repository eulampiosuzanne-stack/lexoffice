import {Platform} from "react-native";

// Paleta oficial = a mesma do LEXOFFICE (decisão da Dra. Suzanne, 03/10/2026):
// preto profundo, cards em relevo e ouro em degradê (ouro profundo, sem amarelo).
export const C = {
  // base
  night: "#080705",      // fundo da tela inicial e login
  night2: "#100C08",     // variação do fundo escuro
  paper: "#100C08",      // fundo das telas internas
  card: "#1D150E",       // cartões em relevo
  cardHead: "#2A1F15",   // faixa de título dos cartões
  line: "#6E4914",       // bordas (ouro escuro)
  // marca
  brown: "#D6AA55",      // botões e ícones principais (ouro)
  brownDark: "#A97A2B",
  gold: "#C9993F",       // detalhes dourados
  gold2: "#E3BC6A",      // ouro luminoso
  goldHi: "#F2D894",     // brilho do degradê
  // texto
  ink: "#F5F1E8",        // marfim
  muted: "#D2C8B8",      // bege claro
  onDark: "#F5F1E8",
  onGold: "#1F1404",     // texto sobre botão dourado
  // status
  success: "#8CCB9F", successBg: "rgba(46,125,79,.20)",
  warning: "#E3BC6A", warningBg: "rgba(214,170,85,.16)",
  info: "#A9C1EC", infoBg: "rgba(45,99,184,.20)",
  danger: "#E8968C", dangerBg: "rgba(179,38,30,.20)",
  neutral: "#BDB4A6", neutralBg: "rgba(189,180,166,.12)",
  // compatibilidade com o código antigo
  black: "#080705", cream: "#1D150E",
};

// Relevo dos cartões (sombra) — iOS/Android/web
export const RAISE = {
  shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: {width: 0, height: 5}, elevation: 6,
} as const;

// Fonte serifada nativa: Georgia no iPhone, Noto Serif no Android.
export const SERIF = Platform.select({ios: "Georgia", android: "serif", default: "serif"}) as string;

export const R = {sm: 8, md: 12, lg: 16, pill: 999};

import {Platform} from "react-native";

// Identidade Suzanne Figueiredo: preto profundo, café, bronze, dourado e marfim.
export const C = {
  // base
  night: "#080705",      // fundo escuro da tela inicial e login
  night2: "#100C08",     // variação do fundo escuro
  paper: "#100C08",      // fundo das telas internas
  card: "#17110C",       // cartões
  cardHead: "#20170F",   // faixa de título dos cartões
  line: "#4A3420",       // bordas
  // marca
  brown: "#C99443",      // botões e ícones principais
  brownDark: "#8A5726",
  gold: "#C99443",       // detalhes dourados
  gold2: "#F2C56D",      // dourado claro (sobre fundo escuro)
  // texto
  ink: "#F5F1E8",
  muted: "#BDB4A6",
  onDark: "#F5F1E8",
  // status
  success: "#2E7D4F", successBg: "#E3F2E8",
  warning: "#C0680F", warningBg: "#FBEBD7",
  info: "#2D63B8", infoBg: "#E4ECF9",
  danger: "#B3261E", dangerBg: "#FBE4E1",
  neutral: "#8A7B6C", neutralBg: "#EFE6DA",
  // compatibilidade com o código antigo
  black: "#080705", cream: "#17110C",
};

// Fonte serifada nativa: Georgia no iPhone, Noto Serif no Android.
export const SERIF = Platform.select({ios: "Georgia", android: "serif", default: "serif"}) as string;

export const R = {sm: 8, md: 12, lg: 16, pill: 999};

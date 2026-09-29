import {Platform} from "react-native";

// Paleta do app do cliente — visual boutique: creme, marrom-caramelo e dourado.
export const C = {
  // base
  night: "#120C07",      // fundo escuro da tela inicial e login
  night2: "#1E150D",     // variação do fundo escuro
  paper: "#FBF3E9",      // fundo das telas internas
  card: "#FFFBF5",       // cartões
  cardHead: "#F5E7D3",   // faixa de título dos cartões
  line: "#EAD8BE",       // bordas
  // marca
  brown: "#7A4A14",      // botões e ícones principais
  brownDark: "#5C3610",
  gold: "#B8863B",       // detalhes dourados
  gold2: "#E9C98B",      // dourado claro (sobre fundo escuro)
  // texto
  ink: "#2A1D12",
  muted: "#7C6B5A",
  onDark: "#FFF6EA",
  // status
  success: "#2E7D4F", successBg: "#E3F2E8",
  warning: "#C0680F", warningBg: "#FBEBD7",
  info: "#2D63B8", infoBg: "#E4ECF9",
  danger: "#B3261E", dangerBg: "#FBE4E1",
  neutral: "#8A7B6C", neutralBg: "#EFE6DA",
  // compatibilidade com o código antigo
  black: "#120C07", cream: "#FFFBF5",
};

// Fonte serifada nativa: Georgia no iPhone, Noto Serif no Android.
export const SERIF = Platform.select({ios: "Georgia", android: "serif", default: "serif"}) as string;

export const R = {sm: 8, md: 12, lg: 16, pill: 999};

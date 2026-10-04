import React from "react";
import {ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import {C, RAISE, R, SERIF} from "./theme";

export type Tone = "success" | "warning" | "info" | "danger" | "neutral";

/** Área rolável padrão das telas internas. */
export const BG = require("../assets/fundo-sf.jpg");

// Fundo igual ao do LEXOFFICE: foto oficial SF com véu escuro por cima.
export function Backdrop({children}: {children: React.ReactNode}) {
  return (
    <ImageBackground source={BG} style={{flex: 1, backgroundColor: C.night}} resizeMode="cover">
      <View style={{flex: 1, backgroundColor: "rgba(8,7,5,.62)"}}>{children}</View>
    </ImageBackground>
  );
}

export function Screen({children, lead}: {children: React.ReactNode; lead?: string}) {
  return (
    <Backdrop>
      <ScrollView style={{flex: 1}} contentContainerStyle={u.pad}>
        {lead ? <Text style={u.lead}>{lead}</Text> : null}
        {children}
      </ScrollView>
    </Backdrop>
  );
}

export function Loading() {
  return (
    <View style={u.loading}>
      <ActivityIndicator color={C.brown} />
    </View>
  );
}

/** Cartão com faixa de título opcional (como "Resumo do seu plano"). */
export const GOLD = require("../assets/ouro-degrade.png");

/** Moldura em ouro degradê com brilho (como na LEX), com relevo por baixo. */
export function GoldFrame({children, style, radius = R.md, width = 1.5, fill = C.card}: {children?: React.ReactNode; style?: any; radius?: number; width?: number; fill?: string}) {
  return (
    <View style={[{borderRadius: radius}, RAISE, style]}>
      <ImageBackground source={GOLD} resizeMode="stretch" style={{borderRadius: radius, padding: width, overflow: "hidden"}} imageStyle={{borderRadius: radius}}>
        <View style={{backgroundColor: fill, borderRadius: Math.max(radius - width, 0), overflow: "hidden"}}>{children}</View>
      </ImageBackground>
    </View>
  );
}

export function Card({title, children, style, onPress}: {title?: string; children?: React.ReactNode; style?: ViewStyle; onPress?: () => void}) {
  const body = (
    <GoldFrame style={[{marginBottom: 16}, style]}>
      {title ? (
        <View style={u.cardHead}>
          <Text style={u.cardHeadText}>{title}</Text>
        </View>
      ) : null}
      <View style={u.cardBody}>{children}</View>
    </GoldFrame>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({pressed}) => [pressed && u.pressed]}>
        {body}
      </Pressable>
    );
  }
  return body;
}

/** Linha com ícone, rótulo e valor (usada no Financeiro e em listas). */
export function InfoRow({icon, label, value, right, last}: {icon: any; label: string; value?: React.ReactNode; right?: React.ReactNode; last?: boolean}) {
  return (
    <View style={[u.row, !last && u.rowLine]}>
      <View style={u.rowIcon}>
        <Ionicons name={icon} size={20} color={C.brown} />
      </View>
      <View style={{flex: 1}}>
        <Text style={u.rowLabel}>{label}</Text>
        {typeof value === "string" ? <Text style={u.rowValue}>{value}</Text> : value}
      </View>
      {right}
    </View>
  );
}

export function Pill({label, tone = "neutral", icon}: {label: string; tone?: Tone; icon?: any}) {
  const color = C[tone];
  const bg = C[`${tone}Bg` as const];
  return (
    <View style={[u.pill, {backgroundColor: bg}]}>
      {icon ? <Ionicons name={icon} size={12} color={color} style={{marginRight: 4}} /> : null}
      <Text style={[u.pillText, {color}]}>{label}</Text>
    </View>
  );
}

export function Button({label, onPress, variant = "primary", icon, disabled}: {label: string; onPress?: () => void; variant?: "primary" | "outline" | "dark"; icon?: any; disabled?: boolean}) {
  const st = variant === "outline" ? u.btnOutline : variant === "dark" ? u.btnDark : u.btn;
  const tx = variant === "outline" ? u.btnOutlineText : variant === "dark" ? u.btnDarkText : u.btnText;
  const ic = variant === "outline" ? C.brown : variant === "dark" ? C.gold2 : C.onGold;
  const inner = (
    <>
      {icon ? <Ionicons name={icon} size={18} color={ic} style={{marginRight: 8}} /> : null}
      <Text style={tx}>{label}</Text>
    </>
  );
  if (variant === "primary") {
    // Botão principal em ouro degradê polido, com relevo.
    return (
      <Pressable disabled={disabled} onPress={onPress} style={({pressed}) => [{marginTop: 12, borderRadius: R.md}, RAISE, pressed && {transform: [{translateY: 2}]}, disabled && {opacity: 0.5}]}>
        <ImageBackground source={GOLD} resizeMode="stretch" style={[st, {marginTop: 0, backgroundColor: "transparent", overflow: "hidden", borderWidth: 1, borderColor: C.goldHi}]} imageStyle={{borderRadius: R.md}}>
          {inner}
        </ImageBackground>
      </Pressable>
    );
  }
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({pressed}) => [st, pressed && u.pressed, disabled && {opacity: 0.5}]}>
      {inner}
    </Pressable>
  );
}

/** Caixa de aviso em tom creme/dourado. */
export function Note({children, icon = "information-circle-outline", tone}: {children: React.ReactNode; icon?: any; tone?: "warning"}) {
  const warn = tone === "warning";
  return (
    <View style={[u.note, warn && {backgroundColor: C.warningBg, borderColor: C.line}]}>
      <Ionicons name={icon} size={20} color={warn ? C.warning : C.gold} style={{marginRight: 10, marginTop: 1}} />
      <Text style={u.noteText}>{children}</Text>
    </View>
  );
}

export function Section({children}: {children: React.ReactNode}) {
  return <Text style={u.section}>{children}</Text>;
}

export function Empty({children}: {children: React.ReactNode}) {
  return (
    <Card>
      <Text style={u.empty}>{children}</Text>
    </Card>
  );
}

export function Avatar({name, size = 44}: {name: string; size?: number}) {
  const initials = name
    .replace(/^(Dra?\.)\s*/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join("")
    .toUpperCase();
  return (
    <View style={[u.avatar, {width: size, height: size, borderRadius: size / 2}]}>
      <Text style={[u.avatarText, {fontSize: size * 0.38}]}>{initials}</Text>
    </View>
  );
}

export const u = StyleSheet.create({
  page: {flex: 1, backgroundColor: C.paper},
  pad: {padding: 18, paddingTop: 6, paddingBottom: 40},
  loading: {flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper},
  lead: {fontSize: 15, lineHeight: 21, color: C.muted, marginBottom: 16},
  card: {},
  cardHead: {backgroundColor: C.cardHead, paddingHorizontal: 16, paddingVertical: 10},
  cardHeadText: {fontFamily: SERIF, fontSize: 16, color: C.ink, fontWeight: "700"},
  cardBody: {padding: 16},
  pressed: {opacity: 0.85},
  row: {flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 12},
  rowLine: {borderBottomWidth: 1, borderBottomColor: C.line},
  rowIcon: {width: 36, height: 36, borderRadius: 10, backgroundColor: C.cardHead, alignItems: "center", justifyContent: "center"},
  rowLabel: {fontSize: 13, color: C.muted},
  rowValue: {fontSize: 16, color: C.ink, fontWeight: "600", marginTop: 2},
  pill: {flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill},
  pillText: {fontSize: 12, fontWeight: "700"},
  btn: {flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.brown, borderRadius: R.md, paddingVertical: 14, paddingHorizontal: 16, marginTop: 12},
  btnText: {color: C.onGold, fontWeight: "700", fontSize: 15},
  btnOutline: {flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.brown, borderRadius: R.md, paddingVertical: 13, paddingHorizontal: 16, marginTop: 12, backgroundColor: "transparent"},
  btnOutlineText: {color: C.brown, fontWeight: "700", fontSize: 15},
  btnDark: {flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.night, borderRadius: R.md, paddingVertical: 15, paddingHorizontal: 16, marginTop: 12},
  btnDarkText: {color: C.gold2, fontWeight: "700", fontSize: 15},
  note: {flexDirection: "row", backgroundColor: C.cardHead, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 14, marginTop: 4, marginBottom: 14},
  noteText: {flex: 1, fontSize: 13, lineHeight: 19, color: C.ink},
  section: {fontFamily: SERIF, fontSize: 20, color: C.ink, marginTop: 10, marginBottom: 12},
  empty: {color: C.muted, fontSize: 14, lineHeight: 20},
  avatar: {backgroundColor: C.brown, alignItems: "center", justifyContent: "center"},
  avatarText: {color: C.onGold, fontFamily: SERIF, fontWeight: "700"},
  title: {fontFamily: SERIF, fontSize: 17, fontWeight: "700", color: C.ink},
  body: {fontSize: 14, lineHeight: 21, color: C.ink},
  small: {fontSize: 12, color: C.muted, marginTop: 3},
});

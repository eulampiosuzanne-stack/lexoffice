import React, {createContext, useCallback, useContext, useEffect, useState} from "react";
import {Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {supabase} from "./supabase";
import {C, R, SERIF} from "./theme";
import {uploadRequestedDocument, uploadClientFile} from "./mobile";
import {Avatar, Backdrop, Button, Card, Empty, InfoRow, Loading, Note, Pill, Screen, Section, Tone, u} from "./ui";

/* ---------------------------------------------------------------- utilidades */

const money = (v: any) => Number(v || 0).toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
const date = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "");
const firstName = (x: any) => (x?.client_name ? String(x.client_name).trim().split(" ")[0] : "");
const norm = (v: any) => String(v || "").toLowerCase();

const OFFICE_PHONES = [
  {label: "(31) 99690-5968", wa: "5531996905968"},
  {label: "(31) 99298-4141", wa: "5531992984141"},
];
const OFFICE_EMAILS = ["glaudicaadv15@gmail.com", "eulampiosuzanne@gmail.com"];
const HOURS = "Segunda a sexta-feira, das 8h às 18h.";

function open(url: string) {
  Linking.openURL(url).catch(() => Alert.alert("Não foi possível abrir", "Tente novamente pelo seu celular."));
}

/** Dados do cliente logado (nome, id, restrição). */
function useCtx() {
  const [x, setX] = useState<any>();
  useEffect(() => {
    supabase.rpc("client_app_context").then(({data}) => setX(data?.[0] || null));
  }, []);
  return x;
}

/* ------------------------------------------------ contador de recados novos */

const UnreadCtx = createContext<{count: number; refresh: () => void}>({count: 0, refresh: () => {}});
export const useUnread = () => useContext(UnreadCtx);

export function UnreadProvider({children}: {children: React.ReactNode}) {
  const x = useCtx();
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    if (!x?.client_id) return;
    supabase
      .from("client_office_messages")
      .select("id", {count: "exact", head: true})
      .eq("client_id", x.client_id)
      .is("archived_at", null)
      .eq("requires_ack", true)
      .is("acknowledged_at", null)
      .then(({count: c}) => setCount(c || 0));
  }, [x?.client_id]);
  useEffect(refresh, [refresh]);
  return <UnreadCtx.Provider value={{count, refresh}}>{children}</UnreadCtx.Provider>;
}

/* -------------------------------------------------------------------- início */

const TILES: [string, string, any][] = [
  ["Meu Processo", "Processo", "document-text-outline"],
  ["Recados do Escritório", "Recados", "mail-outline"],
  ["Documentos", "Documentos", "folder-open-outline"],
  ["Próximos Passos", "Passos", "git-network-outline"],
  ["Financeiro", "Financeiro", "wallet-outline"],
  ["Meu Atendimento", "Atendimento", "people-outline"],
];

export function Home({navigation}: any) {
  const x = useCtx();
  const {count} = useUnread();
  const insets = useSafeAreaInsets();
  const name = firstName(x);
  return (
    <Backdrop>
    <ScrollView style={{flex: 1}} contentContainerStyle={[h.pad, {paddingTop: insets.top + 18}]}>
      <View style={h.brand}>
        <Image source={require("../assets/sf-monogram.png")} style={h.logo} resizeMode="contain" accessibilityLabel="Monograma SF" />
        <Text style={h.brandName}>SUZANNE FIGUEIREDO</Text>
        <View style={h.brandRule} />
        <Text style={h.brandSub}>ADVOCACIA E SOLUÇÕES JURÍDICAS</Text>
      </View>

      <Text style={h.hello}>{name ? `Olá, ${name}!` : "Olá!"}</Text>
      <Text style={h.welcome}>Boas-vindas ao seu espaço exclusivo.</Text>

      {x?.restricted ? (
        <View style={h.restricted}>
          <Ionicons name="alert-circle-outline" size={20} color={C.danger} style={{marginRight: 8}} />
          <Text style={h.restrictedText}>Seu atendimento está com restrição. Fale com o Financeiro para regularizar.</Text>
        </View>
      ) : null}

      <View style={h.grid}>
        {TILES.map(([label, route, icon]) => (
          <Pressable key={route} style={({pressed}) => [h.tile, pressed && {opacity: 0.85}]} onPress={() => navigation.navigate(route)}>
            <Ionicons name={icon} size={34} color={C.gold2} />
            <Text style={h.tileText}>{label}</Text>
            {route === "Recados" && count > 0 ? (
              <View style={h.badge}>
                <Text style={h.badgeText}>{count > 9 ? "9+" : count}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <Pressable style={({pressed}) => [h.office, pressed && {opacity: 0.85}]} onPress={() => navigation.navigate("Comunicação")}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={C.gold2} style={{marginRight: 10}} />
        <Text style={h.officeText}>Falar com o Escritório</Text>
      </Pressable>
    </ScrollView>
    </Backdrop>
  );
}

const h = StyleSheet.create({
  page: {flex: 1, backgroundColor: C.night},
  pad: {paddingHorizontal: 18, paddingBottom: 32},
  brand: {alignItems: "center", marginBottom: 26},
  logo: {width: 74, height: 100, marginBottom: 6},
  monogram: {fontFamily: SERIF, fontSize: 64, lineHeight: 70, color: C.gold2, fontWeight: "700", fontStyle: "italic"},
  brandName: {fontFamily: SERIF, fontSize: 20, letterSpacing: 3, color: C.gold2, marginTop: 2},
  brandRule: {width: 170, height: 1, backgroundColor: C.gold, marginVertical: 6, opacity: 0.7},
  brandSub: {fontSize: 9, letterSpacing: 2, color: C.gold},
  hello: {fontFamily: SERIF, fontSize: 34, lineHeight: 40, color: C.onDark},
  welcome: {fontFamily: SERIF, fontStyle: "italic", fontSize: 24, lineHeight: 30, color: C.gold2, marginTop: 4, marginBottom: 22},
  restricted: {flexDirection: "row", alignItems: "center", backgroundColor: C.dangerBg, borderRadius: R.md, padding: 12, marginBottom: 14},
  restrictedText: {flex: 1, color: C.danger, fontSize: 13, lineHeight: 18, fontWeight: "600"},
  grid: {flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12},
  tile: {width: "48.3%", minHeight: 118, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, borderColor: C.gold, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: {width: 0, height: 4}, elevation: 4, alignItems: "center", justifyContent: "center", padding: 12, gap: 10},
  tileText: {fontFamily: SERIF, fontSize: 15, lineHeight: 19, color: C.ink, textAlign: "center"},
  badge: {position: "absolute", top: 10, right: 10, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 5},
  badgeText: {color: "#fff", fontSize: 12, fontWeight: "800"},
  office: {flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.gold2, backgroundColor: "rgba(233,201,139,.06)", borderRadius: R.md, paddingVertical: 16, marginTop: 18},
  officeText: {color: C.gold2, fontSize: 16, fontWeight: "700"},
});

/* ------------------------------------------------------------- meu processo */

function processTone(status: any): {label: string; tone: Tone} {
  const s = norm(status);
  if (/arquiv|encerr|finaliz|baix/.test(s)) return {label: "Encerrado", tone: "neutral"};
  if (/suspens|sobrest/.test(s)) return {label: "Suspenso", tone: "warning"};
  if (/aguard|protocol/.test(s) && !/andamento/.test(s)) return {label: "Aguardando protocolo", tone: "info"};
  return {label: "Em andamento", tone: "success"};
}

export function Process({navigation}: any) {
  const [ps, setPs] = useState<any[] | undefined>();
  const [sel, setSel] = useState<any>();
  const [picking, setPicking] = useState(false);
  const [mv, setMv] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [line, setLine] = useState<any[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    supabase.rpc("client_app_processes").then(({data}) => {
      setPs(data || []);
      setSel(data?.[0]);
    });
  }, []);
  useEffect(() => {
    if (!sel) return;
    setAll(false);
    Promise.all([
      supabase.rpc("client_app_movements", {p_process_id: sel.id}),
      supabase.rpc("client_app_timeline", {p_process_id: sel.id}),
      supabase.rpc("client_app_case_line", {p_process_id: sel.id}),
    ]).then(([m, t, l]) => {
      setMv(m.data || []);
      setTimeline(t.data || []);
      setLine(l.data || []);
    });
  }, [sel]);

  if (ps === undefined) return <Loading />;
  if (!ps.length)
    return (
      <Screen lead="Acompanhe o andamento do seu caso com informações atualizadas e linguagem simples.">
        <Empty>Seu processo ainda não foi cadastrado. Assim que houver protocolo, ele aparece aqui.</Empty>
      </Screen>
    );

  const st = processTone(sel?.status);
  const current = timeline.find(r => r.status === "current");
  const step = line.find(r => r.status === "current");
  const [last, ...older] = mv;
  const shown = all ? older : older.slice(0, 3);

  return (
    <Screen lead="Acompanhe o andamento do seu caso com informações atualizadas e linguagem simples.">
      <Card>
        <Text style={u.small}>Selecione o processo</Text>
        <Pressable style={p.select} onPress={() => ps.length > 1 && setPicking(!picking)}>
          <View style={{flex: 1}}>
            <Text style={p.cnj}>{sel?.cnj_number || "Aguardando protocolo"}</Text>
            <Text style={u.small}>{sel?.area || sel?.subject || ""}</Text>
          </View>
          {ps.length > 1 ? <Ionicons name={picking ? "chevron-up" : "chevron-down"} size={20} color={C.brown} /> : null}
        </Pressable>
        {picking
          ? ps
              .filter(o => o.id !== sel?.id)
              .map(o => (
                <Pressable key={o.id} style={p.option} onPress={() => (setSel(o), setPicking(false))}>
                  <Text style={u.body}>{o.cnj_number || "Aguardando protocolo"}</Text>
                  <Text style={u.small}>{o.area || o.subject || ""}</Text>
                </Pressable>
              ))
          : null}
      </Card>

      <View style={{flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap"}}>
        <Pill label={st.label} tone={st.tone} icon="checkmark-circle" />
        {step ? <Pill label={`Etapa ${step.step_order} de ${line.length}: ${step.label}`} tone="info" /> : current ? <Pill label={`Fase: ${current.phase_label}`} tone="neutral" /> : null}
      </View>

      {line.length ? (
        <Card>
          <Text style={u.title}>Linha do processo</Text>
          <Text style={u.small}>Onde o seu processo está agora.</Text>
          <CaseLine rows={line} compact />
        </Card>
      ) : null}

      {last ? (
        <View style={p.tl}>
          <View style={p.rail}>
            <View style={[p.dot, {backgroundColor: C.success}]}>
              <Ionicons name="checkmark" size={14} color="#fff" />
            </View>
            {older.length ? <View style={p.line} /> : null}
          </View>
          <Card style={{flex: 1}}>
            <View style={p.datePill}><Text style={p.datePillText}>{date(last.movement_date)}</Text></View>
            <Text style={[u.title, {marginTop: 4}]}>{last.title || "Atualização processual"}</Text>
            {last.client_message || last.description ? (
              <View style={p.simple}>
                <Text style={p.simpleTitle}>Em linguagem simples</Text>
                <Text style={u.body}>{last.client_message || last.description}</Text>
              </View>
            ) : null}
            {last.document_url ? <Button label="Ver documento" icon="document-outline" onPress={() => open(last.document_url)} /> : null}
          </Card>
        </View>
      ) : (
        <Empty>Nenhuma movimentação liberada para exibição ainda. Avisaremos quando houver novidade.</Empty>
      )}

      {shown.map((m, i) => (
        <View style={p.tl} key={m.id}>
          <View style={p.rail}>
            <View style={[p.dot, {backgroundColor: C.info}]} />
            {i < shown.length - 1 ? <View style={p.line} /> : null}
          </View>
          <View style={p.item}>
            <View style={p.datePill}><Text style={p.datePillText}>{date(m.movement_date)}</Text></View>
            <Text style={[u.title,{marginTop:8}]}>{m.title || "Atualização processual"}</Text>
            {m.client_message || m.description ? <View style={p.explain}><Text style={p.explainLabel}>O que aconteceu</Text><Text style={u.body}>{m.client_message || m.description}</Text></View> : null}
            {m.document_url ? <Pressable style={p.documentLink} onPress={()=>open(m.document_url)}><Ionicons name="document-text-outline" size={16} color={C.brown}/><Text style={p.documentLinkText}>Ver movimentação original</Text></Pressable> : null}
          </View>
        </View>
      ))}

      {older.length > 3 ? <Button variant="outline" label={all ? "Mostrar menos" : "Ver histórico completo"} onPress={() => setAll(!all)} /> : null}
      <Button variant="outline" label="Ver todas as etapas" icon="git-network-outline" onPress={() => navigation.navigate("Passos", {processId: sel?.id, cnj: sel?.cnj_number})} />
    </Screen>
  );
}

const p = StyleSheet.create({
  select: {flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: R.sm, padding: 12, marginTop: 8, backgroundColor: C.night2},
  cnj: {fontSize: 16, fontWeight: "700", color: C.ink},
  option: {paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: C.line},
  tl: {flexDirection: "row", gap: 12},
  rail: {width: 26, alignItems: "center"},
  dot: {width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 20, borderWidth: 3, borderColor: C.gold2},
  line: {flex: 1, width: 2, backgroundColor: C.gold, marginTop: 2, opacity: .55},
  item: {flex: 1, paddingTop: 14, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: C.line},
  datePill: {alignSelf:"flex-start", backgroundColor:C.cardHead, borderRadius:999, paddingHorizontal:10, paddingVertical:4, borderWidth:1, borderColor:C.gold},
  datePillText: {fontSize:12, fontWeight:"800", color:C.brown},
  explain: {backgroundColor:C.cardHead, borderRadius:R.sm, padding:11, marginTop:8},
  explainLabel: {fontSize:11, fontWeight:"800", textTransform:"uppercase", letterSpacing:.5, color:C.brown, marginBottom:4},
  documentLink: {flexDirection:"row", alignItems:"center", gap:6, alignSelf:"flex-start", marginTop:9, paddingVertical:7, paddingHorizontal:10, borderWidth:1, borderColor:C.line, borderRadius:R.sm},
  documentLinkText: {fontSize:12, fontWeight:"700", color:C.brown},
  simple: {backgroundColor: C.cardHead, borderRadius: R.sm, padding: 12, marginTop: 12},
  simpleTitle: {fontFamily: SERIF, fontWeight: "700", color: C.brown, marginBottom: 4},
});

/* ---------------------------------------------------------------- recados */

function msgCategory(c: any): {label: string; tone: Tone; icon: any; bg: string} {
  const s = norm(c);
  if (/import|urgen|alert|audi/.test(s)) return {label: "IMPORTANTE", tone: "danger", icon: "alert-circle", bg: "rgba(179,38,30,.14)"};
  if (/doc/.test(s)) return {label: "DOCUMENTOS", tone: "info", icon: "document-text", bg: "rgba(45,99,184,.14)"};
  if (/finan|pag|parcel|cobr/.test(s)) return {label: "FINANCEIRO", tone: "warning", icon: "wallet", bg: "rgba(214,170,85,.12)"};
  return {label: c ? String(c).toUpperCase() : "INFORMATIVO", tone: "info", icon: "information-circle", bg: "rgba(214,170,85,.08)"};
}

export function Messages({navigation}: any) {
  const x = useCtx();
  const {refresh} = useUnread();
  const [rows, setRows] = useState<any[] | undefined>();
  const [filter, setFilter] = useState<"all" | "unread" | "important">("all");
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!x?.client_id) return;
    supabase
      .from("client_office_messages")
      .select("*")
      .eq("client_id", x.client_id)
      .is("archived_at", null)
      .order("sent_at", {ascending: false})
      .then(({data}) => setRows(data || []));
  }, [x?.client_id]);

  useEffect(() => {
    if (x === null) setRows([]);
    if (!x?.client_id) return;
    load();
    const ch = supabase
      .channel("client-messages-" + x.client_id)
      .on("postgres_changes", {event: "*", schema: "public", table: "client_office_messages", filter: "client_id=eq." + x.client_id}, () => {
        load();
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [x?.client_id]);

  async function ack(r: any) {
    await supabase.rpc("client_app_ack_message", {p_message_id: r.id});
    load();
    refresh();
  }

  if (rows === undefined) return <Loading />;
  const unread = (r: any) => (r.requires_ack && !r.acknowledged_at) || r.read_at === null;
  const important = (r: any) => msgCategory(r.category).label === "IMPORTANTE";
  const nUnread = rows.filter(unread).length;
  const list = rows.filter(r => (filter === "unread" ? unread(r) : filter === "important" ? important(r) : true));

  return (
    <Screen lead="Informações importantes sobre o seu atendimento.">
      <View style={rc.filters}>
        {([
          ["all", "Todos"],
          ["unread", nUnread ? `Não lidos (${nUnread})` : "Não lidos"],
          ["important", "Importantes"],
        ] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={[rc.chip, filter === k && rc.chipOn]}>
            <Text style={[rc.chipText, filter === k && rc.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {list.length ? (
        list.map(r => {
          const cat = msgCategory(r.category);
          const pending = r.requires_ack && !r.acknowledged_at;
          const long = String(r.body || "").length > 160;
          const expanded = open === r.id;
          return (
            <View key={r.id} style={[rc.card, {backgroundColor: cat.bg, borderColor: pending ? C[cat.tone] : C.line}]}>
              <View style={{flexDirection: "row", alignItems: "center", gap: 8}}>
                <Ionicons name={cat.icon} size={18} color={C[cat.tone]} />
                <Pill label={cat.label} tone={cat.tone} />
                <Text style={[u.small, {marginLeft: "auto", marginTop: 0}]}>{date(r.sent_at)}</Text>
              </View>
              <Text style={[u.title, {marginTop: 10}]}>{r.title}</Text>
              <Text style={[u.body, {marginTop: 6}]} numberOfLines={long && !expanded ? 3 : undefined}>
                {r.body}
              </Text>
              <View style={rc.actions}>
                {long ? (
                  <Pressable style={rc.btn} onPress={() => setOpen(expanded ? null : r.id)}>
                    <Text style={rc.btnText}>{expanded ? "Ver menos" : "Ver detalhes"}</Text>
                  </Pressable>
                ) : null}
                {cat.label === "DOCUMENTOS" ? (
                  <Pressable style={rc.btn} onPress={() => navigation.navigate("Início", {screen: "Documentos"})}>
                    <Text style={rc.btnText}>Enviar documento</Text>
                  </Pressable>
                ) : null}
                {pending ? (
                  <Pressable style={[rc.btn, rc.btnOutline]} onPress={() => ack(r)}>
                    <Text style={[rc.btnText, {color: C.brown}]}>Li e estou ciente</Text>
                  </Pressable>
                ) : null}
              </View>
              {r.acknowledged_at ? (
                <View style={{marginTop: 10}}>
                  <Pill label="Ciência confirmada" tone="success" icon="checkmark" />
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <Empty>
          {filter === "all"
            ? "Nenhum recado por enquanto. Quando o escritório enviar uma informação, ela aparece aqui."
            : "Nenhum recado neste filtro."}
        </Empty>
      )}
    </Screen>
  );
}

const rc = StyleSheet.create({
  filters: {flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap"},
  chip: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.card},
  chipOn: {backgroundColor: C.night, borderColor: C.night},
  chipText: {color: C.brown, fontWeight: "600", fontSize: 13},
  chipTextOn: {color: C.gold2},
  card: {borderWidth: 1, borderRadius: R.md, padding: 16, marginBottom: 14},
  actions: {flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4},
  btn: {backgroundColor: C.brown, borderRadius: R.sm, paddingVertical: 10, paddingHorizontal: 14, marginTop: 8},
  btnOutline: {backgroundColor: "transparent", borderWidth: 1.5, borderColor: C.brown},
  btnText: {color: C.onGold, fontWeight: "700", fontSize: 13},
});

/* --------------------------------------------------------------- documentos */

function docStatus(status: any): {label: string; tone: Tone; done: boolean} {
  const s = norm(status);
  if (/receiv|approv|complet|accept|done|recebid|aprovad|conclu/.test(s)) return {label: "Recebido", tone: "success", done: true};
  if (/review|analis|análise|submit|sent|enviad/.test(s)) return {label: "Em análise", tone: "info", done: false};
  if (/reject|recus|refaz|invalid/.test(s)) return {label: "Reenviar", tone: "danger", done: false};
  return {label: "Pendente", tone: "warning", done: false};
}

function docIcon(title: any): any {
  const t = norm(title);
  if (/identid|rg|cpf|cnh/.test(t)) return "card-outline";
  if (/endere|resid/.test(t)) return "home-outline";
  if (/certid|casament|nascim/.test(t)) return "ribbon-outline";
  if (/renda|salár|holerite|imposto/.test(t)) return "cash-outline";
  if (/conversa|print|prova|foto|áudio/.test(t)) return "chatbubbles-outline";
  return "document-text-outline";
}

export function Documents() {
  const x = useCtx();
  const [tab, setTab] = useState<"list" | "send">("list");
  const [rows, setRows] = useState<any[] | undefined>();
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!x?.client_id) return;
    supabase
      .from("client_document_requests")
      .select("*")
      .eq("client_id", x.client_id)
      .order("created_at")
      .then(({data}) => setRows(data || []));
  }, [x?.client_id]);
  useEffect(() => {
    if (x === null) setRows([]);
    load();
  }, [load, x]);

  async function sendRequested(r: any) {
    setBusy(r.id);
    try {
      const done = await uploadRequestedDocument(r.id, x.client_id);
      if (done) Alert.alert("Documento enviado", "Recebemos seu arquivo. A equipe vai conferir.");
      load();
    } catch (e: any) {
      Alert.alert("Não foi possível enviar", e?.message || "Tente novamente.");
    }
    setBusy(null);
  }
  async function sendFree(kind: "document" | "payment_receipt") {
    if (!x) return;
    setBusy(kind);
    try {
      const done = await uploadClientFile(x.client_id, kind, kind === "payment_receipt" ? "Comprovante de pagamento" : "Arquivo enviado pelo cliente", "");
      if (done) Alert.alert("Arquivo enviado", "O escritório recebeu seu arquivo.");
    } catch (e: any) {
      Alert.alert("Não foi possível enviar", e?.message || "Tente novamente.");
    }
    setBusy(null);
  }

  const list = rows || [];
  const done = list.filter(r => docStatus(r.status).done).length;
  const pct = list.length ? done / list.length : 0;

  return (
    <Screen lead="Envie e acesse seus documentos de forma segura.">
      <View style={d.tabs}>
        {([
          ["list", "Meus documentos"],
          ["send", "Enviar documento"],
        ] as const).map(([k, label]) => (
          <Pressable key={k} style={[d.tab, tab === k && d.tabOn]} onPress={() => setTab(k)}>
            <Text style={[d.tabText, tab === k && d.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "list" ? (
        rows === undefined ? (
          <Loading />
        ) : list.length ? (
          <Card title="Checklist do seu caso">
            <Text style={u.small}>
              {done} de {list.length} concluídos
            </Text>
            <View style={d.bar}>
              <View style={[d.barFill, {width: `${Math.round(pct * 100)}%`}]} />
            </View>
            {list.map((r, i) => {
              const st = docStatus(r.status);
              const canSend = !st.done && st.label !== "Em análise";
              return (
                <Pressable key={r.id} disabled={!canSend || !!busy} onPress={() => sendRequested(r)} style={[d.item, i < list.length - 1 && u.rowLine]}>
                  <View style={u.rowIcon}>
                    <Ionicons name={docIcon(r.title)} size={20} color={C.brown} />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={d.docTitle}>{r.title}</Text>
                    {r.description ? <Text style={u.small}>{r.description}</Text> : null}
                    <View style={{marginTop: 6}}>
                      <Pill label={busy === r.id ? "Enviando..." : st.label} tone={st.tone} />
                    </View>
                  </View>
                  {canSend ? <Ionicons name="cloud-upload-outline" size={20} color={C.brown} /> : null}
                </Pressable>
              );
            })}
          </Card>
        ) : (
          <Empty>Nenhum documento solicitado no momento.</Empty>
        )
      ) : (
        <Card title="Enviar ao escritório">
          <Text style={u.body}>Escolha um arquivo em PDF ou foto (até 15 MB). Ele chega direto para a equipe.</Text>
          <Button label={busy === "document" ? "Enviando..." : "Escolher arquivo"} icon="attach-outline" disabled={!!busy} onPress={() => sendFree("document")} />
          <Button variant="outline" label={busy === "payment_receipt" ? "Enviando..." : "Enviar comprovante de pagamento"} icon="receipt-outline" disabled={!!busy} onPress={() => sendFree("payment_receipt")} />
        </Card>
      )}

      <Note icon="alert-circle-outline" tone="warning">
        Envie apenas os documentos solicitados. Se algum documento ainda não estiver disponível, avise o escritório para orientarmos você.
      </Note>
    </Screen>
  );
}

const d = StyleSheet.create({
  tabs: {flexDirection: "row", backgroundColor: C.cardHead, borderRadius: R.md, padding: 4, marginBottom: 16},
  tab: {flex: 1, paddingVertical: 10, borderRadius: R.sm, alignItems: "center"},
  tabOn: {backgroundColor: C.night},
  tabText: {color: C.brown, fontWeight: "600", fontSize: 14},
  tabTextOn: {color: C.gold2},
  bar: {height: 8, borderRadius: 4, backgroundColor: C.neutralBg, marginTop: 8, marginBottom: 6, overflow: "hidden"},
  barFill: {height: 8, borderRadius: 4, backgroundColor: C.success},
  item: {flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12},
  docTitle: {fontSize: 15, fontWeight: "600", color: C.ink},
});

/* ---------------------------------------------------------- próximos passos */

const BASE_STEPS: [string, string][] = [
  ["Contratação", "Contrato assinado e entrada confirmada."],
  ["Documentos", "Recebimento e conferência."],
  ["Análise do caso", "Estudo jurídico da sua situação."],
  ["Elaboração da medida", "Petição e requerimentos."],
  ["Protocolo", "Envio ao sistema do Tribunal."],
  ["Distribuição", "Processo distribuído para a vara competente."],
  ["Acompanhamento", "Movimentações e prazos."],
  ["Audiências / Decisões", "Você será informado sobre audiências e decisões."],
  ["Encerramento", "Cumprimento de etapas e orientações finais."],
];
const STEP_TEXT = Object.fromEntries(BASE_STEPS.map(([a, b]) => [norm(a), b]));

/** Linha processual (10 etapas) — usada no Meu Processo (resumida) e em Próximos Passos (completa). */
function CaseLine({rows, compact}: {rows: any[]; compact?: boolean}) {
  const curIdx = rows.findIndex(r => r.status === "current");
  // resumida: mostra a etapa anterior, a atual e as duas próximas
  const list = compact && curIdx >= 0 ? rows.slice(Math.max(0, curIdx - 1), curIdx + 3) : rows;
  return (
    <View style={{marginTop: 12}}>
      {list.map((r: any, i: number) => {
        const done = r.status === "completed";
        const cur = r.status === "current";
        const skip = r.status === "skipped";
        const color = done ? C.success : cur ? C.info : C.neutralBg;
        return (
          <View key={r.step_key || r.id || r.label} style={s.step}>
            <View style={p.rail}>
              <View style={[s.num, {backgroundColor: color}]}>
                {done ? <Ionicons name="checkmark" size={16} color="#fff" /> : <Text style={[s.numText, !cur && {color: C.muted}]}>{r.step_order || r.position || i + 1}</Text>}
              </View>
              {i < list.length - 1 ? <View style={[p.line, done && {backgroundColor: C.success}]} /> : null}
            </View>
            <View style={{flex: 1, paddingBottom: 16, opacity: skip ? 0.55 : 1}}>
              <Text style={[u.title, {fontSize: 16}, cur && {color: C.info}]}>{r.label}</Text>
              <Text style={u.small}>{skip ? "Sem registro nesta etapa (nem todo processo passa por ela)." : r.description || STEP_TEXT[norm(r.label)] || ""}</Text>
              {cur ? (
                <View style={{marginTop: 6}}>
                  <Pill label="Etapa atual" tone="info" />
                  {r.summary ? (
                    <View style={p.simple}>
                      <Text style={p.simpleTitle}>Em linguagem simples</Text>
                      <Text style={u.body}>{r.summary}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function Steps({route}: any) {
  const x = useCtx();
  const [rows, setRows] = useState<any[] | undefined>();
  const [cnj, setCnj] = useState<string>(route?.params?.cnj || "");
  useEffect(() => {
    if (x === null) setRows([]);
    if (!x?.client_id) return;
    (async () => {
      let pid = route?.params?.processId;
      if (!pid) {
        const {data} = await supabase.rpc("client_app_processes");
        pid = data?.[0]?.id;
        setCnj(data?.[0]?.cnj_number || "");
      }
      if (!pid) return setRows([]);
      const {data} = await supabase.rpc("client_app_case_line", {p_process_id: pid});
      setRows(data || []);
    })();
  }, [x?.client_id, x, route?.params?.processId]);

  if (rows === undefined) return <Loading />;
  const list = rows.length ? rows : BASE_STEPS.map(([label], i) => ({id: label, label, step_order: i + 1, status: "pending"}));

  return (
    <Screen lead={cnj ? `Etapas do processo ${cnj}.` : "Entenda as principais etapas do seu caso."}>
      <Card>
        <CaseLine rows={list} />
      </Card>
      <Note>
        Cada processo possui dinâmica própria. Os prazos dos atos do Poder Judiciário não são controlados pelo escritório, mas acompanhamos cada movimentação e avisamos você.
      </Note>
    </Screen>
  );
}

const s = StyleSheet.create({
  step: {flexDirection: "row", gap: 12},
  num: {width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center"},
  numText: {color: "#fff", fontWeight: "800", fontSize: 13},
});

/* --------------------------------------------------------------- calendário */

export function Calendar() {
  const [rows, setRows] = useState<any[] | undefined>();
  useEffect(() => {
    supabase.rpc("client_app_calendar").then(({data}) => setRows(data || []));
  }, []);
  if (rows === undefined) return <Loading />;
  return (
    <Screen lead="Audiências e compromissos do seu caso.">
      {rows.length ? (
        rows.map(r => {
          const dt = new Date(r.starts_at);
          return (
            <Card key={r.id}>
              <View style={{flexDirection: "row", gap: 14, alignItems: "center"}}>
                <View style={cal.box}>
                  <Text style={cal.day}>{dt.getDate()}</Text>
                  <Text style={cal.month}>{dt.toLocaleDateString("pt-BR", {month: "short"}).replace(".", "")}</Text>
                </View>
                <View style={{flex: 1}}>
                  {r.event_type ? <Pill label={r.event_type} tone="neutral" /> : null}
                  <Text style={[u.title, {marginTop: 4}]}>{r.title}</Text>
                  <Text style={u.small}>{dt.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"})}</Text>
                  {r.location ? <Text style={u.small}>{r.location}</Text> : null}
                </View>
              </View>
              {r.description ? <Text style={[u.small, {marginTop: 10}]}>{r.description}</Text> : null}
              {r.meeting_url ? <Button label="Entrar na reunião" icon="videocam-outline" onPress={() => open(r.meeting_url)} /> : null}
            </Card>
          );
        })
      ) : (
        <Empty>Nenhum compromisso agendado no momento.</Empty>
      )}
    </Screen>
  );
}

const cal = StyleSheet.create({
  box: {width: 56, height: 60, borderRadius: R.md, backgroundColor: C.night, alignItems: "center", justifyContent: "center"},
  day: {fontFamily: SERIF, fontSize: 24, color: C.gold2, fontWeight: "700"},
  month: {fontSize: 12, color: C.gold2, textTransform: "capitalize"},
});

/* ------------------------------------ quando nos avisar + mensagem da Dra. */

const URGENT: [any, string][] = [
  ["heart-outline", "Risco à vida ou à integridade física."],
  ["warning-outline", "Ameaça grave relacionada ao caso."],
  ["document-text-outline", "Intimação ou documento com prazo que você acabou de receber."],
  ["flash-outline", "Fato novo urgente que possa exigir providência jurídica."],
];

function SuzanneCard({name}: {name: string}) {
  return (
    <Card>
      <Text style={[u.title, {fontSize: 22}]}>{name ? `Olá, ${name}!` : "Olá!"}</Text>
      <Text style={[u.body, {marginTop: 10}]}>É uma satisfação ter você conosco.</Text>
      <Text style={[u.body, {marginTop: 8}]}>
        A partir de agora, seu caso passa a ser acompanhado por uma estrutura jurídica organizada, com atenção, responsabilidade e clareza em cada etapa.
      </Text>
      <Text style={[u.body, {marginTop: 8}]}>Conte sempre com nosso apoio.</Text>
      <Text style={m.signature}>Suzanne Figueiredo</Text>
      <Text style={m.signName}>Dra. Suzanne Figueiredo</Text>
      <Text style={u.small}>Advogada</Text>
    </Card>
  );
}

export function Urgency({navigation}: any) {
  const x = useCtx();
  return (
    <Screen>
      <Card>
        <View style={{flexDirection: "row", alignItems: "center", gap: 12}}>
          <View style={[m.icon, {backgroundColor: C.dangerBg}]}>
            <Ionicons name="alert-circle-outline" size={26} color={C.danger} />
          </View>
          <Text style={[u.title, {flex: 1, fontSize: 20}]}>Quando nos avisar imediatamente?</Text>
        </View>
        <Text style={[u.body, {marginTop: 12}]}>Entre em contato com o escritório quanto antes nestas situações, que podem impactar diretamente o seu caso:</Text>
        {URGENT.map(([icon, text]) => (
          <View key={text} style={m.urgent}>
            <View style={[m.icon, {backgroundColor: C.dangerBg, width: 38, height: 38}]}>
              <Ionicons name={icon} size={20} color={C.danger} />
            </View>
            <Text style={[u.body, {flex: 1}]}>{text}</Text>
          </View>
        ))}
        <Note icon="calendar-outline">
          Para dúvidas, envio de documentos e assuntos cotidianos, utilize normalmente nossos canais de atendimento: {HOURS.toLowerCase()} A palavra “urgente”, sozinha, não caracteriza emergência.
        </Note>
        <Note icon="call-outline" tone="warning">
          Se houver risco imediato à sua vida, ligue antes para a polícia: 190.
        </Note>
        <Button variant="dark" label="Falar agora sobre uma situação urgente" icon="chatbubble-ellipses-outline" onPress={() => navigation.navigate("Comunicação", {urgent: true})} />
      </Card>

      <Section>Uma mensagem da Dra. Suzanne</Section>
      <SuzanneCard name={firstName(x)} />
    </Screen>
  );
}

export function SuzanneMessage() {
  const x = useCtx();
  return (
    <Screen>
      <SuzanneCard name={firstName(x)} />
    </Screen>
  );
}

const m = StyleSheet.create({
  icon: {width: 46, height: 46, borderRadius: R.md, alignItems: "center", justifyContent: "center"},
  urgent: {flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12},
  signature: {fontFamily: SERIF, fontStyle: "italic", fontSize: 28, color: C.gold, marginTop: 18},
  signName: {fontSize: 14, fontWeight: "700", color: C.ink, marginTop: 4},
});

/* ------------------------------------------------------------- financeiro */

function installmentStatus(r: any): {label: string; tone: Tone; icon: any} {
  const s = norm(r.installment_status);
  if (/paid|pago|quitad/.test(s)) return {label: "Paga", tone: "success", icon: "checkmark-circle"};
  const overdue = r.due_date && new Date(r.due_date + (String(r.due_date).length <= 10 ? "T23:59:59" : "")) < new Date();
  if (/overdue|late|atras|vencid/.test(s) || overdue) return {label: "Em atraso", tone: "danger", icon: "alert-circle"};
  return {label: "A vencer", tone: "warning", icon: "time-outline"};
}

export function Finance({navigation}: any) {
  const [rows, setRows] = useState<any[] | undefined>();
  const [all, setAll] = useState(false);
  useEffect(() => {
    supabase.rpc("client_app_finance").then(({data}) => setRows(data || []));
  }, []);
  if (rows === undefined) return <Loading />;

  const c = rows[0];
  const inst = rows.filter(r => r.installment_id);
  const upcoming = inst.filter(r => installmentStatus(r).label !== "Paga");
  const list = all ? inst : upcoming.slice(0, 3);
  const perInstallment = inst[0]?.original_amount;

  return (
    <Screen lead="Acompanhe seu plano de honorários de forma clara e organizada.">
      {c ? (
        <>
          <Card title="Resumo do seu plano">
            <InfoRow icon="briefcase-outline" label="Valor contratado" value={money(c.total_amount)} />
            {Number(c.down_payment_amount) > 0 ? <InfoRow icon="cash-outline" label="Entrada" value={money(c.down_payment_amount)} /> : null}
            {c.installments_count ? (
              <InfoRow icon="layers-outline" label="Parcelas" value={perInstallment ? `${c.installments_count} parcelas de ${money(perInstallment)}` : `${c.installments_count} parcelas`} />
            ) : null}
            <InfoRow icon="calendar-outline" label="Vencimento" value={c.due_day ? `Dia ${c.due_day} de cada mês` : "Conforme contrato"} />
            <InfoRow icon="card-outline" label="Forma de pagamento" value={c.payment_method || "PIX, boleto ou cartão de crédito"} last />
            {c.contract_url ? <Button label="Ver contrato" icon="document-outline" onPress={() => open(c.contract_url)} /> : null}
          </Card>

          <Section>{all ? "Todas as parcelas" : "Próximas parcelas"}</Section>
          {list.length ? (
            <Card>
              {list.map((r, i) => {
                const st = installmentStatus(r);
                return (
                  <InfoRow
                    key={r.installment_id}
                    icon={st.icon}
                    label={`Parcela ${r.installment_number}, vence em ${date(r.due_date)}`}
                    value={money(r.original_amount)}
                    right={<Pill label={st.label} tone={st.tone} />}
                    last={i === list.length - 1}
                  />
                );
              })}
            </Card>
          ) : (
            <Empty>Nenhuma parcela em aberto. Obrigado por manter tudo em dia.</Empty>
          )}
          {inst.length > list.length || all ? <Button variant="outline" label={all ? "Ver só as próximas" : "Ver todas as parcelas"} onPress={() => setAll(!all)} /> : null}
        </>
      ) : (
        <Empty>Nenhum contrato financeiro disponível.</Empty>
      )}

      <Card style={{marginTop: 18}}>
        <View style={{flexDirection: "row", alignItems: "center", gap: 12}}>
          <Avatar name="Gláucia Gomes" />
          <View style={{flex: 1}}>
            <Text style={u.title}>Dra. Gláucia Gomes</Text>
            <Text style={u.small}>Financeiro e Assessora Jurídica</Text>
          </View>
        </View>
        <Button label="Falar sobre o financeiro" icon="chatbubble-ellipses-outline" onPress={() => navigation.navigate("Comunicação", {subject: "Financeiro"})} />
      </Card>
    </Screen>
  );
}

/* ---------------------------------------------------------- meu atendimento */

const TEAM: [string, string, string][] = [
  ["Dra. Suzanne Figueiredo", "Responsável pela condução jurídica do seu caso", "Falar com a Dra. Suzanne"],
  ["Dra. Gláucia Gomes", "Financeiro e Assessora Jurídica", "Falar com a Dra. Gláucia"],
  ["Helena", "Atendimento e organização", "Falar com a equipe"],
];

export function Atendimento({navigation}: any) {
  return (
    <Screen lead="Seus contatos e informações principais, sempre à mão.">
      {TEAM.map(([name, role, cta]) => (
        <Card key={name}>
          <View style={{flexDirection: "row", alignItems: "center", gap: 12}}>
            <Avatar name={name} />
            <View style={{flex: 1}}>
              <Text style={u.title}>{name}</Text>
              <Text style={u.small}>{role}</Text>
            </View>
          </View>
          <Button variant="outline" label={cta} onPress={() => navigation.navigate("Comunicação", {subject: name})} />
        </Card>
      ))}

      <Section>Canais oficiais do escritório</Section>
      <Card>
        {OFFICE_PHONES.map(ph => (
          <Pressable key={ph.wa} onPress={() => open(`https://wa.me/${ph.wa}`)}>
            <InfoRow icon="logo-whatsapp" label="WhatsApp" value={ph.label} right={<Ionicons name="open-outline" size={18} color={C.muted} />} />
          </Pressable>
        ))}
        {OFFICE_EMAILS.map((e, i) => (
          <Pressable key={e} onPress={() => open(`mailto:${e}`)}>
            <InfoRow icon="mail-outline" label="E-mail" value={e} right={<Ionicons name="open-outline" size={18} color={C.muted} />} last={i === OFFICE_EMAILS.length - 1} />
          </Pressable>
        ))}
      </Card>

      <Card>
        <InfoRow icon="time-outline" label="Horário de atendimento" value={HOURS} last />
      </Card>

      <Card onPress={() => navigation.navigate("Urgência")}>
        <InfoRow icon="alert-circle-outline" label="Situações urgentes" value="Quando nos avisar imediatamente" right={<Ionicons name="chevron-forward" size={18} color={C.brown} />} last />
      </Card>
      <Card onPress={() => navigation.navigate("Mensagem")}>
        <InfoRow icon="heart-outline" label="Boas-vindas" value="Uma mensagem da Dra. Suzanne" right={<Ionicons name="chevron-forward" size={18} color={C.brown} />} last />
      </Card>
    </Screen>
  );
}

/* ------------------------------------------------------ falar com escritório */

export function Communication({route}: any) {
  const x = useCtx();
  const urgent = !!route?.params?.urgent;
  const subject = route?.params?.subject as string | undefined;
  const [msg, setMsg] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!msg.trim() || busy) return;
    setBusy(true);
    const title = urgent ? "URGENTE — mensagem do cliente" : subject ? `Mensagem do cliente — ${subject}` : "Mensagem do cliente";
    const {error} = await supabase.rpc("client_app_send_message", {p_kind: "message", p_subject: title, p_body: msg.trim()});
    setBusy(false);
    if (error) return setNotice("Não foi possível enviar. Verifique sua internet e tente novamente.");
    setMsg("");
    setNotice("Mensagem enviada. O escritório responderá pelos canais oficiais.");
  }
  async function attach(kind: "document" | "payment_receipt") {
    if (!x) return;
    try {
      const ok = await uploadClientFile(x.client_id, kind, kind === "payment_receipt" ? "Comprovante de pagamento" : "Arquivo enviado pelo cliente", "");
      if (ok) setNotice(kind === "payment_receipt" ? "Comprovante enviado ao escritório." : "Arquivo enviado ao escritório.");
    } catch (e: any) {
      setNotice(e?.message || "Não foi possível anexar o arquivo.");
    }
  }

  return (
    <Screen lead={urgent ? "Descreva o que aconteceu. Sua mensagem chega marcada como urgente." : "Envie uma mensagem, documento ou comprovante de pagamento."}>
      {urgent ? (
        <Note icon="call-outline" tone="warning">
          Se houver risco imediato à sua vida, ligue antes para a polícia: 190.
        </Note>
      ) : null}
      <Card title={subject ? `Sua mensagem — ${subject}` : "Sua mensagem"}>
        <TextInput multiline value={msg} onChangeText={setMsg} placeholder="Escreva sua mensagem" placeholderTextColor={C.muted} style={cm.input} />
        <Button label={busy ? "Enviando..." : "Enviar mensagem"} icon="send-outline" disabled={busy || !msg.trim()} onPress={send} />
      </Card>
      <Card title="Anexos">
        <Button variant="outline" label="Anexar arquivo" icon="attach-outline" onPress={() => attach("document")} />
        <Button variant="outline" label="Enviar comprovante de pagamento" icon="receipt-outline" onPress={() => attach("payment_receipt")} />
      </Card>
      {notice ? (
        <Note icon="checkmark-circle-outline">{notice}</Note>
      ) : null}
    </Screen>
  );
}

const cm = StyleSheet.create({
  input: {borderWidth: 1, borderColor: C.line, borderRadius: R.sm, padding: 12, minHeight: 130, textAlignVertical: "top", backgroundColor: C.night2, color: C.ink, fontSize: 15},
});

/* ------------------------------------------------------------------ perfil */

export function Profile() {
  const x = useCtx();
  const name = x?.client_name || "Cliente";
  return (
    <Screen>
      <Card>
        <View style={{alignItems: "center", paddingVertical: 8}}>
          <Avatar name={name} size={72} />
          <Text style={[u.title, {fontSize: 22, marginTop: 12, textAlign: "center"}]}>{name}</Text>
          <Text style={u.small}>Cliente do escritório Suzanne Figueiredo</Text>
        </View>
      </Card>
      <Card>
        <InfoRow icon="time-outline" label="Horário de atendimento" value={HOURS} />
        <InfoRow icon="lock-closed-outline" label="Privacidade" value="Seus dados ficam protegidos e só você acessa o seu caso." last />
      </Card>
      <Button variant="dark" label="Sair do aplicativo" icon="log-out-outline" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

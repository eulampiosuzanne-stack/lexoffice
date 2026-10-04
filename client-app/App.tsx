import React, {useEffect, useState} from "react";
import {ActivityIndicator, Alert, ImageBackground, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
import {NavigationContainer, createNavigationContainerRef, getFocusedRouteNameFromRoute} from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import {createBottomTabNavigator} from "@react-navigation/bottom-tabs";
import {createNativeStackNavigator} from "@react-navigation/native-stack";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {Ionicons} from "@expo/vector-icons";
import {StatusBar} from "expo-status-bar";
import {supabase, supabaseUrl, supabaseAnonKey} from "./src/supabase";
import {C, RAISE, SERIF} from "./src/theme";
import {GOLD} from "./src/ui";
import {registerPush} from "./src/mobile";
import {
  Home, Process, Messages, Documents, Steps, Calendar, Urgency, SuzanneMessage,
  Finance, Atendimento, Communication, Profile, UnreadProvider, useUnread,
} from "./src/screens";

const Tab = createBottomTabNavigator();
const navRef = createNavigationContainerRef<any>();
const Stack = createNativeStackNavigator();

/* ------------------------------------------------------------------ login */

function Login({onDemo}: any) {
  const [cpf, setCpf] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    if (busy) return;
    if (cpf.trim().toUpperCase() === "SUZANNE" && code.trim().toUpperCase() === "SF2026") return onDemo();
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11 || !code.trim())
      return Alert.alert("Confira seus dados", "Informe seu CPF e o código de acesso fornecido pelo escritório.");
    setBusy(true);
    let data: any = null;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/swift-service?action=client-app-auth`, {
        method: "POST",
        headers: {"Content-Type": "application/json", apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`},
        body: JSON.stringify({cpf: digits, access_code: code.trim()}),
      });
      data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("auth");
    } catch {
      setBusy(false);
      return Alert.alert("Não foi possível entrar", "CPF ou código de acesso inválido.");
    }
    if (!data?.email || !data?.password) {
      setBusy(false);
      return Alert.alert("Não foi possível entrar", "CPF ou código de acesso inválido.");
    }
    const r = await supabase.auth.signInWithPassword({email: data.email, password: data.password});
    setBusy(false);
    if (r.error) Alert.alert("Não foi possível entrar", "CPF ou código de acesso inválido.");
  }

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: C.night}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.login} keyboardShouldPersistTaps="handled">
        <Text style={s.monogram}>SF</Text>
        <Text style={s.brand}>SUZANNE FIGUEIREDO</Text>
        <View style={s.rule} />
        <Text style={s.sub}>ADVOCACIA E SOLUÇÕES JURÍDICAS</Text>

        <Text style={s.welcome}>Boas-vindas ao seu espaço exclusivo.</Text>
        <Text style={s.quote}>Mais que direito, soluções para a sua vida.</Text>

        <Text style={s.label}>CPF</Text>
        <TextInput style={s.input} keyboardType="numeric" placeholder="000.000.000-00" placeholderTextColor="#A8998A" value={cpf} onChangeText={setCpf} maxLength={14} />
        <Text style={s.label}>Código de acesso</Text>
        <TextInput style={s.input} autoCapitalize="characters" secureTextEntry placeholder="Fornecido pelo escritório" placeholderTextColor="#A8998A" value={code} onChangeText={setCode} />

        <Pressable style={({pressed}) => [{marginTop: 8, borderRadius: 12}, RAISE, (pressed || busy) && {opacity: 0.85}]} onPress={login}>
          <ImageBackground source={GOLD} resizeMode="stretch" style={[s.btn, {marginTop: 0, overflow: "hidden"}]} imageStyle={{borderRadius: 12}}>
          {busy ? <ActivityIndicator color={C.onGold} /> : <Text style={s.bt}>Entrar</Text>}
          </ImageBackground>
        </Pressable>
        <Text style={s.help}>Não tem o código? Peça ao escritório pelo WhatsApp (31) 99298-4141.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------------------------------------------------------------- navegação */

const header = (navigation: any) => ({
  headerStyle: {backgroundColor: C.paper},
  headerTintColor: C.brown,
  headerTitleStyle: {fontFamily: SERIF, fontSize: 22, color: C.ink},
  headerShadowVisible: false,
  headerBackTitle: "Voltar",
  headerRight: () => (
    <Pressable hitSlop={10} onPress={() => navigation.getParent()?.navigate("Notificações")}>
      <Ionicons name="notifications-outline" size={22} color={C.brown} />
    </Pressable>
  ),
});

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={({navigation}) => header(navigation)}>
      <Stack.Screen name="Painel" component={Home} options={{headerShown: false}} />
      <Stack.Screen name="Processo" component={Process} options={{title: "Meu Processo"}} />
      <Stack.Screen name="Recados" component={Messages} options={{title: "Recados"}} />
      <Stack.Screen name="Documentos" component={Documents} />
      <Stack.Screen name="Passos" component={Steps} options={{title: "Próximos Passos"}} />
      <Stack.Screen name="Calendário" component={Calendar} />
      <Stack.Screen name="Urgência" component={Urgency} options={{title: "Quando nos avisar"}} />
      <Stack.Screen name="Mensagem" component={SuzanneMessage} options={{title: "Dra. Suzanne"}} />
      <Stack.Screen name="Financeiro" component={Finance} />
      <Stack.Screen name="Atendimento" component={Atendimento} options={{title: "Meu Atendimento"}} />
      <Stack.Screen name="Comunicação" component={Communication} options={{title: "Falar com o Escritório"}} />
    </Stack.Navigator>
  );
}

const tabHeader = {
  headerShown: true,
  headerStyle: {backgroundColor: C.paper},
  headerTitleStyle: {fontFamily: SERIF, fontSize: 22, color: C.ink},
  headerShadowVisible: false,
};

function Tabs() {
  const {count} = useUnread();
  return (
    <Tab.Navigator
      screenOptions={({route}) => {
        // Barra escura só na tela inicial (como na referência); clara nas demais.
        const nested = getFocusedRouteNameFromRoute(route) ?? "Painel";
        const dark = route.name === "Início" && nested === "Painel";
        return {
          headerShown: false,
          tabBarActiveTintColor: dark ? C.gold2 : C.brown,
          tabBarInactiveTintColor: "#9C8F80",
          tabBarLabelStyle: {fontSize: 11, fontWeight: "600"},
          tabBarStyle: {
            backgroundColor: dark ? C.night : C.card,
            borderTopColor: "#2A2118",
          },
          tabBarIcon: ({color, size, focused}) => {
            const icons: any = {Início: "home", Notificações: "notifications", Perfil: "person"};
            return <Ionicons name={focused ? icons[route.name] : `${icons[route.name]}-outline`} size={size} color={color} />;
          },
        };
      }}
    >
      <Tab.Screen name="Início" component={HomeStack} />
      <Tab.Screen
        name="Notificações"
        component={Messages}
        options={{...tabHeader, title: "Recados", tabBarLabel: "Notificações", tabBarBadge: count > 0 ? count : undefined, tabBarBadgeStyle: {backgroundColor: C.danger}}}
      />
      <Tab.Screen name="Perfil" component={Profile} options={{...tabHeader, title: "Meu Perfil", tabBarLabel: "Perfil"}} />
    </Tab.Navigator>
  );
}

/* --------------------------------------------------------------------- app */

export default function App() {
  const [session, setSession] = useState<any>(undefined);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({data}) => setSession(data.session))
      .catch(() => setSession(null));
    const {data: {subscription}} = supabase.auth.onAuthStateChange((_e, x) => setSession(x));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session) registerPush().catch(() => {});
  }, [session?.user?.id]);

  // Tocar na notificação abre os Recados (também quando o app estava fechado).
  useEffect(() => {
    if (!session) return;
    const go = () => {
      if (navRef.isReady()) navRef.navigate("Notificações");
      else setTimeout(go, 300);
    };
    Notifications.getLastNotificationResponseAsync().then(r => r && go()).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(() => go());
    return () => sub.remove();
  }, [session?.user?.id]);

  if (session === undefined)
    return (
      <View style={s.loading}>
        <ActivityIndicator color={C.gold2} />
      </View>
    );

  return (
    <SafeAreaProvider>
      {!session && !demo ? (
        <>
          <StatusBar style="light" />
          <Login onDemo={() => setDemo(true)} />
        </>
      ) : (
        <UnreadProvider key={session?.user?.id || "demo"}>
          <NavigationContainer ref={navRef}>
            <StatusBar style="auto" />
            <Tabs />
          </NavigationContainer>
        </UnreadProvider>
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  loading: {flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.night},
  login: {flexGrow: 1, justifyContent: "center", padding: 28, paddingVertical: 48},
  monogram: {fontFamily: SERIF, fontSize: 72, lineHeight: 80, textAlign: "center", color: C.gold2, fontWeight: "700", fontStyle: "italic"},
  brand: {fontFamily: SERIF, fontSize: 21, textAlign: "center", letterSpacing: 3, color: C.gold2},
  rule: {alignSelf: "center", width: 180, height: 1, backgroundColor: C.gold, marginVertical: 6, opacity: 0.7},
  sub: {fontSize: 9, textAlign: "center", letterSpacing: 2, color: C.gold},
  welcome: {fontFamily: SERIF, fontSize: 26, lineHeight: 32, textAlign: "center", marginTop: 36, color: C.onDark},
  quote: {fontFamily: SERIF, fontStyle: "italic", textAlign: "center", color: C.gold2, marginTop: 8, marginBottom: 28, fontSize: 17},
  label: {color: C.gold2, fontSize: 13, fontWeight: "600", marginBottom: 6},
  input: {borderWidth: 1, borderColor: "#5B452D", borderRadius: 12, padding: 15, marginBottom: 14, backgroundColor: C.card, color: C.ink, fontSize: 16},
  btn: {backgroundColor: C.brown, borderRadius: 12, padding: 16, marginTop: 8, alignItems: "center", borderWidth: 1, borderColor: C.gold},
  bt: {color: C.onGold, fontWeight: "700", fontSize: 16},
  help: {color: "#A8998A", textAlign: "center", fontSize: 13, marginTop: 18, lineHeight: 19},
});

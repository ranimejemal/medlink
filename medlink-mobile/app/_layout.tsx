import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { assertPatient } from "@/lib/auth";
import { recovery } from "@/lib/recovery";
import { needsUnlock, unlock } from "@/lib/biometric";
import { colors, font } from "@/constants/theme";

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Réservé aux patients, quelle que soit la méthode de connexion (mot de passe, Google, code)
  useEffect(() => {
    if (!session) return;
    assertPatient(session.user.id).catch((e) => Alert.alert("Accès refusé", (e as Error).message));
  }, [session?.user.id]);

  // Verrouillage biométrique à l'ouverture de l'app
  useEffect(() => {
    if (!session) return;
    (async () => {
      if (await needsUnlock()) {
        if (!(await unlock())) await supabase.auth.signOut();
      }
    })();
  }, [session?.user.id]);

  useEffect(() => {
    if (session === undefined) return;
    const first = segments[0] as string | undefined;
    if (first === "auth-callback") return;
    const inAuth = first === "(auth)";
    if (!session && !inAuth) router.replace("/(auth)/login");
    if (session && inAuth && !recovery.active) router.replace("/(app)");
  }, [session, segments]);

  if (!fontsLoaded || session === undefined) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTintColor: colors.navy, headerTitleStyle: { fontFamily: font.bold }, headerBackTitle: "Retour" }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="book" options={{ title: "Prendre rendez-vous" }} />
        <Stack.Screen name="new-request" options={{ title: "Nouvelle demande" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="security" options={{ title: "Sécurité" }} />
      </Stack>
    </QueryClientProvider>
  );
}

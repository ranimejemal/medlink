import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Non connecté");
  return data.user.id;
}

// L'app mobile est réservée aux patients (vérifiée dans app/_layout.tsx).
// La vraie protection reste les politiques RLS côté Supabase.
export async function assertPatient(userId: string) {
  const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) { await supabase.auth.signOut(); throw error; }
  if (!roles?.some((r) => r.role === "patient")) {
    await supabase.auth.signOut();
    throw new Error("Cette application est réservée aux patients.");
  }
}

export async function signInPatient(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

// ---------- Inscription avec code ----------
export async function signUpPatient(fullName: string, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) throw error;
  // Supabase renvoie une liste d'identités vide si l'email existe déjà
  if (data.user && data.user.identities?.length === 0) {
    throw new Error("Un compte existe déjà avec cet email.");
  }
  return { needsCode: !data.session };
}

export async function verifySignupCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
  if (error) throw error;
}

export async function resendSignupCode(email: string) {
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw error;
}

// ---------- Mot de passe oublié avec code ----------
export async function sendPasswordResetCode(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}

export async function verifyRecoveryCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error) throw error;
}

export async function setNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

// ---------- Google ----------
// Lit les jetons (flux implicite) ou le code (flux PKCE) dans l'URL de retour
export async function createSessionFromUrl(url: string) {
  const hash = url.includes("#") ? url.split("#")[1] : "";
  const query = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const params = new URLSearchParams([query, hash].filter(Boolean).join("&"));

  const errorDescription = params.get("error_description") ?? params.get("error");
  if (errorDescription) throw new Error(errorDescription);

  const code = params.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.session;
  }

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle() {
  const redirectTo = Linking.createURL("auth-callback");
  if (__DEV__) console.log("[google] redirectTo =", redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return null; // fenêtre fermée par l'utilisateur

  const session = await createSessionFromUrl(result.url);
  if (!session) {
    throw new Error(
      "Aucun jeton reçu de Google. Vérifie que l'URL de redirection de l'app est bien dans Supabase, Authentication, URL Configuration."
    );
  }
  return session;
}

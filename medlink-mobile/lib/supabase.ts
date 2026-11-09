import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

// SecureStore limite chaque valeur à ~2 Ko : on découpe la session en morceaux.
const CHUNK_SIZE = 1800;

const secureStorage = {
  async getItem(key: string) {
    const count = await SecureStore.getItemAsync(`${key}.count`);
    if (!count) return SecureStore.getItemAsync(key);
    let value = "";
    for (let i = 0; i < Number(count); i++) {
      value += (await SecureStore.getItemAsync(`${key}.${i}`)) ?? "";
    }
    return value;
  },
  async setItem(key: string, value: string) {
    await this.removeItem(key);
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "g")) ?? [];
    await SecureStore.setItemAsync(`${key}.count`, String(chunks.length));
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
    }
  },
  async removeItem(key: string) {
    const count = await SecureStore.getItemAsync(`${key}.count`);
    for (let i = 0; i < Number(count ?? 0); i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.deleteItemAsync(`${key}.count`);
    await SecureStore.deleteItemAsync(key);
  },
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Variables manquantes : EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Vérifie ton .env puis relance avec : npx expo start -c"
  );
}

export const supabase = createClient(url, key, {
  auth: {
    // Mobile : SecureStore chiffré. Web / Node : stockage par défaut de Supabase.
    storage: Platform.OS === "web" ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

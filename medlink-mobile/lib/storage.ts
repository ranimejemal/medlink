import { Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { supabase } from "./supabase";

// URL signée de 60 s (jamais de bucket public pour des données médicales)
async function signedUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function openStoredFile(bucket: string, path: string) {
  await Linking.openURL(await signedUrl(bucket, path));
}

export async function downloadStoredFile(bucket: string, path: string) {
  const url = await signedUrl(bucket, path);
  const name = (path.split("/").pop() ?? "document").replace(/[^\w.\-]/g, "_");
  const res = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${name}`);
  if (res.status !== 200) throw new Error("Téléchargement impossible.");
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Le partage n'est pas disponible sur cet appareil.");
  await Sharing.shareAsync(res.uri);
}

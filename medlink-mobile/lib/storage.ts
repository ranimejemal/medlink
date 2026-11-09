import { Linking } from "react-native";
import { supabase } from "./supabase";

// URL signée de 60 s (jamais de bucket public pour des données médicales)
export async function openStoredFile(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error) throw error;
  await Linking.openURL(data.signedUrl);
}

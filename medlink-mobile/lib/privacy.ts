import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { supabase } from "./supabase";
import { getUserId } from "./auth";
import { clearReminders } from "./reminders";

const DOCUMENTS_BUCKET = "documents"; // adapte au nom de ton bucket

// [table, colonne propriétaire] : même liste que dans delete_my_account()
const OWNED: [string, string][] = [
  ["profiles", "id"],
  ["appointments", "patient_id"],
  ["appointment_requests", "patient_id"],
  ["documents", "patient_id"],
  ["lab_results", "patient_id"],
  ["notifications", "user_id"],
];

export async function exportMyData() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) throw new Error("Non connecté");

  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      metadata: user.user_metadata,
    },
  };
  for (const [table, col] of OWNED) {
    const res = await supabase.from(table).select("*").eq(col, user.id);
    out[table] = res.error ? { unavailable: res.error.message } : res.data;
  }

  const file = `${FileSystem.cacheDirectory}medlink-mes-donnees.json`;
  await FileSystem.writeAsStringAsync(file, JSON.stringify(out, null, 2));
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Le partage n'est pas disponible sur cet appareil.");
  await Sharing.shareAsync(file, {
    mimeType: "application/json",
    dialogTitle: "Exporter mes données",
  });
}

export async function deleteMyAccount() {
  const uid = await getUserId();

  // 1. Fichiers stockés (la base ne peut pas supprimer le stockage)
  const { data: docs } = await supabase.from("documents").select("file_path").eq("patient_id", uid);
  const paths = (docs ?? []).map((d: any) => d.file_path).filter(Boolean);
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
    if (error) throw error;
  }

  // 2. Données et compte
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw error;

  await clearReminders();
  await supabase.auth.signOut({ scope: "local" });
}

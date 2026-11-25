import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";
import { getUserId } from "./auth";

export const DOC_BUCKET = "patient-documents";
export const MAX_BYTES = 10 * 1024 * 1024;

export const CATEGORIES = [
  { id: "ordonnance", label: "Ordonnance" },
  { id: "analyse", label: "Analyse" },
  { id: "imagerie", label: "Imagerie" },
  { id: "compte_rendu", label: "Compte rendu" },
  { id: "autre", label: "Autre" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "Autre";

export type PatientDocument = {
  id: string;
  name: string;
  category: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  shared_with_doctor: boolean; // AJOUTÉ
};

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};
const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

export function guessMime(name: string, mime?: string | null): string | null {
  if (mime && ALLOWED.includes(mime)) return mime;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? null;
}

export const isImage = (mime: string) => mime.startsWith("image/");

export const fmtSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

function explain(error: any): Error {
  const msg: string = error?.message ?? "";
  if (error?.code === "PGRST205" || (/patient_documents/.test(msg) && /schema cache|does not exist/.test(msg))) {
    return new Error("Les documents ne sont pas encore configurés : exécute le SQL de création dans Supabase.");
  }
  if (/shared_with_doctor/.test(msg)) {
    return new Error("La colonne de partage n'existe pas : exécute le script SQL « shared_with_doctor » dans Supabase.");
  }
  if (/bucket not found/i.test(msg)) {
    return new Error("Le stockage des documents n'est pas configuré : exécute le SQL de création dans Supabase.");
  }
  if (error?.code === "42501" || /row-level security/i.test(msg)) {
    return new Error("Ajout refusé : limite de 50 documents atteinte, ou compte non patient.");
  }
  if (error?.code === "23514") return new Error("Fichier refusé (type ou taille non autorisés).");
  if (/mime type|too large|exceeded/i.test(msg)) return new Error("Fichier refusé : PDF, JPG, PNG ou WebP, 10 Mo maximum.");
  return new Error(msg || "Erreur inconnue");
}

export async function listDocuments(): Promise<PatientDocument[]> {
  // La sécurité (RLS) ne renvoie que les documents du patient connecté
  const { data, error } = await supabase
    .from("patient_documents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw explain(error);
  return (data ?? []) as PatientDocument[];
}

export async function uploadDocument(input: {
  uri: string;
  name: string;
  mime?: string | null;
  category: CategoryId;
  shared_with_doctor?: boolean; // AJOUTÉ
}) {
  const mime = guessMime(input.name, input.mime);
  if (!mime) throw new Error("Format non accepté. Utilisez un PDF, JPG, PNG ou WebP.");

  const uid = await getUserId();
  const body = await (await fetch(input.uri)).arrayBuffer();
  if (body.byteLength === 0) throw new Error("Le fichier est vide.");
  if (body.byteLength > MAX_BYTES) throw new Error("Fichier trop volumineux (10 Mo maximum).");

  // Le nom du fichier du patient n'entre pas dans le chemin de stockage (caractères spéciaux, données personnelles)
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${MIME_EXT[mime]}`;

  const up = await supabase.storage.from(DOC_BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (up.error) throw explain(up.error);

  const ins = await supabase.from("patient_documents").insert({
    name: input.name.slice(0, 200),
    category: input.category,
    storage_path: path,
    mime_type: mime,
    size_bytes: body.byteLength,
    shared_with_doctor: input.shared_with_doctor ?? false, // AJOUTÉ
  });
  if (ins.error) {
    await supabase.storage.from(DOC_BUCKET).remove([path]); // pas de fichier orphelin
    throw explain(ins.error);
  }
}

// AJOUTÉ : changer le partage d'un document déjà envoyé
export async function setShared(doc: PatientDocument, shared: boolean) {
  const { error } = await supabase
    .from("patient_documents")
    .update({ shared_with_doctor: shared })
    .eq("id", doc.id);
  if (error) throw explain(error);
}

export async function deleteDocument(doc: PatientDocument) {
  const rm = await supabase.storage.from(DOC_BUCKET).remove([doc.storage_path]);
  if (rm.error) throw explain(rm.error);
  const { error } = await supabase.from("patient_documents").delete().eq("id", doc.id);
  if (error) throw explain(error);
}

// URL temporaire : le fichier n'est jamais public
export async function signedUrl(path: string, seconds = 120) {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, seconds);
  if (error) throw explain(error);
  return data.signedUrl;
}

// Télécharge dans le cache puis ouvre la feuille de partage (enregistrer, ouvrir dans une autre app)
export async function downloadAndShare(doc: PatientDocument) {
  const url = await signedUrl(doc.storage_path, 120);
  const ext = MIME_EXT[doc.mime_type] ?? "bin";
  const res = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${doc.id}.${ext}`);
  if (res.status !== 200) throw new Error("Téléchargement impossible.");
  if (!(await Sharing.isAvailableAsync())) throw new Error("Le partage n'est pas disponible sur cet appareil.");
  await Sharing.shareAsync(res.uri, { mimeType: doc.mime_type, dialogTitle: doc.name });
}

// Aperçu d'un PDF : navigateur intégré sur iPhone, application PDF du téléphone sur Android
export async function openPdf(doc: PatientDocument) {
  if (Platform.OS === "ios") {
    await WebBrowser.openBrowserAsync(await signedUrl(doc.storage_path, 120));
    return;
  }
  await downloadAndShare(doc);
}
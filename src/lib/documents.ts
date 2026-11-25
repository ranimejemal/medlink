import { supabase } from "@/integrations/supabase/client"; // adaptez avec le chemin trouvé ci-dessus

export const DOC_BUCKET = "patient-documents";

export type PatientDocument = {
  id: string;
  patient_id: string;
  name: string;
  category: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  shared_with_doctor: boolean;
};

export async function listDocuments(patientId?: string): Promise<PatientDocument[]> {
  let q = supabase.from("patient_documents").select("*").order("created_at", { ascending: false });
  if (patientId) q = q.eq("patient_id", patientId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PatientDocument[];
}

export async function signedUrl(path: string, seconds = 120): Promise<string> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteDocument(d: PatientDocument) {
  const rm = await supabase.storage.from(DOC_BUCKET).remove([d.storage_path]);
  if (rm.error) throw rm.error;
  const { error } = await supabase.from("patient_documents").delete().eq("id", d.id);
  if (error) throw error;
}

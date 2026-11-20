import { useState } from "react";
import { Alert, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Image as ImageIcon } from "lucide-react-native";
import { Button, Card, Chip, EmptyState, ErrorText, Header, Screen } from "@/components/ui";
import { ImagePreview } from "@/components/image-preview";
import {
  CATEGORIES, CategoryId, PatientDocument, categoryLabel, deleteDocument, downloadAndShare,
  fmtSize, isImage, listDocuments, openPdf, uploadDocument,
} from "@/lib/documents";
import { validateImage } from "@/lib/validateImage";
import { fmtDate } from "@/lib/format";
import { colors, font } from "@/constants/theme";

type Source = { uri: string; name: string; mime?: string | null };

export default function Documents() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<CategoryId>("autre");
  const [preview, setPreview] = useState<PatientDocument | null>(null);
  const [checking, setChecking] = useState(false);
  const [share, setShare] = useState(false);

  const q = useQuery({ queryKey: ["documents"], queryFn: listDocuments });

  const add = useMutation({
    mutationFn: (src: Source) =>
      uploadDocument({ ...src, category, shared_with_doctor: share }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      Alert.alert("Document ajouté", "Il est enregistré dans votre espace privé.");
    },
    onError: (e) => Alert.alert("Erreur", (e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (d: PatientDocument) => deleteDocument(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
    onError: (e) => Alert.alert("Erreur", (e as Error).message),
  });

  // Valide (flou + contenu) puis envoie. Les PDF ne sont pas analysés.
  async function validateAndAdd(src: Source) {
    if (src.mime?.startsWith("image/")) {
      setChecking(true);
      const ok = await validateImage(src.uri).finally(() => setChecking(false));
      if (!ok) return;
    }
    add.mutate(src);
  }

  async function pickFile() {
    const r = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (r.canceled) return;
    const a = r.assets[0];
    await validateAndAdd({ uri: a.uri, name: a.name, mime: a.mimeType });
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert("Autorisation requise", "Autorisez l'appareil photo dans les réglages du téléphone.");
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (r.canceled) return;
    const a = r.assets[0];
    await validateAndAdd({
      uri: a.uri,
      name: a.fileName ?? `photo-${Date.now()}.jpg`,
      mime: a.mimeType ?? "image/jpeg",
    });
  }

  async function pickGallery() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (r.canceled) return;
    const a = r.assets[0];
    await validateAndAdd({
      uri: a.uri,
      name: a.fileName ?? `image-${Date.now()}.jpg`,
      mime: a.mimeType ?? "image/jpeg",
    });
  }

  async function open(d: PatientDocument) {
    try {
      if (isImage(d.mime_type)) setPreview(d);
      else await openPdf(d);
    } catch (e) {
      Alert.alert("Erreur", (e as Error).message);
    }
  }

  async function download(d: PatientDocument) {
    try {
      await downloadAndShare(d);
    } catch (e) {
      Alert.alert("Erreur", (e as Error).message);
    }
  }

  function askDelete(d: PatientDocument) {
    Alert.alert("Supprimer ce document ?", d.name, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => remove.mutate(d) },
    ]);
  }

  const list = q.data ?? [];
  const busy = add.isPending || checking;

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Header title="Mes documents" subtitle="Vos documents médicaux, privés. Partagés avec votre médecin uniquement si vous le choisissez." />

      <Card style={{ gap: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 17 }}>Ajouter un document</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} label={c.label} selected={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </View>
        <Chip
          label="Partager avec mon médecin"
          selected={share}
          onPress={() => setShare(!share)}
        />
        <Button title="Choisir un fichier (PDF, image)" onPress={pickFile} loading={busy} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button variant="outline" title="Prendre une photo" onPress={takePhoto} disabled={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="outline" title="Galerie" onPress={pickGallery} disabled={busy} />
          </View>
        </View>
        <Text style={{ fontFamily: font.regular, color: colors.muted, fontSize: 12 }}>
          PDF, JPG, PNG ou WebP, 10 Mo maximum, 50 documents au plus.
        </Text>
      </Card>

      <ErrorText error={q.error} />
      {list.length === 0 && !q.isLoading && !q.error ? (
        <EmptyState title="Aucun document" subtitle="Ajoutez une ordonnance, une analyse ou une image." />
      ) : null}

      {list.map((d) => (
        <Card key={d.id}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            {isImage(d.mime_type) ? <ImageIcon color={colors.navy} size={22} /> : <FileText color={colors.navy} size={22} />}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontFamily: font.semibold }}>{d.name}</Text>
              <Text style={{ fontFamily: font.regular, color: colors.muted, fontSize: 12 }}>
                {categoryLabel(d.category)} · {fmtSize(d.size_bytes)} · {fmtDate(d.created_at)}
                {d.shared_with_doctor ? " · Partagé" : ""}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 20, marginTop: 4 }}>
            <Text onPress={() => open(d)} style={{ color: colors.navy, fontFamily: font.semibold }}>Aperçu</Text>
            <Text onPress={() => download(d)} style={{ color: colors.navy, fontFamily: font.semibold }}>Télécharger</Text>
            <Text onPress={() => askDelete(d)} style={{ color: colors.danger, fontFamily: font.semibold }}>Supprimer</Text>
          </View>
        </Card>
      ))}

      <ImagePreview doc={preview} onClose={() => setPreview(null)} />
    </Screen>
  );
}
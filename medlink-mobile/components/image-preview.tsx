import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { PatientDocument, signedUrl } from "@/lib/documents";
import { font } from "@/constants/theme";

export function ImagePreview({ doc, onClose }: { doc: PatientDocument | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    setError(null);
    if (!doc) return;
    let cancelled = false;
    signedUrl(doc.storage_path, 300)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [doc?.id]);

  return (
    <Modal
      visible={!!doc}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="fullScreen"
    >
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }} edges={["top", "bottom", "left", "right"]}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 12 }}>
            <Text numberOfLines={1} style={{ flex: 1, color: "#fff", fontFamily: font.semibold, fontSize: 16 }}>
              {doc?.name}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              accessibilityRole="button"
              accessibilityLabel="Fermer l'aperçu"
            >
              <X color="#fff" size={26} />
            </Pressable>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            {error ? <Text style={{ color: "#fff", fontFamily: font.regular, padding: 24 }}>{error}</Text> : null}
            {!url && !error ? <ActivityIndicator color="#fff" size="large" /> : null}
            {url ? <Image source={{ uri: url }} resizeMode="contain" style={{ width: "100%", height: "100%" }} /> : null}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
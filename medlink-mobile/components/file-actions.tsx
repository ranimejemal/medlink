import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { downloadStoredFile, openStoredFile } from "@/lib/storage";
import { colors, font } from "@/constants/theme";

export function FileActions({ bucket, path }: { bucket: string; path: string }) {
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert("Erreur", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const style = { color: colors.navy, fontFamily: font.semibold, opacity: busy ? 0.5 : 1 };
  return (
    <View style={{ flexDirection: "row", gap: 20 }}>
      <Text style={style} onPress={() => !busy && run(() => openStoredFile(bucket, path))}>
        Ouvrir
      </Text>
      <Text style={style} onPress={() => !busy && run(() => downloadStoredFile(bucket, path))}>
        {busy ? "Patientez..." : "Télécharger"}
      </Text>
    </View>
  );
}

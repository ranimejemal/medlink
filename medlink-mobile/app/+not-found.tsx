import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors, font } from "@/constants/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Page introuvable" }} />
      <View style={styles.container}>
        <Text style={styles.title}>Cette page n'existe pas.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Retour à l'accueil</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: colors.bg },
  title: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  link: { marginTop: 15, paddingVertical: 15 },
  linkText: { fontFamily: font.semibold, fontSize: 14, color: colors.navy },
});

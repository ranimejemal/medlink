import { useEffect } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { Button, Card, Screen } from "@/components/ui";
import { syncReminders } from "@/lib/reminders";
import { fmtDateTime } from "@/lib/format";
import { colors, font } from "@/constants/theme";

export default function BookingConfirmed() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    practitioner?: string;
    specialty?: string;
    clinic?: string;
    startsAt?: string;
  }>();

  useEffect(() => {
    syncReminders();
  }, []);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Confirmation", headerBackVisible: false }} />
      <View style={{ alignItems: "center", gap: 10, marginTop: 24 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.success,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check color="#fff" size={34} />
        </View>
        <Text style={{ fontFamily: font.bold, fontSize: 22, color: colors.text }}>
          Rendez-vous enregistré
        </Text>
        <Text style={{ fontFamily: font.regular, color: colors.muted, textAlign: "center" }}>
          Vous recevrez un rappel 24 h et 1 h avant.
        </Text>
      </View>

      <Card style={{ gap: 6 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 17, color: colors.text }}>
          {p.practitioner}
        </Text>
        {p.specialty ? (
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>{p.specialty}</Text>
        ) : null}
        {p.clinic ? (
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>{p.clinic}</Text>
        ) : null}
        {p.startsAt ? (
          <Text style={{ fontFamily: font.semibold, color: colors.text }}>
            {fmtDateTime(String(p.startsAt))}
          </Text>
        ) : null}
      </Card>

      <Button title="Voir mes rendez-vous" onPress={() => router.replace("/(app)/appointments")} />
      <Button
        variant="outline"
        title="Retour à l'accueil"
        onPress={() => router.replace("/(app)")}
      />
    </Screen>
  );
}

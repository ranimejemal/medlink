import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }) as Notifications.NotificationBehavior,
});

const PREFIX = "appt-";
const OFFSETS = [
  { key: "24h", ms: 24 * 3600 * 1000, text: "demain" },
  { key: "1h", ms: 3600 * 1000, text: "dans 1 heure" },
];

async function ensurePermission() {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function clearReminders() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => n.identifier.startsWith(PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {}
}

// Reconstruit tous les rappels à partir des rendez-vous actifs : idempotent
export async function syncReminders() {
  try {
    if (Platform.OS === "web" || !(await ensurePermission())) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("reminders", {
        name: "Rappels de rendez-vous",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const { data, error } = await supabase
      .from("appointments")
      .select("id, starts_at")
      .eq("patient_id", u.user.id)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", new Date().toISOString());
    if (error) return;

    await clearReminders();
    for (const a of data ?? []) {
      const start = new Date(a.starts_at);
      const hhmm = start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      for (const o of OFFSETS) {
        const date = new Date(start.getTime() - o.ms);
        if (date.getTime() <= Date.now()) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: `${PREFIX}${a.id}-${o.key}`,
          content: {
            title: "MedLink",
            body: `Rappel : vous avez un rendez-vous ${o.text} à ${hhmm}.`,
          },
          trigger: { type: "date", date, channelId: "reminders" } as any,
        });
      }
    }
  } catch {}
}

import { Tabs } from "expo-router";
import { usePreventScreenCapture } from "expo-screen-capture";
import { CalendarDays, FileText, FlaskConical, LayoutDashboard, User } from "lucide-react-native";
import { colors, font } from "@/constants/theme";

export default function AppTabs() {
  usePreventScreenCapture(); // masque le contenu dans les captures et le sélecteur d'apps
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.navy,
      tabBarInactiveTintColor: colors.muted,
      tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: "Accueil", tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="appointments" options={{ title: "Rendez-vous", tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
      <Tabs.Screen name="results" options={{ title: "Résultats", tabBarIcon: ({ color, size }) => <FlaskConical color={color} size={size} /> }} />
      <Tabs.Screen name="documents" options={{ title: "Documents", tabBarIcon: ({ color, size }) => <FileText color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}

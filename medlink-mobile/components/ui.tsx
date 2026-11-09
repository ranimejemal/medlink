import { ReactNode } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TextInputProps, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Inbox } from "lucide-react-native";
import { colors, font, radius } from "@/constants/theme";
import { STATUS } from "@/lib/format";

export function Screen({ children, onRefresh, refreshing = false }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.h1}>{title}</Text>
      {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = "primary", loading, disabled }: {
  title: string; onPress: () => void; variant?: "primary" | "outline" | "danger";
  loading?: boolean; disabled?: boolean;
}) {
  const bg = variant === "primary" ? colors.navy : variant === "danger" ? colors.danger : "#fff";
  const fg = variant === "outline" ? colors.text : "#fff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[s.btn, { backgroundColor: bg, borderColor: variant === "outline" ? colors.border : bg, opacity: disabled ? 0.5 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <Card style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={s.iconBox}>{icon}</View>
      <View>
        <Text style={s.label}>{label}</Text>
        <Text style={s.stat}>{value}</Text>
      </View>
    </Card>
  );
}

export function EmptyState({ title, subtitle, actionLabel, onAction }: {
  title: string; subtitle?: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={s.empty}>
      <Inbox color={colors.muted} size={32} />
      <Text style={s.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={[s.muted, { textAlign: "center" }]}>{subtitle}</Text> : null}
      {actionLabel && onAction ? <View style={{ marginTop: 8 }}><Button variant="outline" title={actionLabel} onPress={onAction} /></View> : null}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={s.input} {...props} />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selected && { backgroundColor: colors.navy, borderColor: colors.navy }]}>
      <Text style={{ fontFamily: font.medium, color: selected ? "#fff" : colors.text }}>{label}</Text>
    </Pressable>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const st = STATUS[status] ?? { label: status, color: colors.muted };
  return <Text style={{ fontFamily: font.semibold, color: st.color, fontSize: 12 }}>{st.label}</Text>;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <Text style={{ color: colors.danger, fontFamily: font.medium }}>{(error as Error).message}</Text>;
}

const s = StyleSheet.create({
  h1: { fontFamily: font.bold, fontSize: 26, color: colors.text },
  muted: { fontFamily: font.regular, color: colors.muted, fontSize: 14 },
  label: { fontFamily: font.medium, color: colors.muted, fontSize: 12, textTransform: "uppercase" },
  stat: { fontFamily: font.bold, fontSize: 28, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  btn: { borderRadius: radius.md, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center" },
  btnText: { fontFamily: font.semibold, fontSize: 15 },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 6, padding: 24, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.lg },
  emptyTitle: { fontFamily: font.semibold, fontSize: 16, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontFamily: font.regular, backgroundColor: "#fff", color: colors.text },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#fff" },
});

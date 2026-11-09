import { useState } from "react";
import { Pressable, Text, TextInput, TextInputProps, View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { colors, font, radius } from "@/constants/theme";

export function PasswordField({ label, ...props }: TextInputProps & { label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: font.medium, color: colors.muted, fontSize: 12, textTransform: "uppercase" }}>
        {label}
      </Text>
      <View style={{
        flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border,
        borderRadius: radius.md, backgroundColor: "#fff", paddingHorizontal: 12,
      }}>
        <TextInput
          {...props}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted}
          style={{ flex: 1, paddingVertical: 12, fontFamily: font.regular, color: colors.text }}
        />
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={12} accessibilityLabel={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
          {visible ? <EyeOff color={colors.muted} size={20} /> : <Eye color={colors.muted} size={20} />}
        </Pressable>
      </View>
    </View>
  );
}

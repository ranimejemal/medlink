import { useState } from "react";
import { Alert, Text } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, ErrorText, Field, Header, Screen } from "@/components/ui";
import { deleteMyAccount, exportMyData } from "@/lib/privacy";
import { colors, font } from "@/constants/theme";

export default function Privacy() {
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<Error | null>(null);

  async function doExport() {
    setExporting(true);
    setError(null);
    try {
      await exportMyData();
    } catch (e) {
      setError(e as Error);
    } finally {
      setExporting(false);
    }
  }

  function askDelete() {
    Alert.alert(
      "Supprimer définitivement ?",
      "Votre compte, vos rendez-vous, vos documents et vos résultats seront effacés. Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            setError(null);
            try {
              await deleteMyAccount();
              qc.clear(); // la session est vide : l'app revient à l'écran de connexion
            } catch (e) {
              setError(e as Error);
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <Header
        title="Mes données"
        subtitle="Vous gardez le contrôle de vos données personnelles et de santé."
      />

      <Card style={{ gap: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 17 }}>Exporter mes données</Text>
        <Text style={{ fontFamily: font.regular, color: colors.muted }}>
          Génère un fichier JSON (profil, rendez-vous, demandes, documents, résultats) que vous
          pouvez enregistrer ou partager. Conservez-le en lieu sûr : il contient des données de
          santé.
        </Text>
        <Button title="Exporter" onPress={doExport} loading={exporting} />
      </Card>

      <Card style={{ gap: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 17, color: colors.danger }}>
          Supprimer mon compte
        </Text>
        <Text style={{ fontFamily: font.regular, color: colors.muted }}>
          Suppression définitive de votre compte et de toutes vos données. Exportez-les d'abord si
          vous voulez en garder une copie.
        </Text>
        <Field
          label='Tapez "SUPPRIMER" pour confirmer'
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
        />
        <ErrorText error={error} />
        <Button
          variant="danger"
          title="Supprimer mon compte"
          onPress={askDelete}
          loading={deleting}
          disabled={confirmText.trim() !== "SUPPRIMER"}
        />
      </Card>
    </Screen>
  );
}

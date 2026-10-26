import { createFileRoute } from "@tanstack/react-router";
import { ErrorScreen } from "@/components/medlink/ErrorScreen";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({
    meta: [
      { title: "Accès refusé — MedLink" },
      {
        name: "description",
        content: "Vous n'avez pas les droits nécessaires pour accéder à cette page.",
      },
      { property: "og:title", content: "Accès refusé — MedLink" },
      { property: "og:description", content: "Accès non autorisé." },
    ],
  }),
  component: () => (
    <ErrorScreen
      code="403"
      title="Accès refusé"
      message="Votre rôle ne vous permet pas d'accéder à cette page. Cette tentative a été enregistrée."
      action={{ to: "/dashboard", label: "Retour à mon espace" }}
    />
  ),
});

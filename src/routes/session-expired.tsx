import { createFileRoute } from "@tanstack/react-router";
import { ErrorScreen } from "@/components/medlink/ErrorScreen";

export const Route = createFileRoute("/session-expired")({
  head: () => ({
    meta: [
      { title: "Session expirée — MedLink" },
      { name: "description", content: "Votre session a expiré pour des raisons de sécurité." },
      { property: "og:title", content: "Session expirée — MedLink" },
      { property: "og:description", content: "Session expirée après inactivité." },
    ],
  }),
  component: () => (
    <ErrorScreen
      code="⏱"
      title="Session expirée"
      message="Pour protéger vos données, vous avez été déconnecté après 15 minutes d'inactivité."
      action={{ to: "/login", label: "Se reconnecter" }}
    />
  ),
});

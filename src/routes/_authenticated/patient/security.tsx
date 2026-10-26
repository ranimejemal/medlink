import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/medlink/ui";
import { ChangePasswordCard } from "@/components/medlink/ChangePassword";

export const Route = createFileRoute("/_authenticated/patient/security")({
  head: () => ({
    meta: [
      { title: "Sécurité — MedLink" },
      { name: "description", content: "Modifiez votre mot de passe." },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader
        title="Sécurité"
        description="Modifiez votre mot de passe. Les autres appareils seront déconnectés."
      />
      <ChangePasswordCard />
    </div>
  ),
});

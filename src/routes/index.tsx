import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MedLink — Portail médical sécurisé" },
      { name: "description", content: "Portail médical sécurisé du réseau de cliniques MedLink." },
      { property: "og:title", content: "MedLink — Portail médical sécurisé" },
      { property: "og:description", content: "Accès sécurisé aux cliniques MedLink de Sousse, Sfax et Tunis." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});

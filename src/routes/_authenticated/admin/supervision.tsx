// src/routes/_authenticated/admin/supervision.tsx
import { createFileRoute } from "@tanstack/react-router";
import { SupervisionPanel } from "@/components/medlink/SupervisionPanel";

export const Route = createFileRoute("/_authenticated/admin/supervision")({
  component: () => <SupervisionPanel role="admin" />,
});

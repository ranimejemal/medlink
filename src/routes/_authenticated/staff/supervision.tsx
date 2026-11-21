// src/routes/_authenticated/staff/supervision.tsx
import { createFileRoute } from "@tanstack/react-router";
import { SupervisionPanel } from "@/components/medlink/SupervisionPanel";

export const Route = createFileRoute("/_authenticated/staff/supervision")({
  component: () => <SupervisionPanel role="staff" />,
});
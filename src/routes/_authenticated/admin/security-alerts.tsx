// src/routes/_authenticated/admin/security-alerts.tsx
import { createFileRoute } from "@tanstack/react-router";
import { SecurityAlerts } from "@/components/medlink/SecurityAlerts";

export const Route = createFileRoute("/_authenticated/admin/security-alerts")({
  component: () => <SecurityAlerts />,
});
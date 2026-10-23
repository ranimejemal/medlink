import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/access";
import { RoleLayout } from "@/components/medlink/RoleLayout";

export const Route = createFileRoute("/_authenticated/patient")({
  beforeLoad: () => requireRole("patient"),
  component: () => <RoleLayout role="patient" />,
});

import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/access";
import { RoleLayout } from "@/components/medlink/RoleLayout";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: () => requireRole("admin"),
  component: () => <RoleLayout role="admin" />,
});

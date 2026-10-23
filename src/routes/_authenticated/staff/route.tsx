import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/access";
import { RoleLayout } from "@/components/medlink/RoleLayout";

export const Route = createFileRoute("/_authenticated/staff")({
  beforeLoad: () => requireRole("staff"),
  component: () => <RoleLayout role="staff" />,
});

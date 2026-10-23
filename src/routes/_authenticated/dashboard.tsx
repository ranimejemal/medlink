import { createFileRoute, redirect } from "@tanstack/react-router";
import { homeFor, loadAccess } from "@/lib/access";

// Sends each signed-in user to the dashboard for their role.
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async () => {
    const access = await loadAccess();
    if (!access) throw redirect({ to: "/login" });
    throw redirect({ to: homeFor(access.roles) });
  },
});

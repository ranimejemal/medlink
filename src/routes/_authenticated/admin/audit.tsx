import { createFileRoute } from "@tanstack/react-router";
import { AuditJournal } from "@/components/medlink/AuditJournal";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: () => <AuditJournal />,
});

import { Outlet } from "@tanstack/react-router";
import { AppShell } from "./AppShell";
import type { AppRole } from "@/lib/access";

export function RoleLayout({ role }: { role: AppRole }) {
  return (
    <AppShell role={role}>
      <Outlet />
    </AppShell>
  );
}

export const URGENCY: Record<string, { label: string; cls: string }> = {
  low: { label: "Faible", cls: "bg-secondary text-secondary-foreground" },
  medium: { label: "Modérée", cls: "bg-accent text-accent-foreground" },
  high: { label: "Élevée", cls: "bg-warning/20 text-warning-foreground" },
  urgent: { label: "Urgente", cls: "bg-destructive/10 text-destructive" },
};

export const REQ_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-warning/20 text-warning-foreground" },
  approved: { label: "Acceptée", cls: "bg-success/15 text-success" },
  rejected: { label: "Refusée", cls: "bg-destructive/10 text-destructive" },
};

export function Pill({ v }: { v: { label: string; cls: string } | undefined }) {
  if (!v) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

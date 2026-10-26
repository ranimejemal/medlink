import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-surface p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <div className="card-surface flex items-start gap-4 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  message?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="mt-3 font-medium">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Planifié", cls: "bg-accent text-accent-foreground" },
  confirmed: { label: "Confirmé", cls: "bg-success/15 text-success" },
  cancelled: { label: "Annulé", cls: "bg-destructive/10 text-destructive" },
  completed: { label: "Terminé", cls: "bg-secondary text-secondary-foreground" },
  no_show: { label: "Absent", cls: "bg-warning/20 text-warning-foreground" },
  pending: { label: "En attente", cls: "bg-warning/20 text-warning-foreground" },
  validated: { label: "Validé", cls: "bg-success/15 text-success" },
  draft: { label: "Brouillon", cls: "bg-secondary text-secondary-foreground" },
  info: { label: "Info", cls: "bg-accent text-accent-foreground" },
  warning: { label: "Alerte", cls: "bg-warning/20 text-warning-foreground" },
  critical: { label: "Critique", cls: "bg-destructive/10 text-destructive" },
  active: { label: "Actif", cls: "bg-success/15 text-success" },
  inactive: { label: "Désactivé", cls: "bg-destructive/10 text-destructive" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-secondary text-secondary-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        s.cls,
      )}
    >
      {s.label}
    </span>
  );
}

export function DemoNotice() {
  return (
    <p className="rounded-lg border border-dashed bg-muted px-3 py-2 text-xs text-muted-foreground">
      Données de démonstration fictives — aucune information médicale réelle.
    </p>
  );
}

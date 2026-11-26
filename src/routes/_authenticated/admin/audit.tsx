import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, ScrollText, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/medlink/ui";
import {
  AUDIT_CATEGORIES,
  AUDIT_SEVERITIES,
  EXPORT_LIMIT,
  PAGE_SIZE,
  actionLabel,
  dayRange,
  sanitizeSearch,
  toCsv,
  type AuditRow,
} from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Journal d'audit — MedLink" }] }),
  component: AuditPage,
});

type Filters = { category: string; severity: string; search: string; from: string; to: string };
const EMPTY: Filters = { category: "all", severity: "all", search: "", from: "", to: "" };
const COLUMNS = "id,created_at,user_email,action,entity,entity_id,severity,ip_address,details";

const fmt = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Africa/Tunis",
  });

// Applies the filters to a query on audit_logs. RLS only lets an administrator (MFA) read every row.
function filtered(f: Filters, columns: string, count?: "exact") {
  let q = supabase
    .from("audit_logs")
    .select(columns, count ? { count } : undefined)
    .order("created_at", { ascending: false });
  if (f.category !== "all") q = q.like("action", `${f.category}%`);
  if (f.severity !== "all") q = q.eq("severity", f.severity);
  const search = sanitizeSearch(f.search);
  if (search) q = q.ilike("user_email", `%${search}%`);
  const range = dayRange(f.from, f.to);
  if (range.gte) q = q.gte("created_at", range.gte);
  if (range.lt) q = q.lt("created_at", range.lt);
  return q;
}

// US-35: the administrator consults, filters and exports the audit log (read-only, US-47).
function AuditPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const q = useQuery({
    queryKey: ["admin", "audit", filters, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, count } = await filtered(filters, COLUMNS, "exact").range(
        page * PAGE_SIZE,
        page * PAGE_SIZE + PAGE_SIZE - 1,
      );
      if (error) throw error;
      return { rows: (data ?? []) as unknown as AuditRow[], total: count ?? 0 };
    },
  });

  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setFilters(draft);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const { data, error } = await filtered(filters, COLUMNS).limit(EXPORT_LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as unknown as AuditRow[];
      const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      // The export itself is traced.
      await supabase.rpc("log_event", {
        _action: "audit.exported",
        _entity: "audit_logs",
        _details: { rows: rows.length, filters },
      });
      if (rows.length === EXPORT_LIMIT)
        toast.info(`Export limité aux ${EXPORT_LIMIT} entrées les plus récentes.`);
    } catch {
      toast.error("Export impossible. Veuillez réessayer.");
    } finally {
      setExporting(false);
    }
  }

  const select =
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal d'audit"
        description="Toutes les actions sensibles du portail. Le journal est en lecture seule : aucune entrée ne peut être modifiée ni supprimée."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exporting || !total}>
            <Download className="mr-1 h-4 w-4" />
            {exporting ? "Export…" : "Exporter (CSV)"}
          </Button>
        }
      />

      <Panel>
        <form onSubmit={apply} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1 lg:col-span-2">
            <Label htmlFor="audit-search">Utilisateur (e-mail)</Label>
            <Input
              id="audit-search"
              value={draft.search}
              maxLength={100}
              placeholder="ex. dr.ben@…"
              onChange={(e) => setDraft({ ...draft, search: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-type">Type</Label>
            <select
              id="audit-type"
              className={select}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              {AUDIT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-severity">Gravité</Label>
            <select
              id="audit-severity"
              className={select}
              value={draft.severity}
              onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
            >
              {AUDIT_SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-from">Du</Label>
            <Input
              id="audit-from"
              type="date"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to">Au</Label>
            <Input
              id="audit-to"
              type="date"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
            <Button type="submit">
              <Search className="mr-1 h-4 w-4" />
              Filtrer
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setFilters(EMPTY);
                setPage(0);
              }}
            >
              Réinitialiser
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title={q.data ? `${total} entrée${total > 1 ? "s" : ""}` : "Entrées"}>
        {q.isLoading ? (
          <ListSkeleton rows={5} />
        ) : q.isError ? (
          <EmptyState
            title="Journal indisponible"
            message="Vérifiez que la double authentification est active, puis réessayez."
          />
        ) : !q.data?.rows.length ? (
          <EmptyState
            icon={ScrollText}
            title="Aucune entrée"
            message="Aucune action ne correspond à ces filtres."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Utilisateur</th>
                    <th className="py-2 pr-3 font-medium">Action</th>
                    <th className="py-2 pr-3 font-medium">Objet</th>
                    <th className="py-2 pr-3 font-medium">Gravité</th>
                    <th className="py-2 font-medium">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {q.data.rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
                        {fmt(r.created_at)}
                      </td>
                      <td className="py-2 pr-3">
                        {r.user_email ?? <span className="text-muted-foreground">Système</span>}
                        {r.ip_address && (
                          <p className="text-xs text-muted-foreground">{r.ip_address}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <p>{actionLabel(r.action)}</p>
                        <p className="font-mono text-xs text-muted-foreground">{r.action}</p>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {r.entity ?? "—"}
                        {r.entity_id && (
                          <p className="max-w-[140px] truncate font-mono text-xs">{r.entity_id}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={r.severity} />
                      </td>
                      <td className="py-2">
                        {r.details ? (
                          <details>
                            <summary className="cursor-pointer text-xs text-primary">Voir</summary>
                            <pre className="mt-1 max-w-xs overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                              {JSON.stringify(r.details, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Page {page + 1} sur {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || q.isFetching}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= pages || q.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

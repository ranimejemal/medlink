import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, ClipboardList, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
} from "@/components/medlink/ui";
import { Pill, REQ_STATUS, URGENCY } from "@/components/medlink/RoleLayout";

export const Route = createFileRoute("/_authenticated/staff/dashboard")({
  head: () => ({
    meta: [
      { title: "Accueil — MedLink" },
      { name: "description", content: "Demandes de rendez-vous et planning du jour." },
    ],
  }),
  component: StaffDashboard,
});

const fmt = (d: string) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const URG_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function useRequestsQueue() {
  return useQuery({
    queryKey: ["staff", "requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = [...new Set(data.map((r) => r.patient_id))];
      const { data: profiles } = ids.length
        ? await supabase
            .from("profiles")
            .select("id,first_name,last_name,email,phone")
            .in("id", ids)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return data
        .map((r) => ({ ...r, patient: byId.get(r.patient_id) }))
        .sort(
          (a, b) =>
            Number(b.status === "pending") - Number(a.status === "pending") ||
            (URG_ORDER[a.urgency] ?? 9) - (URG_ORDER[b.urgency] ?? 9),
        );
    },
  });
}

export function RequestQueue() {
  const qc = useQueryClient();
  const q = useRequestsQueue();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("appointment_requests")
        .update({
          status,
          staff_note: notes[id]?.trim() || null,
          reviewed_by: u.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demande mise à jour");
      qc.invalidateQueries({ queryKey: ["staff", "requests"] });
    },
    onError: () => toast.error("Impossible de mettre à jour la demande."),
  });

  if (q.isLoading) return <ListSkeleton />;
  if (q.error)
    return <p className="text-sm text-destructive">Impossible de charger les demandes.</p>;
  if (!q.data?.length)
    return (
      <EmptyState
        title="Aucune demande"
        message="Les demandes envoyées par les patients apparaîtront ici."
      />
    );
  return (
    <ul className="space-y-3">
      {q.data.map((r) => (
        <li key={r.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill v={URGENCY[r.urgency]} />
            <Pill v={REQ_STATUS[r.status]} />
            <span className="font-medium">
              {r.patient
                ? `${r.patient.first_name} ${r.patient.last_name}`.trim() || r.patient.email
                : "Patient"}
            </span>
            {r.patient?.phone && (
              <span className="text-xs text-muted-foreground">{r.patient.phone}</span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{fmt(r.created_at)}</span>
          </div>
          <p className="mt-2 text-sm">{r.summary}</p>
          <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              Spécialité : <span className="text-foreground">{r.suggested_specialty ?? "—"}</span>
            </div>
            <div>
              Depuis : <span className="text-foreground">{r.duration ?? "—"}</span>
            </div>
            <div>
              Symptômes : <span className="text-foreground">{r.symptoms.join(", ") || "—"}</span>
            </div>
            <div>
              Disponibilités : <span className="text-foreground">{r.preferred_timing ?? "—"}</span>
            </div>
          </dl>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Notes originales du patient
            </summary>
            <p className="mt-1 whitespace-pre-wrap">{r.raw_notes}</p>
          </details>
          {r.status === "pending" ? (
            <div className="mt-3 space-y-2">
              <Textarea
                rows={2}
                placeholder="Message pour le patient (facultatif)"
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                maxLength={500}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ id: r.id, status: "approved" })}
                >
                  <Check className="h-4 w-4" /> Accepter
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ id: r.id, status: "rejected" })}
                >
                  <X className="h-4 w-4" /> Refuser
                </Button>
              </div>
            </div>
          ) : r.staff_note ? (
            <p className="mt-2 text-xs text-muted-foreground">Note : {r.staff_note}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function StaffDashboard() {
  const q = useRequestsQueue();
  const today = useQuery({
    queryKey: ["staff", "today"],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { data, error } = await supabase
        .from("appointments")
        .select("id,starts_at,status,clinics(name),practitioners(title,last_name)")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data;
    },
  });
  const pending = q.data?.filter((r) => r.status === "pending").length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Accueil"
        description="Demandes des patients à examiner et rendez-vous du jour."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Demandes en attente" value={pending ?? "—"} icon={ClipboardList} />
        <StatCard
          label="Rendez-vous aujourd'hui"
          value={today.data?.length ?? "—"}
          icon={CalendarDays}
        />
      </div>
      <Panel title="Demandes de rendez-vous">
        <RequestQueue />
      </Panel>
      <Panel title="Rendez-vous du jour">
        {today.isLoading ? (
          <ListSkeleton />
        ) : !today.data?.length ? (
          <EmptyState title="Aucun rendez-vous aujourd'hui" />
        ) : (
          <ul className="divide-y">
            {today.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                <span>
                  {new Date(a.starts_at).toLocaleTimeString("fr-FR", { timeStyle: "short" })} ·{" "}
                  {a.practitioners?.title} {a.practitioners?.last_name} · {a.clinics?.name}
                </span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

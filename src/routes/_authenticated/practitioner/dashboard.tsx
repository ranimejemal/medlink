import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
} from "@/components/medlink/ui";

export const Route = createFileRoute("/_authenticated/practitioner/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord praticien — MedLink" },
      { name: "description", content: "Votre agenda et vos prochaines consultations." },
    ],
  }),
  component: PractitionerDashboard,
});

function PractitionerDashboard() {
  const q = useQuery({
    queryKey: ["practitioner", "upcoming"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: pr } = await supabase
        .from("practitioners")
        .select("id,title,last_name")
        .eq("user_id", u.user!.id)
        .maybeSingle();
      if (!pr) return { pr: null, appts: [] };
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("appointments")
        .select("id,starts_at,status,reason,patient_id,clinics(name)")
        .eq("practitioner_id", pr.id)
        .gte("starts_at", start.toISOString())
        .order("starts_at")
        .limit(20);
      if (error) throw error;
      return { pr, appts: data };
    },
  });
  const todayStr = new Date().toDateString();
  const today =
    q.data?.appts.filter((a) => new Date(a.starts_at).toDateString() === todayStr) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={q.data?.pr ? `Bonjour ${q.data.pr.title} ${q.data.pr.last_name}` : "Tableau de bord"}
        description="Vos consultations à venir."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Aujourd'hui" value={q.isLoading ? "—" : today.length} icon={Clock} />
        <StatCard label="À venir" value={q.data?.appts.length ?? "—"} icon={CalendarDays} />
      </div>
      <Panel title="Prochaines consultations">
        {q.isLoading ? (
          <ListSkeleton />
        ) : q.data && !q.data.pr ? (
          <EmptyState
            title="Profil praticien non lié"
            message="Contactez un administrateur pour lier votre compte."
          />
        ) : !q.data?.appts.length ? (
          <EmptyState title="Aucune consultation prévue" />
        ) : (
          <ul className="divide-y">
            {q.data.appts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {new Date(a.starts_at).toLocaleString("fr-FR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {a.clinics?.name}
                    {a.reason ? ` · ${a.reason}` : ""}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

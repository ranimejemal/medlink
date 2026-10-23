import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ClipboardList, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader, Panel, StatCard, StatusBadge, DemoNotice } from "@/components/medlink/ui";
import { Pill, REQ_STATUS, URGENCY } from "@/components/medlink/RoleLayout";

export const Route = createFileRoute("/_authenticated/patient/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord patient — MedLink" }, { name: "description", content: "Vos rendez-vous et demandes MedLink." }] }),
  component: PatientDashboard,
});

const fmt = (d: string) => new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function PatientDashboard() {
  const appts = useQuery({
    queryKey: ["patient", "appointments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("appointments").select("id,starts_at,status,reason,clinics(name,city),practitioners(title,first_name,last_name)").gte("starts_at", new Date().toISOString()).order("starts_at").limit(5);
      if (error) throw error;
      return data;
    },
  });
  const reqs = useQuery({
    queryKey: ["patient", "requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("appointment_requests").select("id,summary,urgency,status,staff_note,created_at").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
  });
  const pending = reqs.data?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Tableau de bord" description="Vos prochains rendez-vous et vos demandes." actions={<Button asChild><Link to="/patient/request"><Sparkles className="h-4 w-4" /> Nouvelle demande</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Rendez-vous à venir" value={appts.data?.length ?? "—"} icon={CalendarDays} />
        <StatCard label="Demandes en attente" value={reqs.isLoading ? "—" : pending} icon={ClipboardList} />
      </div>
      <Panel title="Prochains rendez-vous">
        {appts.isLoading ? <ListSkeleton /> : !appts.data?.length ? <EmptyState title="Aucun rendez-vous à venir" /> : (
          <ul className="divide-y">
            {appts.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{fmt(a.starts_at)}</p>
                  <p className="text-sm text-muted-foreground">{a.practitioners ? `${a.practitioners.title} ${a.practitioners.first_name} ${a.practitioners.last_name}` : ""} · {a.clinics?.name}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Mes demandes de rendez-vous">
        {reqs.isLoading ? <ListSkeleton /> : !reqs.data?.length ? (
          <EmptyState title="Aucune demande" message="Décrivez votre besoin, notre équipe vous recontactera." action={<Button asChild variant="outline"><Link to="/patient/request">Décrire mon besoin</Link></Button>} />
        ) : (
          <ul className="divide-y">
            {reqs.data.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2"><Pill v={REQ_STATUS[r.status]} /><Pill v={URGENCY[r.urgency]} /><span className="text-xs text-muted-foreground">{fmt(r.created_at)}</span></div>
                <p className="mt-1 text-sm">{r.summary}</p>
                {r.staff_note && <p className="mt-1 text-sm text-muted-foreground">Réponse de l'équipe : {r.staff_note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <DemoNotice />
    </div>
  );
}

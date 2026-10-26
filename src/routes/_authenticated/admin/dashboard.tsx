import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CalendarX, ShieldAlert, Stethoscope, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ListSkeleton, PageHeader, Panel, StatCard, StatusBadge } from "@/components/medlink/ui";
import { RequestQueue } from "../staff/dashboard";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Administration — MedLink" },
      { name: "description", content: "Vue d'ensemble du réseau MedLink." },
    ],
  }),
  component: AdminDashboard,
});

type Stats = {
  patients: number;
  practitioners: number;
  upcoming: number;
  cancelled_30d: number;
  failed_logins_24h: number;
  by_clinic: { city: string; total: number }[];
  by_status: { status: string; total: number }[];
};

function AdminDashboard() {
  const q = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const s = q.data;
  return (
    <div className="space-y-6">
      <PageHeader title="Tableau de bord" description="Activité du réseau de cliniques." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Patients" value={s?.patients ?? "—"} icon={Users} />
        <StatCard label="Praticiens actifs" value={s?.practitioners ?? "—"} icon={Stethoscope} />
        <StatCard label="RDV à venir" value={s?.upcoming ?? "—"} icon={CalendarDays} />
        <StatCard label="Annulés (30 j)" value={s?.cancelled_30d ?? "—"} icon={CalendarX} />
        <StatCard
          label="Échecs connexion (24 h)"
          value={s?.failed_logins_24h ?? "—"}
          icon={ShieldAlert}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Rendez-vous par ville (30 j)">
          {q.isLoading ? (
            <ListSkeleton />
          ) : (
            <ul className="divide-y">
              {s?.by_clinic.map((c) => (
                <li key={c.city} className="flex justify-between py-2 text-sm">
                  <span>{c.city}</span>
                  <span className="font-medium">{c.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Rendez-vous par statut">
          {q.isLoading ? (
            <ListSkeleton />
          ) : (
            <ul className="divide-y">
              {s?.by_status.map((c) => (
                <li key={c.status} className="flex justify-between py-2 text-sm">
                  <StatusBadge status={c.status} />
                  <span className="font-medium">{c.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <Panel title="Demandes de rendez-vous des patients">
        <RequestQueue />
      </Panel>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/patient/appointments/")({
  head: () => ({
    meta: [
      { title: "Mes rendez-vous — MedLink" },
      { name: "description", content: "Consultez et annulez vos rendez-vous." },
    ],
  }),
  component: AppointmentsPage,
});

const fmt = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  });

function AppointmentsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["patient", "appointments", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id,starts_at,status,reason,clinics(name,city),practitioners(title,first_name,last_name)",
        )
        .order("starts_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_appointment", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient"] }),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes rendez-vous"
        actions={
          <Button asChild>
            <Link to="/patient/appointments/new">Prendre rendez-vous</Link>
          </Button>
        }
      />
      {cancel.error && (
        <Alert variant="destructive">
          <AlertDescription>{friendlyError(cancel.error)}</AlertDescription>
        </Alert>
      )}
      <Panel>
        {list.isLoading ? (
          <ListSkeleton />
        ) : !list.data?.length ? (
          <EmptyState title="Aucun rendez-vous" />
        ) : (
          <ul className="divide-y">
            {list.data.map((a) => {
              const active =
                (a.status === "scheduled" || a.status === "confirmed") &&
                new Date(a.starts_at) > new Date();
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium capitalize">{fmt(a.starts_at)}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.practitioners
                        ? `${a.practitioners.title} ${a.practitioners.first_name} ${a.practitioners.last_name}`
                        : ""}{" "}
                      · {a.clinics?.name}, {a.clinics?.city}
                    </p>
                    {a.reason && <p className="text-sm">{a.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    {active && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancel.isPending}
                        onClick={() => {
                          if (confirm("Annuler ce rendez-vous ?")) cancel.mutate(a.id);
                        }}
                      >
                        Annuler
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

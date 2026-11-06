import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/patient/appointments/")({
  head: () => ({
    meta: [
      { title: "Mes rendez-vous — MedLink" },
      { name: "description", content: "Consultez, reportez et annulez vos rendez-vous." },
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
const day = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Tunis",
  });
const hour = (d: string) =>
  new Date(d).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Tunis",
  });

type Appointment = {
  id: string;
  starts_at: string;
  status: string;
  reason: string | null;
  practitioner_id: string;
  clinics: { name: string; city: string } | null;
  practitioners: { title: string; first_name: string; last_name: string } | null;
};

const isUpcoming = (a: Appointment) =>
  (a.status === "scheduled" || a.status === "confirmed") && new Date(a.starts_at) > new Date();

// Same rule as cancel_appointment in the database: no change less than 24 hours before.
const tooLate = (a: Appointment) =>
  new Date(a.starts_at).getTime() - Date.now() < 24 * 60 * 60 * 1000;

function AppointmentsPage() {
  const qc = useQueryClient();
  const [moving, setMoving] = useState<Appointment | null>(null);
  const list = useQuery({
    queryKey: ["patient", "appointments", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id,starts_at,status,reason,practitioner_id,clinics(name,city),practitioners(title,first_name,last_name)",
        )
        .order("starts_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Appointment[];
    },
  });
  // US-11: upcoming first (soonest at the top), then past and cancelled (most recent at the top)
  const upcoming = useMemo(() => (list.data ?? []).filter(isUpcoming).reverse(), [list.data]);
  const past = useMemo(() => (list.data ?? []).filter((a) => !isUpcoming(a)), [list.data]);

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_appointment", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient"] }),
  });

  const row = (a: Appointment, actions: boolean) => (
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
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={a.status} />
        {actions &&
          (tooLate(a) ? (
            <span className="text-xs text-muted-foreground">
              Moins de 24 h : contactez la clinique pour modifier
            </span>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setMoving(a)}>
                Reporter
              </Button>
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
            </>
          ))}
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes rendez-vous"
        description="Report et annulation possibles jusqu'à 24 heures avant le rendez-vous."
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
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">À venir ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Passés et annulés ({past.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <Panel>
            {list.isLoading ? (
              <ListSkeleton />
            ) : !upcoming.length ? (
              <EmptyState title="Aucun rendez-vous à venir" />
            ) : (
              <ul className="divide-y">{upcoming.map((a) => row(a, true))}</ul>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="past">
          <Panel>
            {list.isLoading ? (
              <ListSkeleton />
            ) : !past.length ? (
              <EmptyState title="Aucun rendez-vous passé" />
            ) : (
              <ul className="divide-y">{past.map((a) => row(a, false))}</ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
      <RescheduleDialog appointment={moving} onClose={() => setMoving(null)} />
    </div>
  );
}

// US-10: pick a free slot with the same practitioner; the database cancels the old
// appointment and books the new one in a single call (reschedule_appointment).
function RescheduleDialog({
  appointment,
  onClose,
}: {
  appointment: Appointment | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [slotId, setSlotId] = useState<string | null>(null);
  const slots = useQuery({
    queryKey: ["patient", "reschedule-slots", appointment?.practitioner_id],
    enabled: !!appointment,
    queryFn: async () => {
      const soonest = new Date(Date.now() + 60 * 60_000).toISOString();
      const { data, error } = await supabase
        .from("availability_slots")
        .select("id,starts_at,clinics(name,city)")
        .eq("practitioner_id", appointment!.practitioner_id)
        .eq("is_booked", false)
        .gte("starts_at", soonest)
        .order("starts_at")
        .limit(60);
      if (error) throw error;
      return data;
    },
  });
  const byDay = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof slots.data>>();
    for (const s of slots.data ?? []) {
      const k = day(s.starts_at);
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
    return [...groups.entries()];
  }, [slots.data]);

  const move = useMutation({
    mutationFn: async () => {
      if (!appointment || !slotId) return;
      const { error } = await supabase.rpc("reschedule_appointment", {
        _id: appointment.id,
        _new_slot: slotId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      const s = slots.data?.find((x) => x.id === slotId);
      toast.success(s ? `Rendez-vous reporté au ${fmt(s.starts_at)}.` : "Rendez-vous reporté.");
      qc.invalidateQueries({ queryKey: ["patient"] });
      close();
    },
  });
  const close = () => {
    setSlotId(null);
    move.reset();
    onClose();
  };

  return (
    <Dialog open={!!appointment} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reporter le rendez-vous</DialogTitle>
          <DialogDescription>
            {appointment && (
              <>
                Actuellement le <span className="capitalize">{fmt(appointment.starts_at)}</span>.
                Choisissez un nouveau créneau avec le même praticien.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {move.error && (
          <Alert variant="destructive">
            <AlertDescription>{friendlyError(move.error)}</AlertDescription>
          </Alert>
        )}
        {slots.isLoading ? (
          <ListSkeleton />
        ) : !byDay.length ? (
          <EmptyState title="Aucun créneau libre" message="Ce praticien n'a pas d'autre créneau." />
        ) : (
          <div className="space-y-4">
            {byDay.map(([label, items]) => (
              <div key={label}>
                <p className="mb-2 text-sm font-medium capitalize">{label}</p>
                <div className="flex flex-wrap gap-2">
                  {items.map((s) => (
                    <Button
                      key={s.id}
                      type="button"
                      size="sm"
                      variant={slotId === s.id ? "default" : "outline"}
                      title={s.clinics ? `${s.clinics.name} — ${s.clinics.city}` : undefined}
                      onClick={() => setSlotId(s.id)}
                    >
                      {hour(s.starts_at)} · {s.clinics?.city}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <Button
          className="w-full"
          disabled={!slotId || move.isPending}
          onClick={() => move.mutate()}
        >
          {move.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirmer le report
        </Button>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState, ListSkeleton, Panel } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";
import { periodError, tunisLocalToIso } from "@/lib/absences";

const fmt = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Tunis",
  });

type Conflict = { id: string; starts_at: string; patient: string };
type BlockResult = { absence_id: string; removed_slots: number; conflicts: Conflict[] };

// US-21: block a period (leave, training, absence). The database removes the free slots in it,
// and refuses any new slot or booking during it. Appointments already booked are listed so the
// practitioner can cancel them (the patient is notified) or keep them.
export function AbsencesPanel() {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["practitioner"] });
  };

  const absences = useQuery({
    queryKey: ["practitioner", "absences"],
    queryFn: async () => {
      const { data: pid } = await supabase.rpc("current_practitioner_id");
      if (!pid) return [];
      const { data, error } = await supabase
        .from("practitioner_absences")
        .select("id,starts_at,ends_at,reason")
        .eq("practitioner_id", pid)
        .gte("ends_at", new Date().toISOString())
        .order("starts_at");
      if (error) throw error;
      return data;
    },
  });

  const block = useMutation({
    mutationFn: async () => {
      const start = tunisLocalToIso(from);
      const end = tunisLocalToIso(to);
      const problem = periodError(start, end);
      if (problem) throw new Error(problem);
      const { data, error } = await supabase.rpc("block_period", {
        _starts: start!,
        _ends: end!,
        _reason: reason.trim(),
      });
      if (error) throw error;
      return data as unknown as BlockResult;
    },
    onSuccess: (r) => {
      toast.success(
        `Période bloquée : ${r.removed_slots} créneau(x) libre(s) supprimé(s). Aucun patient ne peut réserver sur cette période.`,
      );
      setConflicts(r.conflicts ?? []);
      setFrom("");
      setTo("");
      setReason("");
      refresh();
    },
  });

  const unblock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("practitioner_absences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Période débloquée. Ajoutez de nouveaux créneaux si vous êtes disponible.");
      refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_appointment", { _id: id });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      toast.success("Rendez-vous annulé : le patient est notifié.");
      setConflicts((c) => c.filter((x) => x.id !== id));
      refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Panel title="Absences et congés">
      <p className="mb-4 text-sm text-muted-foreground">
        Bloquez une période : vos créneaux libres sont retirés et aucun patient ne peut réserver
        pendant ce temps, ni en ligne ni par l'accueil.
      </p>
      {block.error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{friendlyError(block.error)}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="abs-from">Du</Label>
          <Input
            id="abs-from"
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="abs-to">Au</Label>
          <Input
            id="abs-to"
            type="datetime-local"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="abs-reason">Motif (facultatif, non visible des patients)</Label>
          <Input
            id="abs-reason"
            maxLength={200}
            placeholder="Congé, formation, absence…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <Button
        className="mt-4"
        disabled={block.isPending}
        onClick={() => {
          if (
            confirm(
              "Bloquer cette période ? Vos créneaux libres sur cette période seront supprimés.",
            )
          )
            block.mutate();
        }}
      >
        {block.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarOff className="h-4 w-4" />
        )}{" "}
        Bloquer la période
      </Button>

      {conflicts.length > 0 && (
        <Alert className="mt-4">
          <AlertDescription>
            <p className="mb-2 font-medium">
              {conflicts.length} rendez-vous déjà pris sur cette période. Annulez-les (le patient
              est prévenu) ou gardez-les si vous les assurez quand même :
            </p>
            <ul className="divide-y">
              {conflicts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {fmt(c.starts_at)} · {c.patient}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancel.isPending}
                    onClick={() => {
                      if (confirm(`Annuler le rendez-vous de ${c.patient} ?`)) cancel.mutate(c.id);
                    }}
                  >
                    Annuler ce rendez-vous
                  </Button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <h3 className="mb-2 mt-6 text-sm font-semibold">Périodes bloquées à venir</h3>
      {absences.isLoading ? (
        <ListSkeleton rows={2} />
      ) : !absences.data?.length ? (
        <EmptyState icon={CalendarOff} title="Aucune absence prévue" />
      ) : (
        <ul className="divide-y">
          {absences.data.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                Du {fmt(a.starts_at)} au {fmt(a.ends_at)}
                {a.reason ? <span className="text-muted-foreground"> · {a.reason}</span> : null}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Débloquer la période"
                disabled={unblock.isPending}
                onClick={() => {
                  if (confirm("Débloquer cette période ?")) unblock.mutate(a.id);
                }}
              >
                <Trash2 className="h-4 w-4" /> Débloquer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

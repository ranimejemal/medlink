import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/practitioner/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda et disponibilités — MedLink" },
      { name: "description", content: "Définissez vos créneaux de consultation." },
    ],
  }),
  component: AgendaPage,
});

const fmt = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Tunis",
  });
const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function AgendaPage() {
  const qc = useQueryClient();
  const [clinicId, setClinicId] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("12:00");
  const [minutes, setMinutes] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ["practitioner", "me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: p, error } = await supabase
        .from("practitioners")
        .select("id,practitioner_clinics(clinic_id,clinics(id,name,city))")
        .eq("user_id", u.user!.id)
        .maybeSingle();
      if (error) throw error;
      return p;
    },
  });
  const slots = useQuery({
    queryKey: ["practitioner", "slots", me.data?.id],
    enabled: !!me.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_slots")
        .select("id,starts_at,ends_at,is_booked,clinics(name)")
        .eq("practitioner_id", me.data!.id)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  // generate consecutive slots between `from` and `to` (Tunis time, UTC+1, no DST)
  const add = useMutation({
    mutationFn: async () => {
      const cid = clinicId || me.data?.practitioner_clinics[0]?.clinic_id;
      if (!me.data || !cid) throw new Error("Aucune clinique associée.");
      if (!date) throw new Error("Choisissez une date.");
      const start = new Date(`${date}T${from}:00+01:00`).getTime();
      const end = new Date(`${date}T${to}:00+01:00`).getTime();
      if (!(end > start) || minutes < 10 || minutes > 240) throw new Error("INVALID_SLOT");
      const rows = [];
      for (let t = start; t + minutes * 60_000 <= end; t += minutes * 60_000)
        rows.push({
          practitioner_id: me.data.id,
          clinic_id: cid,
          starts_at: new Date(t).toISOString(),
          ends_at: new Date(t + minutes * 60_000).toISOString(),
        });
      if (!rows.length || rows.length > 48) throw new Error("INVALID_SLOT");
      const { error } = await supabase.from("availability_slots").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      setMsg(`${n} créneau(x) ajouté(s).`);
      void qc.invalidateQueries({ queryKey: ["practitioner", "slots"] });
    },
    onError: () => setMsg(null),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("availability_slots")
        .delete()
        .eq("id", id)
        .eq("is_booked", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["practitioner", "slots"] }),
  });

  const err = add.error ?? remove.error;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda et disponibilités"
        description="Ajoutez les créneaux que les patients pourront réserver."
      />
      {me.isLoading ? (
        <ListSkeleton />
      ) : !me.data ? (
        <EmptyState
          title="Profil praticien introuvable"
          message="Votre compte n'est pas encore lié à une fiche praticien. Contactez l'administration."
        />
      ) : (
        <>
          <Panel title="Ajouter des créneaux">
            {err && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>{friendlyError(err)}</AlertDescription>
              </Alert>
            )}
            {msg && (
              <Alert className="mb-3">
                <AlertDescription>{msg}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c">Clinique</Label>
                <select
                  id="c"
                  className={selectCls}
                  value={clinicId}
                  onChange={(e) => setClinicId(e.target.value)}
                >
                  {me.data.practitioner_clinics.map((pc) => (
                    <option key={pc.clinic_id} value={pc.clinic_id}>
                      {pc.clinics?.name} — {pc.clinics?.city}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d">Date</Label>
                <Input
                  id="d"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f">De</Label>
                <Input id="f" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t">À</Label>
                <Input id="t" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m">Durée (min)</Label>
                <Input
                  id="m"
                  type="number"
                  min={10}
                  max={240}
                  step={5}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </div>
            </div>
            <Button className="mt-4" onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Ajouter
            </Button>
          </Panel>
          <Panel title="Mes prochains créneaux">
            {slots.isLoading ? (
              <ListSkeleton />
            ) : !slots.data?.length ? (
              <EmptyState title="Aucun créneau" />
            ) : (
              <ul className="divide-y">
                {slots.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span className="text-sm capitalize">
                      {fmt(s.starts_at)} · {s.clinics?.name}
                    </span>
                    {s.is_booked ? (
                      <span className="text-xs font-medium text-primary">Réservé</span>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Supprimer le créneau"
                        onClick={() => remove.mutate(s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

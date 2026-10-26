import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/patient/appointments/new")({
  head: () => ({
    meta: [
      { title: "Prendre rendez-vous — MedLink" },
      { name: "description", content: "Recherchez un praticien et réservez un créneau." },
    ],
  }),
  component: BookingPage,
});

const ALL = "all";
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Tunis",
  });
const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Tunis",
  });
const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function BookingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState(ALL);
  const [clinic, setClinic] = useState(ALL);
  const [date, setDate] = useState("");
  const [practitionerId, setPractitionerId] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // US-05: practitioners (public read policy) with specialty and clinics
  const refs = useQuery({
    queryKey: ["booking", "refs"],
    queryFn: async () => {
      const [s, c] = await Promise.all([
        supabase.from("specialties").select("id,name").order("name"),
        supabase.from("clinics").select("id,name,city").eq("is_active", true).order("city"),
      ]);
      if (s.error) throw s.error;
      if (c.error) throw c.error;
      return { specialties: s.data, clinics: c.data };
    },
  });
  const pracs = useQuery({
    queryKey: ["booking", "practitioners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practitioners")
        .select(
          "id,title,first_name,last_name,specialty_id,specialties(name),practitioner_clinics(clinic_id)",
        )
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (pracs.data ?? []).filter(
      (p) =>
        (!needle || `${p.first_name} ${p.last_name}`.toLowerCase().includes(needle)) &&
        (specialty === ALL || p.specialty_id === specialty) &&
        (clinic === ALL || p.practitioner_clinics.some((pc) => pc.clinic_id === clinic)),
    );
  }, [pracs.data, q, specialty, clinic]);

  // US-06: free slots of the selected practitioner
  const slots = useQuery({
    queryKey: ["booking", "slots", practitionerId, clinic, date],
    enabled: !!practitionerId,
    queryFn: async () => {
      let query = supabase
        .from("availability_slots")
        .select("id,starts_at,ends_at,clinic_id,clinics(name,city)")
        .eq("practitioner_id", practitionerId!)
        .eq("is_booked", false)
        .gte("starts_at", new Date(Date.now() + 60 * 60_000).toISOString())
        .order("starts_at")
        .limit(200);
      if (clinic !== ALL) query = query.eq("clinic_id", clinic);
      if (date)
        query = query
          .gte("starts_at", new Date(`${date}T00:00:00+01:00`).toISOString())
          .lt("starts_at", new Date(`${date}T23:59:59+01:00`).toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
  const byDay = useMemo(() => {
    const m = new Map<string, NonNullable<typeof slots.data>>();
    for (const s of slots.data ?? [])
      m.set(day(s.starts_at), [...(m.get(day(s.starts_at)) ?? []), s]);
    return [...m.entries()];
  }, [slots.data]);

  // US-07: atomic booking through the book_appointment RPC
  const book = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("book_appointment", {
        _slot_id: slotId!,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["patient"] });
      navigate({ to: "/patient/appointments" });
    },
    onError: () => {
      void slots.refetch();
      setSlotId(null);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prendre rendez-vous"
        description="Choisissez un praticien, un créneau, puis confirmez."
      />
      <Panel title="1. Trouver un praticien">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="q">Nom</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="q"
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={60}
                placeholder="Rechercher…"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp">Spécialité</Label>
            <select
              id="sp"
              className={selectCls}
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            >
              <option value={ALL}>Toutes</option>
              {refs.data?.specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl">Clinique</Label>
            <select
              id="cl"
              className={selectCls}
              value={clinic}
              onChange={(e) => setClinic(e.target.value)}
            >
              <option value={ALL}>Toutes</option>
              {refs.data?.clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.city}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dt">Date</Label>
            <Input
              id="dt"
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4">
          {pracs.isLoading ? (
            <ListSkeleton />
          ) : !filtered.length ? (
            <EmptyState
              title="Aucun praticien trouvé"
              message="Modifiez vos critères de recherche."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPractitionerId(p.id);
                      setSlotId(null);
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted ${practitionerId === p.id ? "border-primary bg-primary/5" : ""}`}
                  >
                    <p className="font-medium">
                      {p.title} {p.first_name} {p.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">{p.specialties?.name}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {practitionerId && (
        <Panel title="2. Choisir un créneau">
          {slots.isLoading ? (
            <ListSkeleton />
          ) : slots.error ? (
            <Alert variant="destructive">
              <AlertDescription>{friendlyError(slots.error)}</AlertDescription>
            </Alert>
          ) : !byDay.length ? (
            <EmptyState
              title="Aucun créneau disponible"
              message="Essayez une autre date ou un autre praticien."
            />
          ) : (
            <div className="space-y-4">
              {byDay.map(([d, list]) => (
                <div key={d}>
                  <p className="mb-2 text-sm font-medium capitalize">{d}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((s) => (
                      <Button
                        key={s.id}
                        type="button"
                        size="sm"
                        variant={slotId === s.id ? "default" : "outline"}
                        onClick={() => setSlotId(s.id)}
                        title={s.clinics ? `${s.clinics.name} — ${s.clinics.city}` : undefined}
                      >
                        {hour(s.starts_at)}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {slotId && (
        <Panel title="3. Confirmer">
          {book.error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{friendlyError(book.error)}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="rs">Motif (facultatif, 500 caractères max)</Label>
            <Textarea
              id="rs"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button className="mt-4" onClick={() => book.mutate()} disabled={book.isPending}>
            {book.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirmer le
            rendez-vous
          </Button>
        </Panel>
      )}
    </div>
  );
}

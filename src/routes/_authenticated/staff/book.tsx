import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/staff/book")({
  head: () => ({
    meta: [
      { title: "Nouveau rendez-vous — MedLink" },
      { name: "description", content: "Prendre un rendez-vous pour un patient qui appelle." },
    ],
  }),
  component: StaffBookPage,
});

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Tunis",
  });

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
};

// US-30: the reception finds the patient who phones, picks a free slot and books it.
// The appointment is marked "pris par l'accueil"; patient and practitioner are notified and the
// confirmation e-mail (US-08) is sent by the scheduled job like for any booking.
function StaffBookPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinic, setClinic] = useState("");
  const [practitioner, setPractitioner] = useState("");
  const [slot, setSlot] = useState("");
  const [reason, setReason] = useState("");

  const search = useQuery({
    queryKey: ["staff", "patients", term],
    enabled: term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_search_patients", { _q: term });
      if (error) throw error;
      return data as Patient[];
    },
  });

  const refs = useQuery({
    queryKey: ["staff", "booking-refs"],
    queryFn: async () => {
      const [c, p] = await Promise.all([
        supabase.from("clinics").select("id,name,city").eq("is_active", true).order("city"),
        supabase
          .from("practitioners")
          .select("id,title,first_name,last_name,specialties(name),practitioner_clinics(clinic_id)")
          .eq("is_active", true)
          .order("last_name"),
      ]);
      if (c.error) throw c.error;
      if (p.error) throw p.error;
      return { clinics: c.data, practitioners: p.data };
    },
  });
  const pracs = (refs.data?.practitioners ?? []).filter(
    (p) => !clinic || p.practitioner_clinics.some((x) => x.clinic_id === clinic),
  );

  const slots = useQuery({
    queryKey: ["staff", "slots", clinic, practitioner],
    enabled: !!clinic && !!practitioner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_slots")
        .select("id,starts_at,ends_at")
        .eq("clinic_id", clinic)
        .eq("practitioner_id", practitioner)
        .eq("is_booked", false)
        .gt("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const recent = useQuery({
    queryKey: ["staff", "booked-by-reception"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id,patient_id,starts_at,status,clinics(name),practitioners(title,last_name)")
        .not("booked_by_staff", "is", null)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      const ids = [...new Set(data.map((a) => a.patient_id))];
      const { data: people } = ids.length
        ? await supabase.from("profiles").select("id,first_name,last_name").in("id", ids)
        : { data: [] as { id: string; first_name: string; last_name: string }[] };
      const names = new Map(
        (people ?? []).map((p) => [p.id, `${p.last_name.toUpperCase()} ${p.first_name}`]),
      );
      return data.map((a) => ({ ...a, patient: names.get(a.patient_id) ?? "Patient" }));
    },
  });

  const book = useMutation({
    mutationFn: async () => {
      if (!patient || !slot) throw new Error("Choisissez le patient et un créneau.");
      const { error } = await supabase.rpc("staff_book_appointment", {
        _patient: patient.id,
        _slot_id: slot,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rendez-vous enregistré. Le patient reçoit la confirmation par e-mail.");
      setSlot("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => {
      toast.error(friendlyError(e));
      qc.invalidateQueries({ queryKey: ["staff", "slots"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouveau rendez-vous"
        description="Pour un patient qui appelle la clinique : le rendez-vous est signalé « pris par l'accueil »."
      />

      <Panel title="1. Patient">
        {patient ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                {patient.last_name.toUpperCase()} {patient.first_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {patient.email}
                {patient.phone ? ` · ${patient.phone}` : ""}
                {patient.date_of_birth
                  ? ` · né(e) le ${new Date(patient.date_of_birth).toLocaleDateString("fr-FR")}`
                  : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPatient(null)}>
              Changer
            </Button>
          </div>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setTerm(q.trim());
              }}
            >
              <Input
                aria-label="Rechercher un patient"
                placeholder="Nom, e-mail ou téléphone (2 caractères minimum)"
                value={q}
                maxLength={100}
                onChange={(e) => setQ(e.target.value)}
              />
              <Button type="submit" variant="outline">
                <Search className="h-4 w-4" /> Rechercher
              </Button>
            </form>
            {term.length >= 2 && (
              <div className="mt-3">
                {search.isLoading ? (
                  <ListSkeleton rows={2} />
                ) : !search.data?.length ? (
                  <EmptyState
                    title="Aucun patient trouvé"
                    message="Le patient doit avoir un compte MedLink. Sinon, invitez-le à s'inscrire."
                  />
                ) : (
                  <ul className="divide-y">
                    {search.data.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                        <span>
                          <span className="font-medium">
                            {p.last_name.toUpperCase()} {p.first_name}
                          </span>{" "}
                          · {p.email}
                          {p.phone ? ` · ${p.phone}` : ""}
                        </span>
                        <Button size="sm" onClick={() => setPatient(p)}>
                          Choisir
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </Panel>

      <Panel title="2. Créneau">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bc">Clinique</Label>
            <select
              id="bc"
              className={selectCls}
              value={clinic}
              onChange={(e) => {
                setClinic(e.target.value);
                setPractitioner("");
                setSlot("");
              }}
            >
              <option value="">— Choisir —</option>
              {refs.data?.clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp">Praticien</Label>
            <select
              id="bp"
              className={selectCls}
              value={practitioner}
              disabled={!clinic}
              onChange={(e) => {
                setPractitioner(e.target.value);
                setSlot("");
              }}
            >
              <option value="">— Choisir —</option>
              {pracs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} {p.first_name} {p.last_name}
                  {p.specialties?.name ? ` (${p.specialties.name})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        {clinic && practitioner && (
          <div className="mt-4">
            {slots.isLoading ? (
              <ListSkeleton rows={2} />
            ) : !slots.data?.length ? (
              <EmptyState title="Aucun créneau libre pour ce praticien dans cette clinique" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.data.map((s) => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant={slot === s.id ? "default" : "outline"}
                    onClick={() => setSlot(s.id)}
                  >
                    {fmtDateTime(s.starts_at)}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="3. Confirmation">
        <div className="space-y-1.5">
          <Label htmlFor="br">Motif (facultatif)</Label>
          <Textarea
            id="br"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button
          className="mt-4"
          disabled={!patient || !slot || book.isPending}
          onClick={() => book.mutate()}
        >
          {book.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Phone className="h-4 w-4" />
          )}{" "}
          Réserver pour le patient
        </Button>
      </Panel>

      <Panel title="Derniers rendez-vous pris par l'accueil">
        {recent.isLoading ? (
          <ListSkeleton rows={2} />
        ) : !recent.data?.length ? (
          <EmptyState title="Aucun pour le moment" />
        ) : (
          <ul className="divide-y">
            {recent.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {fmtDateTime(a.starts_at)} · {a.patient} · {a.practitioners?.title}{" "}
                  {a.practitioners?.last_name} · {a.clinics?.name}
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

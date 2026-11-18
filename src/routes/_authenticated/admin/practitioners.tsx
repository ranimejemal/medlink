import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/practitioners")({
  head: () => ({
    meta: [
      { title: "Praticiens — MedLink" },
      { name: "description", content: "Fiches praticiens et affectation aux cliniques." },
    ],
  }),
  component: PractitionersPage,
});

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const TITLES = ["Dr", "Pr"];

// US-29: the administration creates the practitioner's record (fiche) and assigns him to one or
// more clinics. He can then publish availabilities only in those clinics (RLS), and his account
// is created with an invitation linked to this record (Utilisateurs page).
function PractitionersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "Dr", first_name: "", last_name: "", specialty: "" });

  const data = useQuery({
    queryKey: ["admin", "practitioners"],
    queryFn: async () => {
      const [p, c, s] = await Promise.all([
        supabase
          .from("practitioners")
          .select(
            "id,title,first_name,last_name,user_id,is_active,specialties(name),practitioner_clinics(clinic_id)",
          )
          .order("last_name"),
        supabase.from("clinics").select("id,name,city").order("city"),
        supabase.from("specialties").select("id,name").order("name"),
      ]);
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      if (s.error) throw s.error;
      return { practitioners: p.data, clinics: c.data, specialties: s.data };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "practitioners"] });

  const create = useMutation({
    mutationFn: async () => {
      const first = form.first_name.trim();
      const last = form.last_name.trim();
      if (!first || !last || !form.specialty)
        throw new Error("Prénom, nom et spécialité sont obligatoires.");
      const { error } = await supabase.from("practitioners").insert({
        title: form.title,
        first_name: first.slice(0, 80),
        last_name: last.slice(0, 80),
        specialty_id: form.specialty,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fiche créée. Affectez-la à ses cliniques, puis invitez son compte.");
      setForm({ title: "Dr", first_name: "", last_name: "", specialty: "" });
      refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const assign = useMutation({
    mutationFn: async (v: { practitioner: string; clinic: string; on: boolean }) => {
      const { error } = v.on
        ? await supabase
            .from("practitioner_clinics")
            .insert({ practitioner_id: v.practitioner, clinic_id: v.clinic })
        : await supabase
            .from("practitioner_clinics")
            .delete()
            .eq("practitioner_id", v.practitioner)
            .eq("clinic_id", v.clinic);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  });

  const toggleActive = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("practitioners")
        .update({ is_active: v.active })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Praticiens"
        description="Créez la fiche d'un nouveau praticien et choisissez les cliniques où il exerce."
      />

      <Panel title="Nouvelle fiche praticien">
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="pt">Titre</Label>
            <select
              id="pt"
              className={selectCls}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            >
              {TITLES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf">Prénom</Label>
            <Input
              id="pf"
              maxLength={80}
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pl">Nom</Label>
            <Input
              id="pl"
              maxLength={80}
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ps">Spécialité</Label>
            <select
              id="ps"
              className={selectCls}
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
            >
              <option value="">— Choisir —</option>
              {data.data?.specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button className="mt-4" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}{" "}
          Créer la fiche
        </Button>
      </Panel>

      <Panel title="Affectation aux cliniques">
        {data.isLoading ? (
          <ListSkeleton />
        ) : data.isError ? (
          <EmptyState title="Chargement impossible" message={friendlyError(data.error)} />
        ) : !data.data?.practitioners.length ? (
          <EmptyState title="Aucun praticien" />
        ) : (
          <ul className="divide-y">
            {data.data.practitioners.map((p) => {
              const mine = new Set(p.practitioner_clinics.map((x) => x.clinic_id));
              return (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div>
                    <p className="font-medium">
                      {p.title} {p.first_name} {p.last_name}
                      {!p.is_active && (
                        <span className="ml-2 text-xs text-destructive">inactif</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {p.specialties?.name ?? ""} ·{" "}
                      {p.user_id ? "compte lié" : "pas encore de compte (à inviter)"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {data.data.clinics.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={mine.has(c.id)}
                          disabled={assign.isPending}
                          onCheckedChange={(v) =>
                            assign.mutate({ practitioner: p.id, clinic: c.id, on: v === true })
                          }
                        />
                        {c.city}
                      </label>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive.mutate({ id: p.id, active: !p.is_active })}
                    >
                      {p.is_active ? "Désactiver" : "Réactiver"}
                    </Button>
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

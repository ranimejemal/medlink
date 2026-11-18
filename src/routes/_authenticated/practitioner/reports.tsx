import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";
import { parseValues } from "@/lib/result-values";

export const Route = createFileRoute("/_authenticated/practitioner/reports")({
  head: () => ({
    meta: [
      { title: "Comptes rendus — MedLink" },
      {
        name: "description",
        content: "Rédiger, valider et retrouver vos comptes rendus ; publier des résultats.",
      },
    ],
  }),
  component: ReportsPage,
});

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const MAX = 4000;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Africa/Tunis" });
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  });
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

type Patient = { id: string; name: string };

/** Shared data: my practitioner id, my patients (from my appointments) and my clinics. */
function useMyContext() {
  return useQuery({
    queryKey: ["practitioner", "reports-context"],
    queryFn: async () => {
      const { data: pid } = await supabase.rpc("current_practitioner_id");
      if (!pid) throw new Error("FORBIDDEN");
      const [appts, clinics] = await Promise.all([
        supabase
          .from("appointments")
          .select("id,patient_id,starts_at,status,clinic_id")
          .eq("practitioner_id", pid)
          .neq("status", "cancelled")
          .order("starts_at", { ascending: false })
          .limit(500),
        supabase.from("practitioner_clinics").select("clinics(id,name)").eq("practitioner_id", pid),
      ]);
      if (appts.error) throw appts.error;
      const ids = [...new Set(appts.data.map((a) => a.patient_id))];
      const { data: people } = ids.length
        ? await supabase.from("profiles").select("id,first_name,last_name").in("id", ids)
        : { data: [] as { id: string; first_name: string; last_name: string }[] };
      const names = new Map(
        (people ?? []).map((p) => [p.id, `${p.last_name.toUpperCase()} ${p.first_name}`]),
      );
      const patients: Patient[] = ids
        .map((id) => ({ id, name: names.get(id) ?? "Patient" }))
        .sort((a, b) => a.name.localeCompare(b.name));
      // A report is written after the consultation: only appointments that have started.
      const now = Date.now();
      const pastAppointments = appts.data
        .filter((a) => new Date(a.starts_at).getTime() <= now)
        .map((a) => ({ ...a, patient: names.get(a.patient_id) ?? "Patient" }));
      const myClinics = (clinics.data ?? []).map((c) => c.clinics).filter(Boolean) as {
        id: string;
        name: string;
      }[];
      return { pid: pid as string, patients, names, pastAppointments, myClinics };
    },
  });
}

function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Comptes rendus et résultats"
        description="Rédigez vos comptes rendus, validez-les pour les rendre visibles au patient, et publiez ses résultats d'examens."
      />
      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Comptes rendus</TabsTrigger>
          <TabsTrigger value="results">Résultats d'examens</TabsTrigger>
        </TabsList>
        <TabsContent value="reports" className="mt-4">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="results" className="mt-4">
          <ResultsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------- US-24 / US-26

type ReportForm = {
  id?: string | undefined;
  appointment_id: string;
  patient_id: string;
  reason: string;
  observations: string;
  diagnosis: string;
  prescription: string;
  recommendations: string;
  readOnly?: boolean | undefined;
};
const EMPTY: ReportForm = {
  appointment_id: "",
  patient_id: "",
  reason: "",
  observations: "",
  diagnosis: "",
  prescription: "",
  recommendations: "",
};

function ReportsTab() {
  const qc = useQueryClient();
  const ctx = useMyContext();
  const [form, setForm] = useState<ReportForm | null>(null);
  const [search, setSearch] = useState("");

  const reports = useQuery({
    queryKey: ["practitioner", "reports", ctx.data?.pid],
    enabled: !!ctx.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultation_reports_decrypted")
        .select("*")
        .eq("practitioner_id", ctx.data!.pid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const shown = useMemo(() => {
    const n = norm(search.trim());
    return (reports.data ?? []).filter(
      (r) =>
        !n ||
        norm(ctx.data?.names.get(r.patient_id ?? "") ?? "").includes(n) ||
        norm(r.diagnosis ?? "").includes(n),
    );
  }, [reports.data, search, ctx.data]);

  const save = useMutation({
    mutationFn: async ({ f, validate }: { f: ReportForm; validate: boolean }) => {
      if (!f.patient_id) throw new Error("Choisissez la consultation concernée.");
      if (validate && !f.diagnosis.trim()) throw new Error("DIAGNOSIS_REQUIRED");
      const fields = {
        reason: f.reason.trim(),
        observations: f.observations.trim(),
        diagnosis: f.diagnosis.trim(),
        prescription: f.prescription.trim(),
        recommendations: f.recommendations.trim(),
      };
      let id = f.id;
      if (id) {
        const { error } = await supabase
          .from("consultation_reports")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("consultation_reports")
          .insert({
            ...fields,
            appointment_id: f.appointment_id || null,
            patient_id: f.patient_id,
            practitioner_id: ctx.data!.pid,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
        // If validation fails below, a retry updates this draft instead of creating a second one.
        setForm((prev) => (prev ? { ...prev, id: data.id } : prev));
      }
      if (validate) {
        const { error } = await supabase.rpc("validate_report", { _id: id });
        if (error) throw error;
      }
      return validate;
    },
    onSuccess: (validated) => {
      toast.success(
        validated
          ? "Compte rendu validé : le patient est notifié et peut le télécharger."
          : "Brouillon enregistré.",
      );
      setForm(null);
      qc.invalidateQueries({ queryKey: ["practitioner", "reports"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (ctx.isLoading)
    return (
      <Panel>
        <ListSkeleton />
      </Panel>
    );

  return (
    <Panel
      title="Mes comptes rendus"
      action={
        <Button size="sm" onClick={() => setForm({ ...EMPTY })}>
          <FilePlus2 className="h-4 w-4" /> Nouveau compte rendu
        </Button>
      }
    >
      <Input
        aria-label="Rechercher"
        placeholder="Rechercher un patient ou un diagnostic"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        maxLength={100}
        className="mb-4"
      />
      {reports.isLoading ? (
        <ListSkeleton />
      ) : !shown.length ? (
        <EmptyState
          title="Aucun compte rendu"
          message="Cliquez sur « Nouveau compte rendu » après une consultation."
        />
      ) : (
        <ul className="divide-y">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {ctx.data?.names.get(r.patient_id ?? "") ?? "Patient"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.diagnosis || r.reason || "Sans titre"} ·{" "}
                  {r.validated_at
                    ? `validé le ${fmtDateTime(r.validated_at)}`
                    : `créé le ${fmtDateTime(r.created_at ?? "")}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.status ?? "draft"} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm({
                      id: r.id ?? undefined,
                      appointment_id: r.appointment_id ?? "",
                      patient_id: r.patient_id ?? "",
                      reason: r.reason ?? "",
                      observations: r.observations ?? "",
                      diagnosis: r.diagnosis ?? "",
                      prescription: r.prescription ?? "",
                      recommendations: r.recommendations ?? "",
                      readOnly: r.status === "validated",
                    })
                  }
                >
                  {r.status === "validated" ? "Voir" : "Modifier"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form?.readOnly
                ? "Compte rendu validé"
                : form?.id
                  ? "Modifier le brouillon"
                  : "Nouveau compte rendu"}
            </DialogTitle>
            <DialogDescription>
              {form?.readOnly
                ? "Un compte rendu validé ne peut plus être modifié."
                : "Le patient ne voit le compte rendu qu'après validation. Le diagnostic est obligatoire pour valider."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              {!form.id && (
                <div className="space-y-1.5">
                  <Label htmlFor="appt">Consultation</Label>
                  <select
                    id="appt"
                    className={selectCls}
                    value={form.appointment_id}
                    onChange={(e) => {
                      const a = ctx.data?.pastAppointments.find((x) => x.id === e.target.value);
                      setForm({
                        ...form,
                        appointment_id: e.target.value,
                        patient_id: a?.patient_id ?? "",
                      });
                    }}
                  >
                    <option value="">— Choisir —</option>
                    {ctx.data?.pastAppointments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {fmtDateTime(a.starts_at)} — {a.patient}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(
                [
                  ["reason", "Motif", 2],
                  ["observations", "Observations", 4],
                  ["diagnosis", "Diagnostic *", 2],
                  ["prescription", "Prescription", 3],
                  ["recommendations", "Recommandations", 2],
                ] as const
              ).map(([key, lbl, rows]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{lbl}</Label>
                  <Textarea
                    id={key}
                    rows={rows}
                    maxLength={MAX}
                    readOnly={form.readOnly}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}
          {form && !form.readOnly && (
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() => save.mutate({ f: form, validate: false })}
              >
                Enregistrer le brouillon
              </Button>
              <Button
                disabled={save.isPending}
                onClick={() => {
                  if (
                    confirm(
                      "Valider ce compte rendu ? Il ne pourra plus être modifié et le patient sera notifié.",
                    )
                  )
                    save.mutate({ f: form, validate: true });
                }}
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Valider et publier
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

// ---------------------------------------------------------------- US-25

const CATEGORIES = ["Biologie", "Imagerie", "Cardiologie", "Anatomopathologie", "Autre"];
type ResultForm = {
  patient_id: string;
  clinic_id: string;
  title: string;
  category: string;
  result_date: string;
  summary: string;
  values: string;
};

function ResultsTab() {
  const qc = useQueryClient();
  const ctx = useMyContext();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<ResultForm | null>(null);

  const results = useQuery({
    queryKey: ["practitioner", "results", ctx.data?.pid],
    enabled: !!ctx.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medical_results")
        .select("id,patient_id,title,category,status,result_date")
        .eq("practitioner_id", ctx.data!.pid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const publish = useMutation({
    mutationFn: async (input: { f?: ResultForm; pendingId?: string }) => {
      let id = input.pendingId;
      if (input.f) {
        const f = input.f;
        if (!f.patient_id || !f.title.trim() || !f.summary.trim())
          throw new Error("Patient, titre et résumé sont obligatoires.");
        const { data, error } = await supabase
          .from("medical_results")
          .insert({
            patient_id: f.patient_id,
            practitioner_id: ctx.data!.pid,
            clinic_id: f.clinic_id || null,
            title: f.title.trim().slice(0, 200),
            category: f.category,
            result_date: f.result_date || today,
            summary: f.summary.trim().slice(0, MAX),
            values_json: parseValues(f.values),
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      // validate_result() makes it visible to the patient, notifies him and writes the audit log.
      const { error } = await supabase.rpc("validate_result", { _id: id! });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Résultat publié : le patient est notifié.");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["practitioner", "results"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (ctx.isLoading)
    return (
      <Panel>
        <ListSkeleton />
      </Panel>
    );

  return (
    <Panel
      title="Résultats publiés"
      action={
        <Button
          size="sm"
          onClick={() =>
            setForm({
              patient_id: "",
              clinic_id: ctx.data?.myClinics[0]?.id ?? "",
              title: "",
              category: CATEGORIES[0]!,
              result_date: today,
              summary: "",
              values: "",
            })
          }
        >
          <FlaskConical className="h-4 w-4" /> Publier un résultat
        </Button>
      }
    >
      {results.isLoading ? (
        <ListSkeleton />
      ) : !results.data?.length ? (
        <EmptyState title="Aucun résultat publié" />
      ) : (
        <ul className="divide-y">
          {results.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-muted-foreground">
                  {ctx.data?.names.get(r.patient_id) ?? "Patient"} · {r.category} ·{" "}
                  {fmtDate(r.result_date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.status} />
                {r.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={publish.isPending}
                    onClick={() => publish.mutate({ pendingId: r.id })}
                  >
                    Publier
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Publier un résultat d'examen</DialogTitle>
            <DialogDescription>
              Le résultat apparaît dans l'espace du patient (Mes résultats, Mes documents) et il
              reçoit une notification.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rp">Patient</Label>
                <select
                  id="rp"
                  className={selectCls}
                  value={form.patient_id}
                  onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
                >
                  <option value="">— Choisir —</option>
                  {ctx.data?.patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rt">Titre</Label>
                <Input
                  id="rt"
                  maxLength={200}
                  placeholder="Bilan sanguin complet"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rc">Catégorie</Label>
                <select
                  id="rc"
                  className={selectCls}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rd">Date de l'examen</Label>
                <Input
                  id="rd"
                  type="date"
                  max={today}
                  value={form.result_date}
                  onChange={(e) => setForm({ ...form, result_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rk">Clinique</Label>
                <select
                  id="rk"
                  className={selectCls}
                  value={form.clinic_id}
                  onChange={(e) => setForm({ ...form, clinic_id: e.target.value })}
                >
                  <option value="">—</option>
                  {ctx.data?.myClinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rs">Résumé / interprétation</Label>
                <Textarea
                  id="rs"
                  rows={3}
                  maxLength={MAX}
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rv">Valeurs (facultatif, une par ligne : nom = valeur)</Label>
                <Textarea
                  id="rv"
                  rows={4}
                  maxLength={MAX}
                  placeholder={"Hémoglobine = 13,2 g/dL\nGlycémie à jeun = 0,92 g/L"}
                  value={form.values}
                  onChange={(e) => setForm({ ...form, values: e.target.value })}
                />
              </div>
            </div>
          )}
          {form && (
            <DialogFooter>
              <Button
                disabled={publish.isPending}
                onClick={() => {
                  if (confirm("Publier ce résultat ? Le patient sera notifié."))
                    publish.mutate({ f: form });
                }}
              >
                {publish.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Publier
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

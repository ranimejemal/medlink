import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/medlink/ui";
import { openPatientRecord } from "@/lib/records.functions";
import { fileNumber } from "@/lib/format";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/practitioner/patients/$patientId")({
  head: () => ({
    meta: [
      { title: "Dossier patient — MedLink" },
      { name: "description", content: "Dossier médical du patient reçu en consultation." },
    ],
  }),
  component: PatientRecordPage,
});

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Tunis" });
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  });
const age = (dob: string) =>
  Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));

function PatientRecordPage() {
  const { patientId } = Route.useParams();
  const open = useServerFn(openPatientRecord);

  // US-23: one audit row per opening of the page (gcTime 0 = a new visit logs again).
  const access = useQuery({
    queryKey: ["practitioner", "record-access", patientId],
    queryFn: () => open({ data: { patientId } }),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  if (access.isLoading)
    return (
      <Panel>
        <ListSkeleton />
      </Panel>
    );
  if (!access.data?.allowed)
    return (
      <div className="space-y-6">
        <BackLink />
        <Panel>
          <EmptyState
            icon={Lock}
            title="Accès refusé"
            message="Ce patient n'a pas de rendez-vous avec vous. La tentative a été enregistrée."
          />
        </Panel>
      </div>
    );
  return <RecordContent patientId={patientId} />;
}

function BackLink() {
  return (
    <Link
      to="/practitioner/patients"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" /> Mes patients
    </Link>
  );
}

function RecordContent({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["practitioner", "record", patientId],
    queryFn: async () => {
      const [profile, record, reports, results, appts] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,first_name,last_name,email,phone,date_of_birth")
          .eq("id", patientId)
          .single(),
        supabase
          .from("medical_records_decrypted")
          .select("id,blood_type,allergies,chronic_conditions,current_treatments,updated_at")
          .eq("patient_id", patientId)
          .maybeSingle(),
        supabase
          .from("consultation_reports_decrypted")
          .select("id,status,created_at,validated_at,reason,diagnosis,prescription")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("medical_results_decrypted")
          .select("id,title,category,status,result_date,summary")
          .eq("patient_id", patientId)
          .order("result_date", { ascending: false }),
        supabase
          .from("appointments")
          .select("id,starts_at,status,reason,clinics(name)")
          .eq("patient_id", patientId)
          .order("starts_at", { ascending: false }),
      ]);
      for (const r of [profile, record, reports, results, appts]) if (r.error) throw r.error;
      return {
        profile: profile.data!,
        record: record.data,
        reports: reports.data ?? [],
        results: results.data ?? [],
        appts: appts.data ?? [],
      };
    },
  });

  // Close a past appointment: Terminé or Absent (complete_appointment checks it is mine).
  const close = useMutation({
    mutationFn: async (v: { id: string; status: "completed" | "no_show" }) => {
      const { error } = await supabase.rpc("complete_appointment", {
        _id: v.id,
        _status: v.status,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["practitioner"] }),
  });

  if (data.isLoading)
    return (
      <Panel>
        <ListSkeleton />
      </Panel>
    );
  if (data.isError || !data.data)
    return (
      <Panel>
        <EmptyState title="Dossier indisponible" message="Veuillez réessayer plus tard." />
      </Panel>
    );

  const { profile, record, reports, results, appts } = data.data;
  const now = Date.now();
  const facts: [string, string | null | undefined][] = [
    ["Groupe sanguin", record?.blood_type],
    ["Allergies", record?.allergies],
    ["Antécédents et maladies chroniques", record?.chronic_conditions],
    ["Traitements en cours", record?.current_treatments],
  ];

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader
        title={`${profile.last_name.toUpperCase()} ${profile.first_name}`}
        description={[
          record?.id ? `Dossier n° ${fileNumber(record.id)}` : null,
          profile.date_of_birth ? `${age(profile.date_of_birth)} ans` : null,
          profile.phone,
          profile.email,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-success" /> Accès enregistré dans le journal d'audit.
      </p>

      <Panel title="Dossier médical">
        <dl className="grid gap-4 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 whitespace-pre-line text-sm">{value || "Non renseigné"}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Rendez-vous avec vous">
        {close.error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{friendlyError(close.error)}</AlertDescription>
          </Alert>
        )}
        {!appts.length ? (
          <EmptyState title="Aucun rendez-vous" />
        ) : (
          <ul className="divide-y">
            {appts.map((a) => {
              const toClose =
                (a.status === "scheduled" || a.status === "confirmed") &&
                new Date(a.starts_at).getTime() < now;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{fmtDateTime(a.starts_at)}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.clinics?.name}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={a.status} />
                    {toClose && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={close.isPending}
                          onClick={() => close.mutate({ id: a.id, status: "completed" })}
                        >
                          Terminé
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={close.isPending}
                          onClick={() => close.mutate({ id: a.id, status: "no_show" })}
                        >
                          Absent
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Comptes rendus">
        {!reports.length ? (
          <EmptyState title="Aucun compte rendu" />
        ) : (
          <ul className="divide-y">
            {reports.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{r.created_at && fmtDate(r.created_at)}</p>
                  {r.status && <StatusBadge status={r.status} />}
                </div>
                {r.reason && <p className="mt-1 text-sm">Motif : {r.reason}</p>}
                {r.diagnosis && <p className="text-sm">Diagnostic : {r.diagnosis}</p>}
                {r.prescription && (
                  <p className="text-sm text-muted-foreground">Prescription : {r.prescription}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Résultats d'examens">
        {!results.length ? (
          <EmptyState title="Aucun résultat" />
        ) : (
          <ul className="divide-y">
            {results.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {r.title} <span className="text-muted-foreground">· {r.category}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {r.result_date && fmtDate(r.result_date)}
                    </span>
                    {r.status && <StatusBadge status={r.status} />}
                  </div>
                </div>
                {r.summary && <p className="mt-1 text-sm">{r.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

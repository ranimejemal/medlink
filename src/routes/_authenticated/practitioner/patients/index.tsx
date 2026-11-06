import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/medlink/ui";
import { fileNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/practitioner/patients/")({
  head: () => ({
    meta: [
      { title: "Mes patients — MedLink" },
      { name: "description", content: "Les patients que vous avez reçus ou allez recevoir." },
    ],
  }),
  component: PatientsPage,
});

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Africa/Tunis" });

// Lower-case and strip accents so "helene" finds "Hélène".
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// US-22: "my patients" = patients with at least one appointment with me. RLS (is_my_patient)
// only returns those profiles, so another practitioner's patients never appear.
function PatientsPage() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["practitioner", "patients"],
    queryFn: async () => {
      // Only my own appointments, even if the account also has another role.
      const { data: pid } = await supabase.rpc("current_practitioner_id");
      if (!pid) return [];
      const { data: appts, error } = await supabase
        .from("appointments")
        .select("patient_id,starts_at,status")
        .eq("practitioner_id", pid)
        .order("starts_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const ids = [...new Set(appts.map((a) => a.patient_id))];
      if (!ids.length) return [];
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id,first_name,last_name,email,phone").in("id", ids),
        supabase.from("medical_records").select("id,patient_id").in("patient_id", ids),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      const records = new Map(r.data.map((x) => [x.patient_id, x.id]));
      const now = Date.now();
      return p.data
        .map((pr) => {
          const mine = appts.filter((a) => a.patient_id === pr.id && a.status !== "cancelled");
          const next = mine
            .filter((a) => new Date(a.starts_at).getTime() > now)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
          const last = mine.find((a) => new Date(a.starts_at).getTime() <= now);
          const recordId = records.get(pr.id);
          return {
            ...pr,
            file: recordId ? fileNumber(recordId) : "—",
            next: next?.starts_at,
            last: last?.starts_at,
          };
        })
        .sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
        );
    },
  });

  const shown = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return list.data ?? [];
    return (list.data ?? []).filter(
      (p) =>
        norm(`${p.first_name} ${p.last_name}`).includes(n) ||
        norm(`${p.last_name} ${p.first_name}`).includes(n) ||
        p.file.toLowerCase().includes(n),
    );
  }, [list.data, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes patients"
        description="Recherchez un patient par nom ou par numéro de dossier."
      />
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, prénom ou n° de dossier"
          className="pl-9"
          aria-label="Rechercher un patient"
        />
      </div>
      <Panel>
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError ? (
          <EmptyState title="Liste indisponible" message="Veuillez réessayer plus tard." />
        ) : !shown.length ? (
          <EmptyState
            title={q ? "Aucun patient trouvé" : "Aucun patient pour le moment"}
            message={
              q
                ? "Vérifiez l'orthographe ou le numéro de dossier."
                : "Vos patients apparaissent ici dès leur premier rendez-vous avec vous."
            }
          />
        ) : (
          <ul className="divide-y">
            {shown.map((p) => (
              <li key={p.id}>
                <Link
                  to="/practitioner/patients/$patientId"
                  params={{ patientId: p.id }}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">
                      {p.last_name.toUpperCase()} {p.first_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Dossier n° {p.file}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-right text-xs text-muted-foreground">
                    <div>
                      {p.next && <p>Prochain RDV : {fmtDate(p.next)}</p>}
                      {p.last && <p>Dernier RDV : {fmtDate(p.last)}</p>}
                    </div>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

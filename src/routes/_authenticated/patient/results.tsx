import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/medlink/ui";

export const Route = createFileRoute("/_authenticated/patient/results")({
  head: () => ({
    meta: [
      { title: "Mes résultats — MedLink" },
      { name: "description", content: "Vos résultats d'examens validés par le praticien." },
    ],
  }),
  component: ResultsPage,
});

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Tunis" });

// values_json is free-form: show flat key/value pairs, anything nested as JSON text.
const show = (v: unknown) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));

// US-13: RLS only returns the patient's own results, and only once validated.
// The view decrypts the content (US-43).
function ResultsPage() {
  const q = useQuery({
    queryKey: ["patient", "results"],
    queryFn: async () => {
      const { data: results, error } = await supabase
        .from("medical_results_decrypted")
        .select("id,title,category,result_date,summary,values_json,practitioner_id,clinic_id")
        .order("result_date", { ascending: false });
      if (error) throw error;
      const pIds = [...new Set(results.map((r) => r.practitioner_id).filter(Boolean))] as string[];
      const cIds = [...new Set(results.map((r) => r.clinic_id).filter(Boolean))] as string[];
      const [p, c] = await Promise.all([
        pIds.length
          ? supabase.from("practitioners").select("id,title,first_name,last_name").in("id", pIds)
          : { data: [] as { id: string; title: string; first_name: string; last_name: string }[] },
        cIds.length
          ? supabase.from("clinics").select("id,name").in("id", cIds)
          : { data: [] as { id: string; name: string }[] },
      ]);
      const prac = new Map(
        (p.data ?? []).map((x) => [x.id, `${x.title} ${x.first_name} ${x.last_name}`]),
      );
      const clin = new Map((c.data ?? []).map((x) => [x.id, x.name]));
      return results.map((r) => ({
        ...r,
        practitioner: r.practitioner_id ? prac.get(r.practitioner_id) : undefined,
        clinic: r.clinic_id ? clin.get(r.clinic_id) : undefined,
      }));
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes résultats"
        description="Seuls les résultats validés par votre praticien apparaissent ici."
      />
      {q.isLoading ? (
        <Panel>
          <ListSkeleton />
        </Panel>
      ) : q.isError ? (
        <Panel>
          <EmptyState title="Résultats indisponibles" message="Veuillez réessayer plus tard." />
        </Panel>
      ) : !q.data?.length ? (
        <Panel>
          <EmptyState
            title="Aucun résultat pour le moment"
            message="Vous serez notifié dès qu'un résultat sera publié."
          />
        </Panel>
      ) : (
        q.data.map((r) => {
          const values =
            r.values_json && typeof r.values_json === "object" && !Array.isArray(r.values_json)
              ? Object.entries(r.values_json)
              : [];
          return (
            <Panel key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <FlaskConical className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">{r.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {r.category}
                      {r.practitioner ? ` · ${r.practitioner}` : ""}
                      {r.clinic ? ` · ${r.clinic}` : ""}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.result_date ? fmtDate(r.result_date) : ""}
                </p>
              </div>
              {r.summary && <p className="mt-4 text-sm">{r.summary}</p>}
              {values.length > 0 && (
                <table className="mt-4 w-full text-sm">
                  <tbody className="divide-y">
                    {values.map(([k, v]) => (
                      <tr key={k}>
                        <td className="py-2 pr-4 text-muted-foreground">{k}</td>
                        <td className="py-2 font-medium">{show(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          );
        })
      )}
    </div>
  );
}

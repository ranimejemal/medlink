import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, FlaskConical, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/medlink/ui";
import { downloadDocument } from "@/lib/documents.functions";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/patient/documents")({
  head: () => ({
    meta: [
      { title: "Mes documents — MedLink" },
      { name: "description", content: "Téléchargez vos comptes rendus et résultats validés." },
    ],
  }),
  component: DocumentsPage,
});

type Doc = {
  kind: "report" | "result";
  id: string;
  title: string;
  subtitle: string;
  date: string;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Tunis" });

// US-14: RLS only returns the patient's own documents, and only once validated.
function DocumentsPage() {
  const download = useServerFn(downloadDocument);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["patient", "documents"],
    queryFn: async (): Promise<Doc[]> => {
      const [reports, results] = await Promise.all([
        supabase
          .from("consultation_reports")
          .select("id,validated_at,practitioner_id")
          .eq("status", "validated"),
        supabase
          .from("medical_results")
          .select("id,title,category,result_date,practitioner_id")
          .eq("status", "validated"),
      ]);
      if (reports.error) throw reports.error;
      if (results.error) throw results.error;
      const ids = [
        ...new Set(
          [...reports.data, ...results.data].map((d) => d.practitioner_id).filter(Boolean),
        ),
      ] as string[];
      const { data: prs } = ids.length
        ? await supabase.from("practitioners").select("id,title,last_name").in("id", ids)
        : { data: [] as { id: string; title: string; last_name: string }[] };
      const name = new Map((prs ?? []).map((p) => [p.id, `${p.title} ${p.last_name}`]));
      const docs: Doc[] = [
        ...reports.data.map((r) => ({
          kind: "report" as const,
          id: r.id,
          title: "Compte rendu de consultation",
          subtitle: name.get(r.practitioner_id) ?? "",
          date: r.validated_at ?? "",
        })),
        ...results.data.map((r) => ({
          kind: "result" as const,
          id: r.id,
          title: r.title,
          subtitle: [r.category, r.practitioner_id ? name.get(r.practitioner_id) : ""]
            .filter(Boolean)
            .join(" · "),
          date: r.result_date,
        })),
      ];
      return docs.sort((a, b) => b.date.localeCompare(a.date));
    },
  });

  async function onDownload(d: Doc) {
    setBusy(d.id);
    try {
      const file = await download({ data: { kind: d.kind, id: d.id } });
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(friendlyError(e, "Téléchargement impossible. Veuillez réessayer."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes documents"
        description="Vos comptes rendus et résultats validés, à télécharger en PDF."
      />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Transmission chiffrée. Chaque téléchargement est enregistré dans le journal d'audit.
      </p>
      <Panel>
        {q.isLoading ? (
          <ListSkeleton />
        ) : q.isError ? (
          <EmptyState title="Documents indisponibles" message="Veuillez réessayer plus tard." />
        ) : !q.data?.length ? (
          <EmptyState
            icon={FileText}
            title="Aucun document pour le moment"
            message="Vos comptes rendus et résultats apparaîtront ici une fois validés par votre praticien."
          />
        ) : (
          <ul className="divide-y">
            {q.data.map((d) => {
              const Icon = d.kind === "report" ? FileText : FlaskConical;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {[d.subtitle, d.date ? fmtDate(d.date) : ""].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => onDownload(d)}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    {busy === d.id ? "Préparation…" : "Télécharger"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

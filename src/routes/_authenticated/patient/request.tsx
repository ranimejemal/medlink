import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader, Panel } from "@/components/medlink/ui";
import { Pill, URGENCY } from "@/components/medlink/RoleLayout";
import { submitAppointmentRequest } from "@/lib/requests.functions";

export const Route = createFileRoute("/_authenticated/patient/request")({
  head: () => ({
    meta: [
      { title: "Demande de rendez-vous — MedLink" },
      {
        name: "description",
        content: "Décrivez votre besoin, notre équipe prépare votre rendez-vous.",
      },
    ],
  }),
  component: RequestPage,
});

type Done = Extract<Awaited<ReturnType<typeof submitAppointmentRequest>>, { ok: true }>;

function RequestPage() {
  const submit = useServerFn(submitAppointmentRequest);
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (notes.trim().length < 10)
      return setError("Décrivez votre besoin en quelques phrases (10 caractères minimum).");
    setError(null);
    setLoading(true);
    try {
      const res = await submit({ data: { notes } });
      if (!res.ok) return setError(res.error);
      setDone(res);
      qc.invalidateQueries({ queryKey: ["patient", "requests"] });
    } catch {
      setError("Le service est momentanément indisponible. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    const s = done.structured;
    return (
      <div className="space-y-6">
        <PageHeader
          title="Demande envoyée"
          description="Notre équipe va l'examiner et vous recontacter."
        />
        <Panel>
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Voici ce que l'équipe recevra</span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Résumé</dt>
              <dd>{s.summary}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Urgence estimée</dt>
              <dd>
                <Pill v={URGENCY[s.urgency]} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Spécialité suggérée</dt>
              <dd>{s.suggested_specialty ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Symptômes</dt>
              <dd>{s.symptoms.join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Depuis</dt>
              <dd>{s.duration ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Disponibilités</dt>
              <dd>{s.preferred_timing ?? "—"}</dd>
            </div>
          </dl>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link to="/patient/dashboard">Retour au tableau de bord</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDone(null);
                setNotes("");
              }}
            >
              Nouvelle demande
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demande de rendez-vous"
        description="Expliquez avec vos mots pourquoi vous souhaitez consulter. Notre assistant prépare une demande claire pour l'équipe d'accueil."
      />
      <Panel>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Votre besoin</Label>
            <Textarea
              id="notes"
              rows={8}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex. : J'ai mal au genou droit depuis deux semaines après une chute, surtout en montant les escaliers. Je suis disponible les matins en semaine à Sousse."
            />
            <p className="text-xs text-muted-foreground">
              {notes.length}/4000 · En cas d'urgence vitale, appelez le 190 (SAMU).
            </p>
          </div>
          <Button type="submit" className="h-11" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}{" "}
            {loading ? "Analyse en cours…" : "Envoyer ma demande"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}

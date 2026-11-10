import { isValidMaintenancePeriod } from "@/lib/maintenance-validation";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Wrench } from "lucide-react";
import { PageHeader, Panel } from "@/components/medlink/ui";

export const Route = createFileRoute("/_authenticated/admin/maintenance")({
  component: MaintenancePage,
});

type MaintenanceDraft = {
  title: string;
  message: string;
  startsAt: string;
  endsAt: string;
};

function MaintenancePage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [draft, setDraft] = useState<MaintenanceDraft | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  function validateAnnouncement(): MaintenanceDraft | null {
    setError("");
    setSuccess("");

    if (!title.trim() || !message.trim() || !startsAt || !endsAt) {
      setError("Veuillez remplir tous les champs.");
      return null;
    }

    if (!isValidMaintenancePeriod(startsAt, endsAt)) {
      setError("La date de fin doit être après la date de début.");
      return null;
    }

    return {
      title: title.trim(),
      message: message.trim(),
      startsAt,
      endsAt,
    };
  }

  function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const announcement = validateAnnouncement();

    if (!announcement) {
      setDraft(null);
      return;
    }

    setDraft(announcement);
  }

  async function handlePublish() {
    const announcement = validateAnnouncement();

    if (!announcement || isPublishing) {
      return;
    }

    setIsPublishing(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setError("Veuillez vous connecter avant de publier.");
        return;
      }

      const { data: aalData, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (aalError || aalData?.currentLevel !== "aal2") {
        setError("La validation MFA est obligatoire pour publier une annonce.");
        return;
      }

      const { error: insertError } = await supabase.from("maintenance_announcements").insert({
        title: announcement.title,
        message: announcement.message,
        starts_at: new Date(announcement.startsAt).toISOString(),
        ends_at: new Date(announcement.endsAt).toISOString(),
        is_active: true,
      });

      if (insertError) {
        console.error("Erreur Supabase maintenance :", insertError);
        setError(
          "Publication impossible. Vérifiez vos droits administrateur et votre session MFA.",
        );
        return;
      }

      setDraft(announcement);
      setSuccess("L'annonce de maintenance a été publiée avec succès !");

      setTitle("");
      setMessage("");
      setStartsAt("");
      setEndsAt("");
    } catch (err) {
      console.error("Erreur publication maintenance :", err);
      setError("Une erreur inattendue est survenue.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance annoncée"
        description="Planifier et gérer les annonces de maintenance."
      />

      <Panel title="Nouvelle annonce de maintenance">
        <form onSubmit={handlePreview} className="space-y-4">
          <div>
            <label htmlFor="maintenance-title" className="mb-1 block text-sm font-medium">
              Titre
            </label>

            <input
              id="maintenance-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Maintenance programmée"
              maxLength={120}
              required
              className="w-full rounded-lg border bg-background p-3"
            />
          </div>

          <div>
            <label htmlFor="maintenance-message" className="mb-1 block text-sm font-medium">
              Message
            </label>

            <textarea
              id="maintenance-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Une maintenance est prévue pour améliorer les services."
              maxLength={2000}
              rows={4}
              required
              className="w-full rounded-lg border bg-background p-3"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="maintenance-start" className="mb-1 block text-sm font-medium">
                Date et heure de début
              </label>

              <input
                id="maintenance-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
                className="w-full rounded-lg border bg-background p-3"
              />
            </div>

            <div>
              <label htmlFor="maintenance-end" className="mb-1 block text-sm font-medium">
                Date et heure de fin
              </label>

              <input
                id="maintenance-end"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
                className="w-full rounded-lg border bg-background p-3"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {success && (
            <p role="status" className="text-sm text-green-600">
              {success}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isPublishing}
              className="rounded-lg border px-5 py-3 font-medium disabled:opacity-50"
            >
              Prévisualiser l'annonce
            </button>

            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing}
              className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-50"
            >
              {isPublishing ? "Publication en cours..." : "Publier dans Supabase"}
            </button>
          </div>
        </form>
      </Panel>

      {draft && (
        <Panel title="Aperçu de l'annonce">
          <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              <h3 className="font-semibold">{draft.title}</h3>
            </div>

            <p className="whitespace-pre-wrap text-sm">{draft.message}</p>

            <p className="text-sm">Début : {new Date(draft.startsAt).toLocaleString("fr-FR")}</p>

            <p className="text-sm">Fin : {new Date(draft.endsAt).toLocaleString("fr-FR")}</p>

            <p className="text-xs text-muted-foreground">Aperçu de l'annonce de maintenance.</p>
          </div>
        </Panel>
      )}
    </div>
  );
}

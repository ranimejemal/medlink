import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader, Panel } from "@/components/medlink/ui";
import { deleteMyAccount } from "@/lib/privacy.functions";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/patient/privacy")({
  head: () => ({
    meta: [
      { title: "Mes données — MedLink" },
      { name: "description", content: "Exportez vos données ou supprimez votre compte." },
    ],
  }),
  component: PrivacyPage,
});

// US-16: right of access (export) and right to erasure (account deletion).
function PrivacyPage() {
  const navigate = useNavigate();
  const remove = useServerFn(deleteMyAccount);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("export_my_data");
      if (error) throw error;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `medlink-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Vos données ont été téléchargées.");
    } catch (e) {
      toast.error(friendlyError(e, "Export impossible. Veuillez réessayer."));
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await remove({ data: { confirm: "SUPPRIMER" } });
      await supabase.auth.signOut().catch(() => undefined);
      toast.success("Votre compte a été supprimé.");
      await navigate({ to: "/" });
    } catch (e) {
      toast.error(friendlyError(e, "La suppression a échoué. Veuillez réessayer."));
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes données"
        description="Téléchargez une copie de vos données ou supprimez votre compte."
      />

      <Panel title="Exporter mes données">
        <p className="text-sm text-muted-foreground">
          Un fichier JSON contenant votre profil, votre dossier médical, vos rendez-vous, vos
          comptes rendus et résultats validés, vos documents (liste), vos demandes et l'historique
          de vos connexions sur 12 mois.
        </p>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Le fichier contient des données de santé : conservez-le dans un endroit sûr.
        </p>
        <Button className="mt-4" onClick={exportData} disabled={exporting}>
          <Download className="mr-1 h-4 w-4" />
          {exporting ? "Préparation…" : "Télécharger mes données"}
        </Button>
      </Panel>

      <Panel title="Supprimer mon compte" className="border-destructive/40">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Vos rendez-vous à venir sont annulés et les praticiens prévenus.</li>
          <li>Vos documents déposés, notifications et demandes sont effacés.</li>
          <li>Votre nom, e-mail, téléphone et date de naissance sont effacés.</li>
          <li>
            Les comptes rendus et résultats médicaux sont conservés, comme l'exige la loi pour le
            dossier médical, mais ne sont plus reliés à votre identité.
          </li>
          <li>Cette action est définitive. Pensez à exporter vos données avant.</li>
        </ul>
        <Button variant="destructive" className="mt-4" onClick={() => setOpen(true)}>
          <Trash2 className="mr-1 h-4 w-4" />
          Supprimer mon compte
        </Button>
      </Panel>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (!deleting) {
            setOpen(o);
            setConfirm("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement votre compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Pour confirmer, tapez <strong>SUPPRIMER</strong> ci-dessous.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="confirm-delete">Confirmation</Label>
            <Input
              id="confirm-delete"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirm !== "SUPPRIMER" || deleting}
              onClick={deleteAccount}
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

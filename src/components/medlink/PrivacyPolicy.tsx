import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Stored with the patient's consent (profiles.consent_version). Change it when the text below changes.
export const PRIVACY_POLICY_VERSION = "2026-11";

// US-04: the data protection policy shown before the patient consents.
export function PrivacyPolicyDialog() {
  return (
    <Dialog>
      <DialogTrigger className="font-medium text-primary hover:underline">
        Lire la politique
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Protection de vos données personnelles</DialogTitle>
          <DialogDescription>Version {PRIVACY_POLICY_VERSION}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Responsable du traitement :</span> le
            réseau de cliniques MedLink (Sousse, Sfax, Tunis), conformément à la loi organique n°
            2004-63 du 27 juillet 2004 et sous le contrôle de l'Instance nationale de protection des
            données personnelles (INPDP).
          </p>
          <p>
            <span className="font-medium text-foreground">Données traitées :</span> identité,
            coordonnées, rendez-vous, et les données de santé saisies par vos praticiens (dossier,
            comptes rendus, résultats d'examens).
          </p>
          <p>
            <span className="font-medium text-foreground">Finalités :</span> la prise de
            rendez-vous, votre suivi médical dans les cliniques MedLink et l'envoi de confirmations
            et de rappels.
          </p>
          <p>
            <span className="font-medium text-foreground">Qui y accède :</span> vous ; les
            praticiens qui vous ont reçu en consultation ; le personnel administratif pour la
            gestion des rendez-vous, sans accès à votre dossier médical. Chaque accès à un dossier
            est enregistré.
          </p>
          <p>
            <span className="font-medium text-foreground">Sécurité :</span> connexion chiffrée,
            données médicales chiffrées en base, double authentification des praticiens.
          </p>
          <p>
            <span className="font-medium text-foreground">Vos droits :</span> accès, rectification,
            opposition, export et suppression de vos données, auprès de l'administration de la
            clinique.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

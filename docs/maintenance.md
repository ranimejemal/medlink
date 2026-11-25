# US-38 — Maintenance annoncée

## Objectif

Permettre à un administrateur MedLink de préparer une annonce de maintenance programmée et d'informer les utilisateurs de la plateforme.

## Fonctionnement

1. L'administrateur (connecté avec la double authentification) ouvre `/admin/maintenance`.
2. Il renseigne le titre, le message, la date de début et la date de fin, puis prévisualise.
3. Le formulaire vérifie que tous les champs sont remplis et que la fin est après le début.
4. « Publier » enregistre l'annonce dans la table Supabase `maintenance_announcements`.
5. Pendant la période, tous les utilisateurs connectés voient la bannière (`MaintenanceBanner`,
   rechargée toutes les 60 secondes).

## Sécurité

- RLS : tout utilisateur connecté lit les annonces actives ; seul un administrateur **avec MFA (AAL2)**
  peut créer, modifier ou supprimer (policies `maintenance_insert/update/delete`).
- La page vérifie aussi le niveau MFA avant d'envoyer l'annonce (message clair si absent).

## Horaires du portail (US-49)

La même page contient le réglage **Horaires du portail** : ouverture 6 h, fermeture 22 h (heure de Tunis).
Hors horaires, une bannière l'explique et la base refuse toute nouvelle réservation (`PORTAL_CLOSED`).
L'administrateur peut changer les heures ou désactiver la règle (par exemple pour une démonstration) ;
chaque changement est écrit dans le journal d'audit (`portal.hours_changed`).

## État

- Migration `20261110000000_maintenance_announcements.sql` appliquée en production.
- Publication réelle depuis l'interface administrateur, bannière lue depuis Supabase.
- `src/lib/maintenance-demo.ts` (stockage `localStorage`) ne sert plus qu'aux tests unitaires.

## Fichiers concernés

- `src/routes/_authenticated/admin/maintenance.tsx`
- `src/components/medlink/MaintenanceBanner.tsx`
- `src/components/medlink/PortalHours.tsx` (US-49)
- `src/lib/maintenance-validation.ts`
- `supabase/migrations/20261110000000_maintenance_announcements.sql`
- `supabase/migrations/20261126000000_data_rights_portal_hours.sql` (US-49)

## Tests

- `npx tsc --noEmit`, `npm test` (`maintenance.test.ts`, `maintenance-storage.test.ts`, `portal-hours.test.ts`).
- Recette : voir `docs/tests.md` (lignes US-38 et US-49).

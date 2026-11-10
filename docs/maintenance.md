# US-38 — Maintenance annoncée

## Objectif

Permettre à un administrateur MedLink de préparer une annonce de maintenance programmée et d'informer les utilisateurs de la plateforme.

## Fonctionnement prévu

1. L'administrateur accède à la page `/admin/maintenance`.
2. Il renseigne le titre, le message, la date de début et la date de fin.
3. Le formulaire vérifie que tous les champs sont remplis et que la date de fin est postérieure à la date de début.
4. L'annonce est affichée sous forme de bannière informative aux utilisateurs.
5. À terme, les annonces seront enregistrées dans Supabase et partagées entre les sessions.

## État actuel du développement

- Page d'administration créée.
- Formulaire de maintenance implémenté.
- Prévisualisation locale disponible.
- Composant `MaintenanceBanner` intégré dans l'interface.
- Affichage de la bannière testé sur le tableau de bord Patient.
- Stockage de démonstration avec `localStorage`, uniquement en environnement de développement.

## Limites actuelles

Le formulaire administrateur n'a pas encore été testé avec un compte administrateur autorisé.

Le stockage local n'est pas partagé entre navigateurs, appareils ou utilisateurs.

La migration SQL a été préparée mais n'a pas encore été appliquée à Supabase.

Aucune annonce réelle n'est publiée en production.

## Fichiers concernés

- `src/routes/_authenticated/admin/maintenance.tsx`
- `src/components/medlink/MaintenanceBanner.tsx`
- `src/components/medlink/AppShell.tsx`
- `src/lib/maintenance-demo.ts`
- `supabase/migrations/20261110000000_maintenance_announcements.sql`

## Tests réalisés

- Vérification TypeScript : `npx tsc --noEmit` — réussie.
- Affichage de la bannière sur le tableau de bord Patient — réussi avec une annonce fictive.

## Travaux restants

- Obtenir l'accès au projet Supabase de l'équipe.
- Vérifier et appliquer la migration dans un environnement autorisé.
- Connecter le formulaire et la bannière aux données Supabase.
- Tester les permissions administrateur et les règles RLS.
- Tester la création, la modification et la désactivation des annonces.
- Vérifier le comportement avant, pendant et après la période de maintenance.
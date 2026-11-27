# Tests et recette — US-62, US-64, US-52

## 1. Tests automatiques

| Niveau                 | Outil                      | Commande                        | Résultat attendu            |
| ---------------------- | -------------------------- | ------------------------------- | --------------------------- |
| Unitaires / composants | Vitest + Testing Library   | `npm test`                      | 10 fichiers, 31 tests verts |
| Types                  | TypeScript                 | `npx tsc --noEmit`              | aucune erreur               |
| Qualité                | ESLint                     | `npm run lint`                  | 0 erreur                    |
| Secrets                | `scripts/check-secrets.sh` | `bash scripts/check-secrets.sh` | « No secret found »         |
| **RBAC (US-62)**       | SQL, base locale           | voir ci-dessous                 | `ALL RBAC TESTS PASSED`     |
| Sécurité (US-60)       | OWASP ZAP                  | voir `docs/securite-zap.md`     | 0 alerte haute              |

La CI GitHub (`.github/workflows/ci.yml`) lance secrets, types, lint, tests et build sur chaque PR :
une PR rouge ne doit pas être fusionnée.

## 2. Tests RBAC automatisés (US-62)

Le fichier `supabase/tests/rbac.sql` vérifie **49 règles** en se connectant successivement comme
visiteur anonyme, patient, praticien sans MFA, praticien avec MFA, autre praticien, accueil,
administrateur sans MFA et administrateur avec MFA. Il passe par les mêmes règles que l'API
(RLS, fonctions `SECURITY DEFINER`, niveau MFA `aal2`) et annule tout à la fin (`rollback`).

**Ne jamais le lancer sur la production.** Sur la base locale (Docker Desktop lancé) :

```powershell
npx supabase start
npx supabase db reset
cmd /c "docker exec -i supabase_db_lmocoknimijxqegbxbyg psql -U postgres -v ON_ERROR_STOP=1 < supabase\tests\rbac.sql"
```

(Le nom du conteneur vient de `project_id` dans `supabase/config.toml` ; vérifiez-le avec `docker ps`.)

Sur le cluster Kubernetes de démo (`scripts/k8s-up.ps1`), contre la base **primaire** :

```powershell
$p = kubectl -n medlink get cluster medlink-db -o jsonpath='{.status.currentPrimary}'
Get-Content supabase\tests\rbac.sql | kubectl -n medlink exec -i $p -c postgres -- psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Résultat attendu : `ALL RBAC TESTS PASSED` (vérifié le 26/11/2026 sur le cluster de test).

### Matrice vérifiée

| Action                                          | Anonyme | Patient | Praticien sans MFA | Praticien MFA |   Accueil   | Admin sans MFA | Admin MFA |
| ----------------------------------------------- | :-----: | :-----: | :----------------: | :-----------: | :---------: | :------------: | :-------: |
| Lire les profils                                |   ❌    | le sien |      le sien       | ses patients  |    tous     |    le sien     |   tous    |
| Lire un dossier médical                         |   ❌    | le sien |         ❌         | ses patients  |     ❌      |       ❌       |    ❌     |
| Lire les résultats                              |   ❌    | validés |         ❌         | ses patients  |     ❌      |       ❌       |    ❌     |
| Voir les rendez-vous                            |   ❌    |  siens  |         ❌         |  son agenda   |    tous     |       ❌       |   tous    |
| Se donner un rôle / lister les utilisateurs     |   ❌    |   ❌    |         ❌         |      ❌       |     ❌      |       ❌       |    ✅     |
| Supervision / synthèse Direction / statistiques |   ❌    |   ❌    |         ❌         |      ❌       | supervision |       ❌       |    ✅     |
| Lire tout le journal d'audit                    |   ❌    | le sien |      le sien       |    le sien    |   le sien   |    le sien     |    ✅     |
| Écrire directement dans le journal              |   ❌    |   ❌    |         ❌         |      ❌       |     ❌      |       ❌       |    ❌     |
| Modifier / effacer le journal                   |   ❌    |   ❌    |         ❌         |      ❌       |     ❌      |       ❌       |    ❌     |
| Changer les horaires du portail                 |   ❌    |   ❌    |         ❌         |      ❌       |     ❌      |       ❌       |    ✅     |
| Exporter / supprimer ses données                |   ❌    |   ✅    |         ❌         |      ❌       |     ❌      |       ❌       |    ❌     |

## 3. Recette fonctionnelle (US-64)

Une ligne par user story. Pour chaque cas : faire le scénario sur le site déployé, noter le
résultat, joindre une capture dans `docs/recette/` (`US-07.png`, …).

| US    | Scénario (Étant donné / Lorsque / Alors)                      | Compte          | Résultat attendu                                            | OK ? | Capture |
| ----- | ------------------------------------------------------------- | --------------- | ----------------------------------------------------------- | :--: | ------- |
| US-01 | Inscription avec un e-mail neuf, code reçu, saisie du code    | nouveau         | Compte créé, arrivée sur le tableau de bord patient         |      |         |
| US-41 | 5 mots de passe faux de suite                                 | patient         | « Compte temporairement verrouillé », ligne dans le journal |      |         |
| US-34 | Connexion praticien                                           | praticien       | Code MFA demandé avant tout accès                           |      |         |
| US-07 | Réserver un créneau libre                                     | patient         | Rendez-vous créé, créneau indisponible pour les autres      |      |         |
| US-08 | Après la réservation                                          | patient         | E-mail de confirmation reçu en moins de 2 min               |      |         |
| —     | Réserver deux créneaux à la même heure dans deux cliniques    | patient         | Le second est refusé (« Vous avez déjà un rendez-vous… »)   |      |         |
| US-10 | Annuler un rendez-vous à plus de 24 h                         | patient         | Statut « Annulé », praticien notifié                        |      |         |
| US-14 | Télécharger un compte rendu validé                            | patient         | PDF téléchargé, `document.downloaded` dans le journal       |      |         |
| US-16 | Mes données → Télécharger                                     | patient         | Fichier JSON complet                                        |      |         |
| US-16 | Mes données → Supprimer (taper SUPPRIMER)                     | patient         | Déconnexion, connexion impossible, RDV futurs annulés       |      |         |
| US-21 | Bloquer une période puis tenter d'y réserver                  | praticien       | Créneaux retirés, réservation refusée                       |      |         |
| US-24 | Rédiger puis valider un compte rendu                          | praticien       | Le patient le voit après validation seulement               |      |         |
| US-30 | Prendre un RDV pour un patient au téléphone                   | accueil         | RDV créé, patient notifié                                   |      |         |
| US-31 | Supervision des cliniques                                     | admin           | Indicateurs des 3 cliniques                                 |      |         |
| US-35 | Journal d'audit : filtrer par « Connexions », exporter        | admin           | Liste filtrée, CSV téléchargé, export journalisé            |      |         |
| US-36 | Alertes sécurité après 5 échecs de connexion                  | admin           | Alerte « Échecs de connexion répétés »                      |      |         |
| US-38 | Publier une maintenance                                       | admin           | Bannière visible pour les utilisateurs pendant la période   |      |         |
| US-49 | Régler l'ouverture à l'heure suivante, tenter une réservation | admin + patient | Bannière + refus « ouverte de 6 h à 22 h »                  |      |         |
| US-62 | Patient tape `/admin/users` dans l'adresse                    | patient         | Page « Accès non autorisé », `access.denied` journalisé     |      |         |

## 4. Procès-verbal de recette (US-52)

> Projet : MedLink — Release 3 · Version testée : `main` @ ……… (commit) · URL : ………
>
> | Indicateur                                 | Cible   | Constaté |
> | ------------------------------------------ | ------- | -------- |
> | Cas de recette réussis                     | 100 %   |          |
> | Scénarios RBAC réussis                     | 49 / 49 |          |
> | Alertes ZAP élevées / critiques            | 0       |          |
> | Temps de chargement des pages (Lighthouse) | < 2 s   |          |
>
> Réserves : ……………………………………
>
> Décision : ☐ Recette prononcée ☐ Prononcée avec réserves ☐ Refusée
>
> Date : ………… Pour la Direction : ………………… Pour l'équipe projet : …………………

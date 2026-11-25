# US-37 — Sauvegarde et restauration

## Ce qui est sauvegardé

| Élément                                   | Comment                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| Rôles, schéma (tables, RLS, fonctions)    | `supabase db dump --role-only` puis `supabase db dump`         |
| Données (patients, rendez-vous, journal…) | `supabase db dump --data-only --use-copy`                      |
| Intégrité                                 | Empreinte SHA-256 de chaque fichier (`SHA256SUMS.txt`)         |
| Fichiers déposés par les patients         | Non inclus dans le dump : voir « Fichiers Storage » ci-dessous |

Les données médicales sensibles restent **chiffrées** (AES-256, US-43) dans la sauvegarde.

> ⚠️ **La clé `medical_data_key` est dans Supabase Vault, pas dans la sauvegarde.**
> Sans elle, les dossiers, comptes rendus et résultats restaurés sont illisibles.
> Copiez-la une fois dans un gestionnaire de mots de passe (SQL Editor :
> `select decrypted_secret from vault.decrypted_secrets where name = 'medical_data_key';`),
> et ne la collez jamais ailleurs. Lors d'une restauration dans un nouveau projet, recréez-la avec
> `select vault.create_secret('<la clé>', 'medical_data_key');` **avant** de lire les données.

## Sauvegarde automatique (toutes les nuits)

Workflow `.github/workflows/backup.yml`, chaque nuit à 03 h 17 (heure de Tunis) :

1. dump des rôles, du schéma et des données ;
2. archive chiffrée **AES-256** (GPG) avant de quitter la machine GitHub ;
3. conservée **14 jours** comme artefact du workflow.

À configurer une fois (GitHub → Settings → Secrets and variables → Actions → **Secrets**) :

| Secret              | Valeur                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL`   | Supabase → Connect → **Session pooler** → l'URI, avec le mot de passe de la base                |
| `BACKUP_PASSPHRASE` | Une longue phrase secrète aléatoire, gardée aussi hors ligne (sans elle, l'archive est inutile) |

Sans ces secrets, le workflow ne fait rien (message « Backup skipped »). Lancement manuel :
Actions → **Backup** → _Run workflow_.

Ouvrir une archive : `gpg -d medlink-AAAAMMJJ-HHMM.tar.gz.gpg | tar xz`

## Sauvegarde manuelle (Windows)

Prérequis : Docker Desktop lancé, projet lié une fois (`npx supabase link --project-ref lmocoknimijxqegbxbyg`).

```powershell
cd C:\Users\ranim\Downloads\medlink\medlink\medlink
.\scripts\backup.ps1
```

Résultat : `backups\medlink-AAAAMMJJ-HHMM.zip` (dossier ignoré par Git ; les 14 plus récentes sont gardées).
Copiez l'archive sur un support chiffré (clé BitLocker, dossier cloud privé).

## Restauration

La restauration se fait dans un **projet Supabase vide** (procédure officielle Supabase), jamais
directement sur la production : le script refuse l'adresse du projet de production.

```powershell
.\scripts\restore.ps1 -Backup backups\medlink-20261126-0317.zip `
  -DbUrl "postgresql://postgres.<ref>:<mot-de-passe>@<hôte>:5432/postgres"
```

Le script :

1. vérifie l'empreinte SHA-256 de chaque fichier (archive corrompue → arrêt) ;
2. charge rôles, schéma puis données **dans une seule transaction** : tout ou rien ;
3. désactive les déclencheurs pendant le chargement des données (`session_replication_role = replica`).

Ensuite, dans le nouveau projet : recréer `medical_data_key`, `app_url` et `cron_secret` dans Vault,
puis pointer `SUPABASE_URL` / clés de l'application vers ce projet.

## Test de restauration (à faire une fois par release)

1. Créer un projet gratuit `medlink-restore-test` dans Supabase.
2. `.\scripts\backup.ps1`, puis `.\scripts\restore.ps1` vers ce projet.
3. Recréer `medical_data_key` dans le Vault du projet de test.
4. Vérifier dans le SQL Editor :
   ```sql
   select count(*) from public.profiles;
   select count(*) from public.appointments;
   select count(*) from public.audit_logs;
   select allergies from public.medical_records_decrypted limit 1; -- lisible = clé OK
   ```
5. Noter la date, la durée et les nombres dans le tableau ci-dessous, puis supprimer le projet de test.

| Date | Sauvegarde | Durée restauration | Profils | Rendez-vous | Données déchiffrées | Par |
| ---- | ---------- | ------------------ | ------- | ----------- | ------------------- | --- |
|      |            |                    |         |             |                     |     |

## Fichiers Storage (documents des patients)

Les fichiers du bucket privé `patient-documents` ne sont pas dans le dump SQL. Pour les copier :

```powershell
npx supabase storage cp -r --remote ss:///patient-documents backups\storage
```

## Objectifs

| Indicateur                       | Cible                                          |
| -------------------------------- | ---------------------------------------------- |
| Perte de données maximale (RPO)  | 24 h (sauvegarde nocturne)                     |
| Délai de remise en service (RTO) | 2 h (nouveau projet + restauration + config)   |
| Rétention                        | 14 jours (GitHub) + copies manuelles chiffrées |

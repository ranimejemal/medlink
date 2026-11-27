# Déploiement de MedLink : conteneurs, Kubernetes et haute disponibilité

MedLink tourne sur **Kubernetes**, sans Vercel : chaque couche (frontend, backend, base de données)
a **sa propre image de conteneur**, chaque couche a **au moins 2 copies sur des serveurs différents**,
et si un serveur tombe, Kubernetes **bascule sur les autres** automatiquement.

## 1. Architecture

```
                       Navigateur  http://127.0.0.1:8080
                                │
                     ┌──────────▼───────────┐
                     │  frontend (nginx) ×2 │  pages de l'app (fichiers statiques)
                     └───┬──────────────┬───┘
            /api, /_serverFn            /auth/v1, /rest/v1, /storage/v1
                         │              │
            ┌────────────▼─────┐   ┌────▼──────────────┐
            │ backend (Node) ×2│──▶│ gateway (nginx) ×2│
            └──────────────────┘   └──┬──────┬──────┬──┘
                                      │      │      │
                              auth ×2   rest ×2   storage ×1
                             (GoTrue) (PostgREST)  (fichiers)
                                      │      │      │
                     ┌────────────────▼──────▼──────▼───────────────┐
                     │ base de données PostgreSQL (CloudNativePG)    │
                     │  medlink-db-1 PRIMAIRE ⇄ medlink-db-2 SECOURS │
                     │  réplication synchrone, 2 serveurs différents │
                     └───────────────────────────────────────────────┘
```

| Couche                    | Image                                                       | Copies        | Rôle                                                                           |
| ------------------------- | ----------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| **Frontend**              | `medlink-frontend` (`docker/frontend/Dockerfile`, nginx)    | 2 à 5         | Pages React (fichiers statiques), point d'entrée du site, en-têtes de sécurité |
| **Backend**               | `medlink-backend` (`docker/backend/Dockerfile`, Node.js 22) | 2 à 5         | Fonctions serveur, `/api` (Swagger, santé, e-mails), secrets côté serveur      |
| **Base de données**       | `supabase/postgres:15.8.1.085` + opérateur CloudNativePG    | 2             | PostgreSQL avec les extensions Supabase (Vault, pg_cron, pg_net…)              |
| Initialisation de la base | `medlink-db-init` (`docker/db-init/Dockerfile`)             | Job           | Schéma Supabase, 18 migrations MedLink, données et comptes de démo             |
| Authentification          | `supabase/gotrue`                                           | 2             | Inscription, code e-mail, connexion, MFA (TOTP)                                |
| API REST                  | `postgrest/postgrest`                                       | 2             | Tables et fonctions, protégées par RLS                                         |
| Passerelle API            | `nginx`                                                     | 2             | Rôle de Kong sur Supabase cloud : `/auth/v1`, `/rest/v1`, `/storage/v1`        |
| Stockage                  | `supabase/storage-api`                                      | 1             | Documents des patients (bucket privé, 10 Mo max)                               |
| E-mails de démo           | `axllent/mailpit`                                           | 1             | Reçoit tous les e-mails (http://127.0.0.1:8025)                                |
| Tâche des e-mails         | `curlimages/curl` (CronJob)                                 | chaque minute | Confirmations et rappels de rendez-vous                                        |

Toute la configuration est dans `k8s/` (`kubectl apply -k k8s`). Les secrets (clés JWT, mots de passe
de la base, clé racine de Vault) sont **générés sur le PC** par `scripts/k8s-secrets.mjs`, jamais
commités (US-45).

### Pourquoi le frontend et le backend sont deux images

Le frontend est construit en **application monopage** (`MEDLINK_SPA=1`) : ce ne sont que des fichiers
statiques servis par nginx, sans Node.js ni secret. Le backend ne contient que le serveur Node.js
(fonctions serveur et `/api`). Les deux sont construits à partir du même code : les identifiants des
fonctions serveur sont identiques dans les deux images.

Les réglages publics du navigateur (adresse et clé publique de l'API) sont lus **au démarrage du
conteneur** (`/env.js`), pas à la construction : la même image fonctionne sur n'importe quel cluster.

## 2. Haute disponibilité : ce qui se passe en cas de panne

| Panne                                                | Réaction                                                                                                                  | Mesuré en test                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Un conteneur frontend / backend / auth / rest plante | L'autre copie continue de servir ; Kubernetes redémarre le conteneur (`livenessProbe`)                                    | aucune erreur visible                               |
| **Le conteneur de la base primaire plante**          | CloudNativePG **promeut la copie de secours** en primaire et déplace l'adresse `medlink-db-rw` vers elle                  | **≈ 8 s** d'indisponibilité, puis tout refonctionne |
| **Le serveur de la base primaire tombe**             | Même bascule, après la détection de la panne du serveur (20 s) ; l'opérateur et le DNS restent sur le nœud de contrôle    | bascule en **17 s**, site rétabli en **≈ 80 s**     |
| Un serveur (nœud) entier tombe                       | Après 20 s il est déclaré « NotReady » : ses pods sortent du trafic ; après 30 s ils sont recréés sur les autres serveurs | les copies restantes servent pendant ce temps       |
| Le serveur revient                                   | L'ancienne base primaire **rejoint le cluster comme secours** et se resynchronise                                         | automatique                                         |
| Pic de charge                                        | Le HPA ajoute des copies du frontend et du backend (jusqu'à 5)                                                            | —                                                   |
| Mise à jour de l'application                         | Rolling update `maxUnavailable: 0`                                                                                        | aucune coupure                                      |
| Maintenance d'un serveur (`kubectl drain`)           | `PodDisruptionBudget` : au moins 1 copie de chaque service reste active                                                   | —                                                   |

**Aucune perte de données lors d'une bascule** : la réplication est **synchrone**
(`minSyncReplicas: 1`) ; une écriture n'est confirmée que quand les deux copies l'ont reçue.
Les deux copies de la base sont **obligatoirement** sur deux serveurs différents
(`podAntiAffinityType: required`), et la clé de chiffrement des données médicales (Vault, US-43)
est la même sur les deux : les données restent lisibles après une bascule.

Tests réalisés (cluster de test, 26/11/2026) :

- 49/49 tests RBAC (`supabase/tests/rbac.sql`) sur la base Kubernetes ;
- parcours complet dans un navigateur : inscription → code reçu par e-mail → confirmation →
  connexion → réservation → e-mail de confirmation envoyé par le CronJob ;
- dépôt d'un document dans le stockage (et refus dans le dossier d'un autre patient) ;
- arrêt brutal du conteneur de la base primaire pendant des requêtes continues : ≈ 8 s d'erreurs,
  puis bascule ;
- arrêt d'un serveur entier (celui de la base primaire), cluster kind de 3 serveurs, 27/11/2026 :
  base de secours promue **17 s** après l'arrêt, site de nouveau disponible **≈ 80 s** après
  (le temps que les connexions vers l'ancien serveur expirent), aucune donnée perdue ; au retour du
  serveur, l'ancienne primaire est revenue comme copie de secours.

### Limites connues (à dire à la soutenance)

| Point                                        | Explication                                                                                   | En production                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Stockage des documents : 1 copie             | Un volume « ReadWriteOnce » ne se monte que sur un serveur                                    | Stockage S3 ou volume « ReadWriteMany » → 2 copies |
| Cluster kind : 4 « serveurs » sur un seul PC | Démonstration : chaque serveur est un conteneur Docker                                        | 3 vraies machines (ou un Kubernetes managé)        |
| 1 seul nœud de contrôle (control-plane)      | Suffisant pour la démo ; s'il tombe, les applis continuent mais on ne peut plus rien modifier | 3 nœuds de contrôle                                |
| Mailpit à la place d'une vraie boîte mail    | Démo sans compte e-mail                                                                       | `SMTP_*` réels dans `scripts/k8s-secrets.mjs`      |
| HTTP (pas HTTPS) en local                    | localhost                                                                                     | `k8s/ingress.example.yaml` (Let's Encrypt)         |

## 3. Lancer la démo sur un PC Windows

Prérequis : **Docker Desktop** lancé (8 Go de RAM pour Docker conseillés : Settings → Resources),
**Node.js**, et :

```powershell
winget install Kubernetes.kind Kubernetes.kubectl
```

Puis, dans le dossier du projet (nouveau terminal après winget) :

```powershell
.\scripts\k8s-up.ps1
```

Le script (10 à 15 min la première fois) :

1. crée le cluster kind : 1 nœud de contrôle + 3 serveurs (`k8s/kind/cluster.yaml`) ;
2. installe l'opérateur de base de données CloudNativePG et metrics-server ;
3. construit les 3 images MedLink et les charge dans le cluster ;
4. génère les secrets (`k8s/secrets.local.yaml`, ignoré par Git) ;
5. déploie tout (`kubectl apply -k k8s`) et attend que tout soit prêt.

| Adresse                        | Contenu                                                 |
| ------------------------------ | ------------------------------------------------------- |
| http://127.0.0.1:8080          | MedLink                                                 |
| http://127.0.0.1:8080/api/docs | Documentation Swagger de l'API                          |
| http://127.0.0.1:8025          | Mailpit : codes d'inscription, confirmations et rappels |

Utilisez bien **127.0.0.1** et pas `localhost` : sous Windows, le navigateur peut envoyer
`localhost` en IPv6 (`::1`), que Docker Desktop ne transmet pas au cluster (erreur
`ERR_CONNECTION_RESET`). Si le port 8080 est déjà pris (Jenkins, Hyper-V…), le script choisit un
autre port libre (8088, 8090…) et l'affiche à la fin.

Comptes de démo (mot de passe `MedLink-Demo-2026!`) : `patient.demo@medlink.test`,
`doctor.demo@medlink.test`, `admin.demo@medlink.test`, `staff.demo@medlink.test`. Le praticien et
l'administrateur doivent configurer le MFA à la première connexion (application d'authentification).

### Démonstration de la panne d'un serveur

```powershell
.\scripts\k8s-failover-demo.ps1
```

Le script montre où tourne la base primaire, **arrête ce serveur** (`docker stop`), affiche toutes les
2 s l'état du site et le nom de la base primaire (la copie de secours prend le relais), puis redémarre
le serveur et montre l'ancienne primaire revenir comme secours.

Commandes utiles pendant la démo :

```powershell
kubectl get nodes                                  # les 4 serveurs
kubectl -n medlink get pods -o wide                # chaque copie et son serveur
kubectl -n medlink get cluster medlink-db          # état de la base et primaire actuelle
docker stop medlink-worker2                        # simuler la panne d'un serveur
docker start medlink-worker2
```

Tout supprimer : `.\scripts\k8s-down.ps1`.

Les scripts affichent leurs messages **en français** par défaut ; ajoutez `-Lang en` pour l'anglais
(par exemple `.\scripts\k8s-failover-demo.ps1 -Lang en`).

### Après une nouvelle migration

```powershell
docker build -f docker/db-init/Dockerfile -t ghcr.io/ranimejemal/medlink-db-init:latest .
kind load docker-image ghcr.io/ranimejemal/medlink-db-init:latest --name medlink
kubectl -n medlink delete job medlink-db-init
kubectl apply -k k8s
```

Le Job n'applique que les migrations pas encore appliquées (table `supabase_migrations.schema_migrations`).

## 4. Images publiées par GitHub Actions

`.github/workflows/docker.yml` construit les 3 images à chaque pull request (vérification) et les
publie sur `ghcr.io/ranimejemal/medlink-frontend`, `-backend` et `-db-init` à chaque push sur `main`.
Pour un vrai cluster, les rendre publiques (GitHub → Packages → Package settings → Change visibility)
ou ajouter un `imagePullSecret`.

## 5. Autres modes (toujours possibles)

| Mode                      | Commande                                                       | Base de données                                |
| ------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| Développement             | `npm run dev`                                                  | Supabase local (`npx supabase start`) ou cloud |
| Docker Compose, 1 serveur | `docker compose up -d --build` (image tout-en-un `Dockerfile`) | Supabase cloud                                 |
| Vercel                    | push sur `main`                                                | Supabase cloud                                 |

## 6. Sondes et documentation de l'API

| URL           | Rôle                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| `/healthz`    | Frontend vivant ? (nginx)                                                          |
| `/api/health` | Backend vivant ? (ne touche pas la base)                                           |
| `/api/ready`  | Backend prêt ? (la base répond en moins de 3 s), sinon 503 : le pod sort du trafic |
| `/api/docs`   | Documentation Swagger de l'API (spécification `/openapi.yaml`)                     |

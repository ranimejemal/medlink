# Déploiement de MedLink : conteneurs, Kubernetes et haute disponibilité

## 1. Architecture

```
Navigateur ──HTTPS──▶ Ingress / Caddy ──▶ App MedLink (Node.js, 2+ conteneurs)
                                              │  interface React (SSR) + API serveur
                                              ▼
                                   Supabase (cloud) : PostgreSQL 17, Auth, Storage, Vault
```

| Couche                      | Où elle tourne                        | Image / service                                 |
| --------------------------- | ------------------------------------- | ----------------------------------------------- |
| **Frontend** (pages React)  | conteneur `app`                       | `ghcr.io/ranimejemal/medlink` (Dockerfile)      |
| **Backend** (API, e-mails)  | **le même** conteneur `app`           | idem : TanStack Start sert les pages ET l'API   |
| **Base de données**         | Supabase cloud (PostgreSQL 17 managé) | en local : conteneur `supabase/postgres` (CLI)  |
| Reverse proxy HTTPS         | conteneur `caddy` (Docker) / Ingress  | `caddy:2-alpine` / ingress-nginx + cert-manager |
| Tâche planifiée des e-mails | conteneur `cron` / CronJob / pg_cron  | `curlimages/curl`                               |

### Pourquoi le frontend et le backend sont dans la même image

MedLink utilise **TanStack Start** : le même serveur Node.js génère les pages (rendu côté serveur)
et expose l'API (`/api/...` et les fonctions serveur). Les séparer en deux images obligerait à
dupliquer le code partagé et ajouterait un appel réseau sans gain de sécurité. Le passage à
l'échelle se fait en **multipliant les conteneurs `app`** (2 à 5 en Kubernetes).

### Base de données : choix retenu (option B — Supabase cloud)

| Option                                     | Avantages                                                                   | Inconvénients                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A. Supabase auto-hébergé (≈ 10 conteneurs) | Tout est chez nous                                                          | Sauvegardes, mises à jour de sécurité, haute dispo à notre charge       |
| **B. Supabase cloud (retenu)**             | PostgreSQL managé, chiffrement disque, sauvegardes, correctifs automatiques | Dépendance à un fournisseur (atténuée : sauvegardes exportables, US-37) |

Pour le **développement et les tests**, la base tourne bien en **conteneurs** grâce à la CLI Supabase :

```powershell
npx supabase start        # lance PostgreSQL 17, Auth, Storage, Studio... dans Docker
npx supabase db reset     # recrée la base locale à partir de supabase/migrations
npx supabase stop
```

L'image `supabase/postgres` est la même que celle de la production : les migrations testées en
local sont celles appliquées en production (`npx supabase db push --remote`).

## 2. Docker Compose (un serveur, VPS ou PC)

```powershell
copy .env.example .env      # puis remplir les valeurs
docker compose up -d --build
docker compose ps           # "app" doit être "healthy"
```

- `app` a un **HEALTHCHECK** (`/api/health`) : Caddy et la tâche e-mails ne démarrent que quand l'app est prête.
- `restart: unless-stopped` : l'app redémarre seule après un crash ou un redémarrage du serveur.

## 3. Kubernetes (si un serveur tombe)

Fichiers dans `k8s/` :

| Fichier               | Rôle                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `namespace.yaml`      | Espace `medlink`, Pod Security « restricted » (aucun conteneur privilégié)                                                         |
| `configmap.yaml`      | Réglages non secrets                                                                                                               |
| `secret.example.yaml` | Modèle : le vrai Secret est créé depuis `.env`, jamais commité                                                                     |
| `deployment.yaml`     | 2 répliques sur des nœuds différents, mise à jour sans coupure, sondes, utilisateur non-root, système de fichiers en lecture seule |
| `service.yaml`        | Adresse interne stable                                                                                                             |
| `ingress.yaml`        | HTTPS (Let's Encrypt via cert-manager)                                                                                             |
| `cronjob.yaml`        | E-mails de confirmation / rappel chaque minute                                                                                     |
| `hpa.yaml`            | 2 à 5 répliques selon la charge CPU                                                                                                |
| `pdb.yaml`            | Au moins 1 réplique pendant une maintenance de nœud                                                                                |
| `networkpolicy.yaml`  | Seuls l'Ingress et le CronJob peuvent joindre l'app                                                                                |

### Ce qui se passe en cas de panne

| Panne                                | Réaction                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Le processus Node plante / se bloque | `livenessProbe` (`/api/health`) échoue 3 fois → Kubernetes redémarre le conteneur                                         |
| Un serveur (nœud) tombe              | L'autre réplique continue de servir ; Kubernetes recrée la réplique perdue sur un autre nœud                              |
| La base ne répond plus               | `readinessProbe` (`/api/ready`) → 503 : les pods sortent du trafic sans être tués, et y reviennent dès que la base répond |
| Pic de charge                        | Le HPA ajoute des répliques (jusqu'à 5)                                                                                   |
| Mise à jour de l'application         | Rolling update `maxUnavailable: 0` : aucune coupure                                                                       |

### Déployer

```bash
# 1. Image : construite et publiée par .github/workflows/docker.yml à chaque push sur main
#    (variables de dépôt VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY à définir une fois).
# 2. Secret depuis le fichier .env (jamais dans Git) :
kubectl create namespace medlink
kubectl -n medlink create secret generic medlink-secrets --from-env-file=.env
# 3. Tout le reste :
kubectl apply -k k8s/
kubectl -n medlink get pods,ingress
```

Pour une démonstration sur un PC : **Docker Desktop → Settings → Kubernetes → Enable**, ou `minikube start`.
Sans domaine : `kubectl -n medlink port-forward svc/medlink 8080:80` puis http://localhost:8080.

## 4. Vercel (démonstration actuelle)

Vercel reste utilisé pour la démo (`medlink-fri3.vercel.app`) car il est gratuit et sans serveur à gérer.
L'application ne dépend pas de Vercel : la même image tourne sur Docker Compose ou Kubernetes.
Sur Vercel, la tâche des e-mails est déclenchée par la base elle-même (pg_cron + pg_net, migration
`20261119000000_email_job_from_database.sql`).

## 5. Sondes et documentation de l'API

| URL           | Rôle                                                           |
| ------------- | -------------------------------------------------------------- |
| `/api/health` | Vivant ? (ne touche pas la base)                               |
| `/api/ready`  | Prêt ? (la base répond en moins de 3 s), sinon 503             |
| `/api/docs`   | Documentation Swagger de l'API (spécification `/openapi.yaml`) |

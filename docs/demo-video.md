# Scénario de la vidéo de démonstration (≈ 25 min)

Ce document donne, dans l'ordre, **quoi montrer, quelle commande lancer et quoi dire** pour filmer
la démonstration complète de MedLink : Docker, Kubernetes, tâches automatiques (jobs), application,
sécurité avec de vraies attaques, et haute disponibilité avec la panne d'un serveur.

Les commandes sont pour **PowerShell**, dans le dossier du projet. Remplacez `8088` par le port
affiché par `k8s-up.ps1` (8080 si le port est libre).

## 0. Avant d'enregistrer (10 min, hors vidéo)

1. Lancer le cluster et vérifier que tout est prêt :
   ```powershell
   .\scripts\k8s-up.ps1
   kubectl get nodes                          # 4 nœuds « Ready »
   kubectl -n medlink get cluster medlink-db  # « Cluster in healthy state », 2/2
   ```
2. Ouvrir à l'avance, dans cet ordre :
   - un terminal PowerShell en **grande police** (Ctrl + molette) ;
   - le navigateur avec 3 onglets : http://127.0.0.1:8088, http://127.0.0.1:8025 (Mailpit),
     https://github.com/ranimejemal/medlink/actions ;
   - VS Code sur le projet (dossiers `docker/`, `k8s/`, `docs/`).
3. Dans Mailpit : **Delete all** (boîte vide au début).
4. Sur le téléphone : une application d'authentification (Google Authenticator, Microsoft
   Authenticator…) pour le MFA du praticien et de l'administrateur.
5. Arrêter l'ancien Docker Compose s'il tourne, pour ne pas le confondre avec Kubernetes :
   `docker compose down`.

6. **Avec les vrais comptes** : lancer une fois `.\scripts\k8s-import-cloud.ps1` (voir
   `docs/deploiement.md`, « Utiliser les vrais comptes »). Les comptes de démo n'existent alors plus :
   utilisez vos vrais comptes (patient, praticien, admin, accueil) dans les étapes ci-dessous.
   Attention, ce sont des données réelles : évitez de filmer des dossiers de vrais patients.

Sans import, les comptes de démo sont (mot de passe `MedLink-Demo-2026!`) : `patient.demo@medlink.test`,
`doctor.demo@medlink.test`, `admin.demo@medlink.test`, `staff.demo@medlink.test`.

---

## 1. Introduction et architecture (2 min)

**Montrer** : `docs/deploiement.md`, section 1 (schéma).

**Dire** : « MedLink est un portail médical pour un réseau de 3 cliniques. Il tourne sur Kubernetes,
sans service cloud : le frontend, le backend et la base de données ont chacun leur image de
conteneur, chaque partie a au moins deux copies sur des serveurs différents, et la base de données
est répliquée avec bascule automatique. »

## 2. Docker : une image par partie (3 min)

**Montrer** les Dockerfiles dans VS Code :

| Fichier                      | Points à dire                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker/frontend/Dockerfile` | Construction en 2 étapes (Node pour compiler, puis nginx seul) ; image finale sans Node ni code source ; utilisateur non-root ; en-têtes de sécurité   |
| `docker/backend/Dockerfile`  | Node.js 22, utilisateur `node` (non-root) ; les secrets sont injectés au démarrage, jamais dans l'image ; HEALTHCHECK                                  |
| `docker/db-init/`            | Scripts d'initialisation et d'import de la base : exécutés par un Job avec l'image officielle Supabase Postgres, migrations fournies par une ConfigMap |

```powershell
docker images "ghcr.io/ranimejemal/*"
```

**Dire** : « Les réglages publics (adresse de l'API, clé publique) sont lus au démarrage du
conteneur, dans `/env.js` : la même image fonctionne sur n'importe quel cluster. »

## 3. Kubernetes (4 min)

```powershell
kubectl get nodes
kubectl -n medlink get pods -o wide -L cnpg.io/instanceRole
kubectl -n medlink get deploy,svc,hpa,pdb
kubectl -n medlink get cluster medlink-db
```

**Dire**, en montrant les colonnes `NODE` et `INSTANCEROLE` :

- « 4 serveurs : 1 de contrôle et 3 de travail (simulés par kind sur ce PC). »
- « Frontend, backend, authentification, API REST, passerelle : **2 copies** chacun, sur des
  serveurs différents (`topologySpreadConstraints`). »
- « La base : `medlink-db-1` **primaire** et `medlink-db-2` **secours**, obligatoirement sur deux
  serveurs différents, réplication **synchrone** : aucune écriture confirmée n'est perdue. »
- « **HPA** : jusqu'à 5 copies du frontend et du backend sous forte charge. **PDB** : au moins
  1 copie reste active pendant une maintenance. »
- « **Sondes** : `/api/health` (le processus vit ?) et `/api/ready` (la base répond ?) ; un pod
  bloqué est redémarré, un pod qui ne joint plus la base sort du trafic. »

Montrer `k8s/kustomization.yaml` (le tableau en commentaire résume tout) et
`k8s/database/cluster.yaml` (2 instances, anti-affinité, réplication synchrone).

Preuve que chaque conteneur fait son travail :

```powershell
kubectl -n medlink exec deploy/frontend -- nginx -v
kubectl -n medlink exec deploy/backend -- node --version
$p = kubectl -n medlink get cluster medlink-db -o jsonpath='{.status.currentPrimary}'
kubectl -n medlink exec $p -c postgres -- psql -U postgres -c "select application_name, state, sync_state from pg_stat_replication"
```

**Dire** : « `sync_state` montre que la copie de secours reçoit chaque écriture en direct. »

## 4. Les tâches automatiques : jobs (3 min)

**Kubernetes :**

```powershell
kubectl -n medlink get cronjob,job
kubectl -n medlink logs job/medlink-db-init --tail=8
```

| Tâche                        | Rôle                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Job `medlink-db-init`        | Crée le schéma Supabase, applique les migrations (une seule fois chacune), crée les comptes de démo              |
| CronJob `appointment-emails` | Chaque minute : envoie les confirmations et les rappels 24 h avant le rendez-vous (chaque e-mail une seule fois) |

**GitHub Actions** (onglet Actions du navigateur) :

| Workflow          | Quand            | Rôle                                                                                              |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| **CI**            | chaque push / PR | recherche de secrets, TypeScript, lint, 31 tests, build : une PR rouge ne peut pas être fusionnée |
| **Docker images** | push sur `main`  | construit et publie les 3 images                                                                  |
| **Backup**        | chaque nuit      | sauvegarde chiffrée de la base (artefact 14 jours)                                                |
| **ZAP scan**      | à la demande     | scan de sécurité OWASP ZAP du site                                                                |

Ouvrir un run vert de chaque, puis le run ZAP : **0 échec, 10 avertissements, 60 règles OK**,
analysés dans `docs/securite-zap.md`.

## 5. L'application (5 min)

1. **Inscription** : onglet MedLink → « Créer mon compte » avec une nouvelle adresse
   (ex. `prof.demo@medlink.test`) → onglet Mailpit → **le code à 6 chiffres** → saisir le code.
2. **Connexion patient** `patient.demo@medlink.test` → **Prendre rendez-vous** → praticien →
   créneau → motif → confirmer. Dans Mailpit, moins d'une minute après : **« Confirmation de votre
   rendez-vous »**, envoyé par le CronJob.
3. **Mes documents**, **Mes résultats**, **Mes données** (export et suppression du compte : RGPD).
4. **Praticien** `doctor.demo@medlink.test` : à la 1re connexion, **MFA obligatoire** → scanner le
   QR code avec le téléphone → saisir le code. Montrer l'agenda et le rendez-vous réservé.
5. **Administrateur** `admin.demo@medlink.test` (MFA aussi) : statistiques, supervision des
   cliniques, **Journal d'audit** (filtres, export CSV) : on y voit les connexions et la réservation.
6. **Documentation de l'API** : http://127.0.0.1:8088/api/docs (Swagger).

## 6. Sécurité : on attaque l'application (6 min)

### 6.1 Attaques automatiques (script)

```powershell
.\scripts\demo-securite.ps1
```

Le script lance 15 attaques réelles, explique chacune et affiche la réponse du serveur. Il crée
son propre compte patient de test, `attaque.demo@medlink.test`, et n'attaque que lui : aucun vrai
compte n'est touché. Appuyer sur
Entrée entre deux attaques pour commenter :

| #   | Attaque                                            | Réponse attendue                                              |
| --- | -------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Visiteur anonyme qui lit les profils               | 401 `permission denied`                                       |
| 2   | (connexion légitime du patient)                    | 200                                                           |
| 3   | IDOR : le patient demande tous les profils         | 1 seul profil : le sien (RLS)                                 |
| 4   | Lire les dossiers médicaux des autres              | liste vide                                                    |
| 5   | Se donner le rôle admin                            | 403 `permission denied`                                       |
| 6   | Appeler une fonction d'administrateur              | 400 `FORBIDDEN`                                               |
| 7   | Supprimer le journal d'audit                       | 403 (journal en ajout seul)                                   |
| 8   | Écrire une fausse entrée d'audit                   | 400 `FORBIDDEN` (liste blanche)                               |
| 9   | Injection SQL `x' OR '1'='1`                       | liste vide (requêtes paramétrées)                             |
| 10  | Déposer un fichier chez un autre patient           | 403 `row-level security`                                      |
| 11  | JWT falsifié (`role: service_role`)                | 401 `JWSInvalidSignature`                                     |
| 12  | CSRF depuis un site pirate                         | 403                                                           |
| 13  | Force brute : 12 mots de passe en rafale sur l'API | 400 puis **429** (adresse IP freinée)                         |
| 14  | Lire les données médicales dans la base            | **chiffrées AES-256** ; déchiffrées seulement pour le patient |
| 15  | En-têtes de sécurité, utilisateur des conteneurs   | HSTS, CSP, X-Frame-Options… ; `nginx` et `node`, pas root     |

Après l'attaque 13, les connexions **directes à l'API** depuis ce PC sont freinées environ
1 minute (la connexion par le site, elle, n'est pas concernée).

### 6.2 Attaques dans l'interface

1. **Verrouillage du compte** : se déconnecter, puis 5 mauvais mots de passe pour
   `staff.demo@medlink.test` → « Compte temporairement verrouillé » (15 min). Montrer ensuite
   l'entrée `auth.login_blocked` dans le journal d'audit (compte admin).
2. **XSS** : en patient, réserver un rendez-vous avec le motif `<img src=x onerror=alert(1)>`,
   puis se connecter en praticien et ouvrir l'**agenda** : le motif s'affiche comme du texte,
   aucune fenêtre ne s'ouvre (React échappe tout l'affichage).
3. **Accès direct à une page interdite** : connecté en patient, taper
   http://127.0.0.1:8088/admin/dashboard → redirection « Accès non autorisé ».
4. **Déconnexion automatique** : expliquer (15 min d'inactivité → page « Session expirée »).

### 6.3 Preuves complémentaires

- **49 tests RBAC** sur la base Kubernetes :
  ```powershell
  $p = kubectl -n medlink get cluster medlink-db -o jsonpath='{.status.currentPrimary}'
  Get-Content supabase\tests\rbac.sql | kubectl -n medlink exec -i $p -c postgres -- psql -U postgres -d postgres -v ON_ERROR_STOP=1
  ```
  Dernière ligne : `ALL RBAC TESTS PASSED`.
- **Secrets** : `git check-ignore k8s/secrets.local.yaml` (ignoré par Git) ; le workflow CI
  bloque tout secret commité.
- **Checklist OWASP Top 10** : `docs/OWASP_CHECKLIST.md`.

## 7. Haute disponibilité : un serveur tombe (4 min)

```powershell
.\scripts\k8s-failover-demo.ps1
```

1. Le script affiche la base primaire et son serveur. **Dire** : « Je vais arrêter brutalement ce
   serveur, comme une panne de courant. » → Entrée.
2. Pendant les 2 minutes, **dire** ce qui se passe :
   - `site: PANNE` : la base primaire a disparu ;
   - après **≈ 17 s**, `base primaire:` passe à **medlink-db-2** : la copie de secours, sur un autre
     serveur, est devenue primaire **automatiquement** ;
   - après **≈ 80 s**, `site: 200` : tout refonctionne, sans perte de données.
3. Pendant ce temps, dans le navigateur : se connecter en patient et ouvrir **Mes rendez-vous** :
   le rendez-vous réservé avant la panne est toujours là.
4. Docker Desktop : le conteneur du serveur arrêté apparaît **arrêté**.
5. Entrée pour **redémarrer** le serveur : l'ancienne primaire revient comme **copie de secours**.

**Dire** : « Kubernetes a aussi recréé sur les serveurs restants les pods qui tournaient sur le
serveur arrêté. »

## 8. Sauvegarde et restauration (1 min)

Montrer le workflow **Backup** (run vert, artefact chiffré) et `docs/sauvegarde-restauration.md`
(procédure de restauration, chiffrement de la sauvegarde, clé à conserver).

## 9. Conclusion (1 min)

**Dire** :

- ce qui est couvert : séparation frontend / backend / base, haute disponibilité, sécurité
  (RLS, MFA, chiffrement, audit, en-têtes, anti brute force, scan ZAP, tests RBAC), CI/CD ;
- les limites (`docs/deploiement.md`, « Limites connues ») : stockage des documents en 1 copie,
  cluster simulé sur un PC, HTTP en local ; en production : 3 vraies machines, stockage S3,
  HTTPS avec `k8s/ingress.example.yaml`.

---

## En cas de problème pendant le tournage

| Problème                                       | Solution                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Page « ERR_CONNECTION_RESET »                  | Utiliser `127.0.0.1` et non `localhost`                                                          |
| Un nœud reste `NotReady`                       | `docker start medlink-worker3` (ou celui arrêté), attendre 1 min                                 |
| La base est `1/2`                              | Attendre que `kubectl -n medlink get cluster medlink-db` affiche `2/2` avant de rejouer la panne |
| Connexion API refusée (429) après l'attaque 13 | Attendre 1 minute                                                                                |
| « Compte temporairement verrouillé »           | Attendre 15 min, ou utiliser un autre compte de démo                                             |
| Pas d'e-mail dans Mailpit                      | Attendre la minute suivante (CronJob) ; `kubectl -n medlink get jobs`                            |

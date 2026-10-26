# MedLink — Portail médical sécurisé

Portail web du réseau de cliniques MedLink (Sousse, Sfax, Tunis) : prise de rendez-vous,
espace patient, espace praticien, back-office administratif et journal d'audit.

> Ce document explique comment **installer, lancer et utiliser** le projet.
> Lisez-le dans l'ordre la première fois (≈ 15 minutes).

---

## Sommaire

1. [Technologies](#1-technologies)
2. [Prérequis](#2-prérequis)
3. [Installation en 6 étapes](#3-installation-en-6-étapes)
4. [Variables d'environnement](#4-variables-denvironnement)
5. [Comptes de démonstration et rôles](#5-comptes-de-démonstration-et-rôles)
6. [Se connecter (MFA)](#6-se-connecter-mfa)
7. [Structure du projet](#7-structure-du-projet)
8. [Commandes utiles](#8-commandes-utiles)
9. [Problèmes fréquents](#9-problèmes-fréquents)
10. [Sécurité : règles de l'équipe](#10-sécurité--règles-de-léquipe)
11. [Travailler en équipe avec Git](#11-travailler-en-équipe-avec-git)
12. [Déploiement sur le VPS](#12-déploiement-sur-le-vps)
13. [État d'avancement](#13-état-davancement)

---

## 1. Technologies

| Rôle                       | Outil                                                                             |
| -------------------------- | --------------------------------------------------------------------------------- |
| Interface et pages         | React 19, TanStack Start / Router / Query, TypeScript                             |
| Style                      | Tailwind CSS 4, shadcn/ui (Radix)                                                 |
| Base de données et comptes | Supabase : PostgreSQL, Auth, MFA TOTP, Row Level Security (RLS)                   |
| Code serveur               | Fonctions serveur TanStack Start (connexion sécurisée, demandes assistées par IA) |
| IA                         | SDK `ai` avec n'importe quelle API compatible OpenAI                              |
| Tests et qualité           | Vitest, ESLint, Prettier                                                          |

**Idée générale :** le navigateur parle à Supabase pour les données courantes, et la sécurité est
appliquée **dans la base** (RLS) : un patient ne peut lire que ses propres données, même si
l'interface était contournée. Les opérations sensibles (connexion, IA) passent par le serveur.

## 2. Prérequis

- **Node.js 20 ou plus** (`node -v`) — https://nodejs.org
- **npm** (livré avec Node) — ou **Bun** (optionnel)
- Un compte **Supabase** gratuit — https://supabase.com
- **Git**
- Une application d'authentification pour le MFA : Google Authenticator, Microsoft Authenticator, Authy…

## 3. Installation en 6 étapes

### Étape 1 — Récupérer le code

```powershell
git clone https://github.com/ranimejemal/medlink.git
cd medlink
```

### Étape 2 — Installer les dépendances

```powershell
npm install --legacy-peer-deps
```

> ⚠️ **Le `--legacy-peer-deps` est obligatoire avec npm.** Sans lui, npm plante avec
> `Cannot read properties of null (reading 'edgesOut')` (bug de npm avec `jsdom`).
> Avec Bun, `bun install` fonctionne sans option.

### Étape 3 — Créer le projet Supabase

1. Sur https://supabase.com, créez un **nouveau projet vide**.
2. Dans **Project Settings → API**, notez :
   - l'**URL du projet** (`https://xxxx.supabase.co`) ;
   - la **clé publique** (_publishable key_, commence par `sb_publishable_`) ;
   - la **clé secrète** (_secret key_, commence par `sb_secret_`) — **ne la partagez jamais**.

### Étape 4 — Créer les tables et les données de démo

Dans Supabase, ouvrez **SQL Editor** :

1. Nouvelle requête → collez **tout** le fichier `supabase/migrations/20261023000000_baseline.sql` → **Run**.
2. Nouvelle requête → collez **tout** le fichier `supabase/seed.sql` → **Run**.
   (Relancez-le à tout moment pour regénérer des créneaux sur les 21 prochains jours.)

Puis réglez l'authentification :

3. **Authentication → Sign In / Providers** : vérifiez que **MFA (TOTP)** est activé.
4. **Authentication → URL Configuration** :
   - _Site URL_ : `http://localhost:8080`
   - _Redirect URLs_ : `http://localhost:8080/**`
5. **Authentication → Policies** : mot de passe minimum **12 caractères** (même règle que l'application).

### Étape 5 — Configurer le fichier `.env`

```powershell
copy .env.example .env
```

Ouvrez `.env` et remplissez-le (voir le tableau de la [section 4](#4-variables-denvironnement)).
**La clé `SUPABASE_SERVICE_ROLE_KEY` est obligatoire**, sinon la connexion affiche
« Le service est momentanément indisponible ».

### Étape 6 — Lancer l'application

```powershell
npm run dev
```

Ouvrez **http://localhost:8080** (si le port est occupé, Vite en choisit un autre et l'affiche
dans le terminal, par exemple 8082).

> Après **toute** modification de `.env`, arrêtez le serveur (`Ctrl+C`) et relancez-le.

Enfin, **créez les comptes de démo** (voir section suivante).

## 4. Variables d'environnement

Fichier `.env` à la racine (jamais commité : il est dans `.gitignore`).

| Variable                        | Obligatoire | Où la trouver / à quoi ça sert                                                            |
| ------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                  | oui         | URL du projet Supabase (côté serveur)                                                     |
| `SUPABASE_PUBLISHABLE_KEY`      | oui         | Clé publique `sb_publishable_…` (côté serveur)                                            |
| `VITE_SUPABASE_URL`             | oui         | Même URL, pour le navigateur                                                              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | oui         | Même clé publique, pour le navigateur                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | **oui**     | Clé secrète `sb_secret_…`. **Serveur uniquement.** Contourne toute la sécurité de la base |
| `AI_API_KEY`                    | non*        | Clé de l'API IA. _Sans elle, la page « Nouvelle demande » ne fonctionne pas_              |
| `AI_BASE_URL`                   | non         | Par défaut `https://api.openai.com/v1`                                                    |
| `AI_MODEL`                      | non         | Par défaut `gpt-4o-mini`                                                                  |
| `CRON_SECRET`                   | non         | Protège les tâches planifiées (rappels). Générer : `openssl rand -hex 32`                 |

**Règle d'or :** une clé secrète ne commence **jamais** par `VITE_` (sinon elle serait envoyée
dans le navigateur de tous les visiteurs).

## 5. Comptes de démonstration et rôles

Le mot de passe de démo est affiché sur la page de connexion. Les comptes **n'existent pas encore** après
le seed : il faut les créer une fois.

**Création :** allez sur `/register`, inscrivez-vous avec chacun de ces e-mails (le rôle est attribué
automatiquement grâce aux invitations du seed), puis confirmez l'e-mail si Supabase le demande.

| E-mail                      | Rôle                    | MFA     | Page d'accueil            |
| --------------------------- | ----------------------- | ------- | ------------------------- |
| `patient.demo@medlink.test` | Patient                 | non     | `/patient/dashboard`      |
| `doctor.demo@medlink.test`  | Praticien               | **oui** | `/practitioner/dashboard` |
| `admin.demo@medlink.test`   | Administrateur          | **oui** | `/admin/dashboard`        |
| `staff.demo@medlink.test`   | Personnel administratif | non     | `/staff/dashboard`        |

Tout autre e-mail qui s'inscrit devient **Patient**.

| Rôle           | Peut faire                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| Patient        | Voir ses rendez-vous, envoyer une demande de rendez-vous (assistée par IA), voir ses résultats **validés** |
| Praticien      | Voir son agenda et les dossiers de **ses** patients                                                        |
| Personnel      | Traiter les demandes des patients, gérer créneaux et rendez-vous                                           |
| Administrateur | Statistiques du réseau, comptes, cliniques, journal d'audit                                                |

## 6. Se connecter (MFA)

- **Patient et Personnel** : e-mail + mot de passe.
- **Praticien et Administrateur** : e-mail + mot de passe, **puis** un code à 6 chiffres.
  - _Première connexion_ : la page `/mfa` affiche un **QR code**. Scannez-le avec votre application
    d'authentification, puis saisissez le code pour activer le MFA.
  - _Connexions suivantes_ : saisissez simplement le code à 6 chiffres actuel.
- **Verrouillage** : 5 mots de passe faux en 15 minutes bloquent le compte pendant 15 minutes.
- **Inactivité** : déconnexion automatique après 15 minutes sans activité.

## 7. Structure du projet

```
src/
├── routes/                  Une page = un fichier (routage automatique TanStack)
│   ├── login.tsx, register.tsx, mfa.tsx, forgot-password.tsx, reset-password.tsx
│   └── _authenticated/      Pages réservées aux utilisateurs connectés
│       ├── patient/         dashboard, request (demande assistée par IA)
│       ├── practitioner/    dashboard
│       ├── staff/           dashboard (file des demandes)
│       └── admin/           dashboard (statistiques)
├── components/
│   ├── ui/                  Composants shadcn/ui (boutons, formulaires…)
│   └── medlink/             Composants du projet (AppShell = menu, AuthLayout…)
├── lib/
│   ├── access.ts            Rôles, MFA, gardes de pages
│   ├── auth.functions.ts    Connexion sécurisée côté serveur (anti brute-force, audit)
│   ├── requests.functions.ts + ai.server.ts   Demandes de rendez-vous par IA
│   └── errors.ts, format.ts, utils.ts
├── integrations/supabase/   Clients Supabase et types générés (ne pas éditer à la main)
└── test/                    Tests Vitest
supabase/
├── migrations/…baseline.sql Tables, règles RLS, fonctions (réservation, annulation, audit…)
├── seed.sql                 Cliniques, praticiens, créneaux, invitations de démo
└── config.toml
```

**Ajouter une page :** créez un fichier dans `src/routes/` (par exemple
`src/routes/_authenticated/patient/appointments.tsx`). `routeTree.gen.ts` est regénéré
automatiquement par `npm run dev` : ne le modifiez pas.

**Changer la base de données :** ne modifiez pas le fichier baseline déjà exécuté. Créez une nouvelle
migration dans `supabase/migrations/`, exécutez-la dans le SQL Editor, puis regénérez les types :

```powershell
npx supabase gen types typescript --project-id <votre-ref-projet> > src/integrations/supabase/types.ts
```

## 8. Commandes utiles

| Commande          | Rôle                                               |
| ----------------- | -------------------------------------------------- |
| `npm run dev`     | Serveur de développement (http://localhost:8080)   |
| `npm run build`   | Build de production (serveur Node dans `.output/`) |
| `npm run preview` | Prévisualiser le build                             |
| `npm test`        | Lancer les tests (Vitest)                          |
| `npm run lint`    | Vérifier le code (ESLint)                          |
| `npm run format`  | Formater le code (Prettier)                        |

(Avec Bun : `bun run <commande>`.)

## 9. Problèmes fréquents

| Message / symptôme                                              | Cause                                                       | Solution                                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm error Cannot read properties of null (reading 'edgesOut')` | Bug de npm avec `jsdom`                                     | `npm install --legacy-peer-deps` (supprimez d'abord `node_modules` et `package-lock.json`)                               |
| « Le service est momentanément indisponible » à la connexion    | `SUPABASE_SERVICE_ROLE_KEY` vide ou serveur non redémarré   | Renseigner la clé dans `.env`, `Ctrl+C`, `npm run dev`. Le détail est dans le terminal                                   |
| « Identifiants invalides »                                      | Le compte de démo n'a pas été créé, ou mauvais mot de passe | S'inscrire via `/register` avec l'e-mail de démo                                                                         |
| « Veuillez confirmer votre adresse e-mail »                     | Confirmation d'e-mail activée                               | Cliquer le lien reçu, ou la désactiver dans Supabase (Authentication → Providers → Email) **en développement seulement** |
| « Compte temporairement verrouillé »                            | 5 échecs en 15 min                                          | Attendre 15 minutes                                                                                                      |
| Le lien de confirmation / réinitialisation ne marche pas        | URL non autorisée                                           | Vérifier _Redirect URLs_ : `http://localhost:8080/**` (et le bon port)                                                   |
| Page blanche ou 404 après clic dans le menu                     | La page n'est pas encore développée                         | Voir [section 13](#13-état-davancement)                                                                                  |
| Le code MFA est refusé                                          | Heure du téléphone décalée                                  | Activer l'heure automatique sur le téléphone                                                                             |
| « Le service est indisponible » sur _Nouvelle demande_          | `AI_API_KEY` vide                                           | Renseigner la clé IA dans `.env`                                                                                         |
| Port 8080 occupé                                                | Un autre programme l'utilise                                | Vite prend le port suivant ; ajouter ce port dans les _Redirect URLs_ Supabase                                           |

## 10. Sécurité : règles de l'équipe

Ce projet manipule des données de santé. Respectez toujours ces règles :

1. **Ne jamais commiter** `.env`, ni coller une clé secrète dans un chat, un ticket ou une capture d'écran.
2. **Une clé qui a fuité est une clé perdue :** régénérez-la dans Supabase (Project Settings → API Keys) et révoquez l'ancienne.
3. La clé **publique** (`sb_publishable_…`) peut être partagée ; la clé **secrète** (`sb_secret_…`), jamais.
4. Ne désactivez pas la RLS sur une table, même « pour tester ». Toute nouvelle table doit avoir `enable row level security` et des policies.
5. Les comptes de démo (`@medlink.test`) sont **fictifs** : supprimez-les et retirez le bloc « Comptes de démonstration » de la page de connexion avant toute mise en production.
6. Aucune vraie donnée patient en développement.

## 11. Travailler en équipe avec Git

- Branche principale : `main` (toujours fonctionnelle).
- Une fonctionnalité = une branche : `git checkout -b feature/us-07-reservation`.
- Nommez les branches et commits avec la référence de la user story du backlog (`US-07`).
- Avant de pousser : `npm run lint` et `npm test` doivent passer.
- Ouvrez une _pull request_ ; un autre membre relit avant la fusion.
- Après un `git pull`, relancez `npm install --legacy-peer-deps` si `package.json` a changé.

## 12. Déploiement sur le VPS

```powershell
npm run build
node .output/server/index.mjs
```

À prévoir :

- Un **reverse proxy HTTPS** (Nginx ou Caddy) avec certificat (Let's Encrypt) devant l'application — exigence US-44.
- Les variables d'environnement du [tableau](#4-variables-denvironnement) définies sur le serveur (jamais dans le dépôt).
- Dans Supabase : _Site URL_ et _Redirect URLs_ avec votre vrai domaine (`https://votre-domaine.tn/**`).
- Un gestionnaire de processus (`pm2` ou `systemd`) pour relancer l'application.
- Supprimer les comptes de démo (voir section 10).

## 13. État d'avancement

Suivi détaillé : fichier _MedLink Product Backlog Roadmap_ (Release 1 = socle sécurisé).

**Fonctionne aujourd'hui :** inscription, connexion, réinitialisation du mot de passe, MFA
(praticien / administrateur), contrôle d'accès par rôle, anti brute-force, journal d'audit côté base,
déconnexion après inactivité, demande de rendez-vous assistée par IA et file de traitement pour le personnel,
tableaux de bord de chaque rôle.

**Pas encore développé (liens du menu sans page) :**
recherche de praticien et de créneau, réservation en ligne (la fonction base de données
`book_appointment` est prête), annulation / report, résultats et documents du patient, profil,
agenda et définition des disponibilités du praticien, comptes rendus, pages d'administration
(utilisateurs, praticiens, cliniques, statistiques, journal d'audit), rappels automatiques, intégration continue.

Mettez cette section à jour à chaque user story terminée.

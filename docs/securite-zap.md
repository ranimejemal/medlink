# US-60 / US-61 — Scan OWASP ZAP et corrections

## Lancer le scan

GitHub → **Actions** → **ZAP scan** → _Run workflow_ → URL du site (par défaut
`https://medlink-fri3.vercel.app`).

- Scan **baseline** (passif) : ZAP parcourt le site et analyse les réponses, sans attaque.
  Il peut donc être lancé sur la production sans risque.
- Le rapport HTML est attaché au run (artefact `zap-report`) : à joindre au dossier de recette.
- Les règles ajustées sont dans `.zap/rules.tsv` (chaque exception est justifiée).

Pour un scan **actif** (attaques simulées : injections, XSS…), le faire uniquement sur une copie
locale (`docker compose up`) :

```powershell
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-full-scan.py -t http://host.docker.internal:3000 -r zap-full.html
```

## Corrections apportées (Release 3)

| Constat (règle ZAP / audit)                                                  | Correction                                                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10020 Anti-clickjacking header missing                                       | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` (Vite/Nitro et Caddy)                                                                     |
| 10038 Content Security Policy header not set                                 | CSP : `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`                                                           |
| 10021 X-Content-Type-Options missing                                         | `nosniff`                                                                                                                                        |
| 10035 Strict-Transport-Security missing                                      | HSTS 1 an, sous-domaines inclus                                                                                                                  |
| Cross-Origin-Opener-Policy absent                                            | `same-origin`                                                                                                                                    |
| Script tiers chargé depuis un CDN (documentation API)                        | Swagger UI servi par notre serveur (`/api/docs-assets/…`), plus aucun script externe                                                             |
| Journal d'audit falsifiable (tout utilisateur pouvait appeler `write_audit`) | `write_audit` retiré de l'API ; `log_event` n'accepte qu'une liste blanche d'actions, impose l'auteur et la gravité (migration `20261126010000`) |
| `npm audit` : vite (élevée)                                                  | vite 8.1.5 → 8.3.8                                                                                                                               |
| Cellules CSV pouvant contenir des formules (export du journal)               | Préfixe `'` devant `= + - @` (test unitaire `audit.test.ts`)                                                                                     |

## Risques résiduels acceptés

| Point                                                  | Pourquoi il reste                                                                                | Mesure compensatoire                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| CSP sans `script-src` (alerte ZAP 10055, niveau moyen) | Le rendu serveur insère des scripts en ligne ; il faudrait des _nonces_ générés à chaque requête | React échappe tout l'affichage ; aucun `dangerouslySetInnerHTML` sur des données utilisateur    |
| `zod` 3 (`npm audit` : élevée, épuisement mémoire)     | Le correctif impose zod 4 (changement majeur de toute la validation)                             | Les entrées validées sont de petits objets ; corps des requêtes limités ; à migrer en Release 4 |
| `minimatch` (modérée)                                  | Outil de développement uniquement, absent du serveur de production                               | —                                                                                               |

## Résultats à remplir

| Date       | URL scannée                       | Échecs (FAIL) | Avertissements (WARN) | Règles OK (PASS) | Rapport                                                                                           |
| ---------- | --------------------------------- | ------------: | --------------------: | ---------------: | ------------------------------------------------------------------------------------------------- |
| 26/11/2026 | `https://medlink-fri3.vercel.app` |             0 |                    10 |               60 | [run #1](https://github.com/ranimejemal/medlink/actions/runs/45787003892) (artefact `zap-report`) |

### Analyse des 10 avertissements du 26/11/2026

| Règle ZAP                                         | Cause                                                                                       | Décision                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 10021 X-Content-Type-Options manquant (`/assets`) | Sur Vercel, la route `/assets/*` (cache) s'arrêtait avant la route des en-têtes de sécurité | **Corrigé** : en-têtes de sécurité ajoutés aussi sur `/assets/**` (`vite.config.ts`)   |
| 10063 Permissions-Policy manquant (`/assets`)     | Même cause                                                                                  | **Corrigé** (même correction)                                                          |
| 10055 CSP : directive générique                   | Pas de `script-src` (scripts en ligne du rendu serveur)                                     | Risque accepté (voir ci-dessus)                                                        |
| 10098 Cross-Domain Misconfiguration               | Vercel sert les fichiers statiques avec `Access-Control-Allow-Origin: *`                    | Accepté : fichiers publics (JS/CSS), aucune donnée ; les API exigent un jeton          |
| 10094 Base64 Disclosure                           | Chaînes base64 dans le code minifié et la clé publique Supabase (publique par conception)   | Faux positif                                                                           |
| 10015 Cache-control à revoir                      | Pages HTML publiques (accueil, login…) mises en cache par le CDN                            | Accepté : pages sans données personnelles ; les données passent par l'API authentifiée |
| 10050 Retrieved from Cache                        | Réponses servies par le CDN Vercel                                                          | Informatif, attendu avec un CDN                                                        |
| 90003 Sub Resource Integrity manquant             | Scripts servis par notre propre domaine (aucun CDN externe)                                 | Accepté : SRI utile seulement pour des scripts tiers                                   |
| 90004 Cross-Origin-Embedder-Policy manquant       | COEP `require-corp` bloquerait les images/fichiers Supabase Storage                         | Accepté ; COOP `same-origin` est déjà en place                                         |
| 90005 Sec-Fetch-Dest manquant                     | En-tête envoyé par le navigateur, pas par le serveur (ZAP ne l'envoie pas)                  | Faux positif                                                                           |

Aucune alerte de niveau élevé. Après déploiement de la correction, relancer le scan : 10021 et
10063 doivent disparaître (8 avertissements attendus, tous justifiés ci-dessus).

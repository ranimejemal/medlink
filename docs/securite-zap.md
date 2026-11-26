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

| Date | URL scannée | Hautes | Moyennes | Basses | Informatives | Rapport |
| ---- | ----------- | -----: | -------: | -----: | -----------: | ------- |
|      |             |        |          |        |              |         |

# US-59 — Checklist de sécurité OWASP Top 10 (2021) — MedLink, Release 3

Mise à jour à chaque release. Colonne « Preuve » = où le montrer au tuteur.

| Risque                                 | Exigence MedLink                                            | US                 | Preuve dans le projet                                                                                                                                                                          | État R3                                                 |
| -------------------------------------- | ----------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A01 Contrôle d'accès défaillant        | RBAC, RLS sur chaque table, praticien limité à ses patients | 39, 33, 23, 62     | RLS sur toutes les tables, `requireRole`, `is_my_patient`, **49 tests RBAC** (`supabase/tests/rbac.sql`), refus journalisés                                                                    | Couvert                                                 |
| A02 Défaillances cryptographiques      | AES-256 au repos, TLS 1.2+ en transit                       | 43, 44             | pgcrypto + vues `*_decrypted`, clé `medical_data_key` dans Vault, HSTS, TLS 1.2+ (Caddy / Ingress), sauvegardes chiffrées AES-256 (US-37)                                                      | Couvert                                                 |
| A03 Injection                          | Requêtes paramétrées, validation, échappement               | 61                 | Client Supabase (pas de SQL concaténé), schémas zod, React échappe l'affichage, e-mails échappés, CSV protégé contre les formules                                                              | Couvert                                                 |
| A04 Conception non sécurisée           | Moindre privilège, actions sensibles côté serveur           | 33, 24, 25, 30, 16 | `validate_report` / `validate_result`, `staff_book_appointment`, suppression de compte avec confirmation et conservation légale du dossier                                                     | Couvert                                                 |
| A05 Mauvaise configuration             | En-têtes de sécurité, aucun secret exposé                   | 44, 45             | HSTS, CSP, X-Frame-Options, nosniff, COOP ; `scripts/check-secrets.sh` en CI ; conteneurs non-root, lecture seule (k8s)                                                                        | Couvert (CSP sans `script-src`, voir `securite-zap.md`) |
| A06 Composants vulnérables             | Dépendances à jour                                          | 60, 61             | `npm audit` : vite corrigé ; zod 3 accepté jusqu'en R4 (justifié dans `docs/securite-zap.md`)                                                                                                  | Partiel                                                 |
| A07 Identification et authentification | MDP forts, MFA, verrouillage, expiration                    | 41, 42, 17, 34, 40 | 5 échecs = 15 min (`login_attempts`), limite par IP sur l'API d'authentification (Kubernetes : 429 au-delà de 5 connexions/min), MFA TOTP (AAL2) praticiens/admins, déconnexion à l'inactivité | Couvert                                                 |
| A08 Intégrité logiciels/données        | Code vérifié avant fusion, dépendances verrouillées         | 58                 | CI obligatoire (secrets, tsc, lint, tests, build), `package-lock.json` + `npm ci`, aucun script tiers (Swagger UI auto-hébergé)                                                                | Couvert                                                 |
| A09 Journalisation et surveillance     | Traçabilité des accès et actions sensibles                  | 35, 47, 36         | `audit_logs` en écriture seule, `log_event` à liste blanche, page Journal d'audit (filtres + export journalisé), alertes sécurité                                                              | Couvert                                                 |
| A10 SSRF                               | Le serveur n'appelle que des adresses fixes                 | 61                 | Seuls Supabase, SMTP et l'API IA (adresses dans `.env`)                                                                                                                                        | Couvert                                                 |

## Points A09 de la Release 2 — corrigés

1. ~~`write_audit()` exécutable par tout utilisateur connecté~~ → retiré de l'API ; l'application passe par
   `log_event()` (liste blanche d'actions, auteur et gravité imposés). Migration `20261126010000_audit_event_allowlist.sql`, testé dans `rbac.sql`.
2. ~~`audit_logs` modifiable~~ → déclencheur d'immutabilité (`20261111000000_audit_append_only.sql`), testé dans `rbac.sql`.

## Critères d'acceptation du cahier des charges

- [ ] 100 % des user stories validées en recette (`docs/tests.md`, section 3)
- [ ] Pages < 2 s (`docs/performance.md`, mesure sur le site déployé)
- [ ] 0 vulnérabilité critique/élevée au scan OWASP ZAP final (`docs/securite-zap.md`)
- [ ] 100 % des scénarios RBAC passés (`supabase/tests/rbac.sql` : 49/49 lors du développement, à relancer sur `npx supabase start` avant la recette)
- [ ] SRS, architecture et journal d'audit livrés

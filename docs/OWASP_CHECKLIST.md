# US-59 - Checklist de sécurité OWASP Top 10 (2021) - MedLink, Release 2

Mise à jour : à compléter à chaque release. Colonne « Preuve » = où le montrer au tuteur.

| Risque                                 | Exigence MedLink                                            | US                 | Preuve dans le projet                                                                                                                 | État R2                                                        |
| -------------------------------------- | ----------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| A01 Contrôle d'accès défaillant        | RBAC, RLS sur chaque table, praticien limité à ses patients | 39, 33, 23         | RLS sur les 16 tables (Supabase > Table Editor), `requireRole`, `is_my_patient`, refus journalisés (`access.denied`, `record.denied`) | Couvert                                                        |
| A02 Défaillances cryptographiques      | AES-256 au repos, TLS 1.2+ en transit                       | 43, 44             | pgcrypto + vues `*_decrypted`, clé `medical_data_key` dans Vault, HSTS dans `deploy/Caddyfile`                                        | Couvert                                                        |
| A03 Injection                          | Requêtes paramétrées, validation, échappement               | 61                 | Client Supabase (pas de SQL concaténé), schémas zod, React échappe l'affichage, e-mails échappés                                      | Couvert                                                        |
| A04 Conception non sécurisée           | Moindre privilège, actions sensibles côté serveur           | 33, 24, 25, 30     | Validation uniquement via `validate_report` / `validate_result`, réservation accueil via `staff_book_appointment`                     | Couvert                                                        |
| A05 Mauvaise configuration             | En-têtes de sécurité, aucun secret exposé                   | 44, 45             | HSTS, `scripts/check-secrets.sh` en CI, pages d'erreur sans détail technique                                                          | **Partiel** : ajouter CSP et X-Frame-Options dans le Caddyfile |
| A06 Composants vulnérables             | Dépendances à jour                                          | 60, 61             | `npm audit`                                                                                                                           | **Partiel** : `npm audit fix` + scan OWASP ZAP (Release 3)     |
| A07 Identification et authentification | MDP forts, MFA, verrouillage, expiration                    | 41, 42, 17, 34, 40 | 5 échecs = 15 min (`login_attempts`), MFA TOTP (AAL2) praticiens/admins, déconnexion à l'inactivité                                   | Couvert                                                        |
| A08 Intégrité logiciels/données        | Code vérifié avant fusion, dépendances verrouillées         | 58                 | CI obligatoire (secrets, tsc, lint, tests, build), `package-lock.json` + `npm ci`                                                     | Couvert                                                        |
| A09 Journalisation et surveillance     | Traçabilité des accès et actions sensibles                  | 35, 47, 36         | `audit_logs` : connexions, `record.viewed`, `document.downloaded`, rôles, affectations, e-mails                                       | **Partiel** (voir points ci-dessous)                           |
| A10 SSRF                               | Le serveur n'appelle que des adresses fixes                 | 61                 | Seuls Supabase, SMTP et l'API IA (adresses dans `.env`)                                                                               | Couvert                                                        |

## Points à corriger pour A09 (constatés sur la base de production)

1. `write_audit()` est exécutable par tout utilisateur connecté : un patient peut écrire de fausses lignes dans le journal via l'API.
2. `audit_logs` n'est pas en écriture seule : aucun déclencheur n'empêche un UPDATE/DELETE par un rôle privilégié.
   Correctif proposé : migration `20261111000000_audit_append_only.sql` (déclencheur d'immutabilité, testé en transaction annulée) puis, dans une PR séparée, remplacer l'appel client à `write_audit` par une fonction à liste blanche.

## Critères d'acceptation du cahier des charges (à prouver en Release 4)

- [ ] 100 % des user stories validées en recette
- [ ] Pages < 2 s
- [ ] 0 vulnérabilité critique/élevée au scan OWASP ZAP final
- [ ] 100 % des scénarios RBAC passés
- [ ] SRS, architecture et journal d'audit livrés

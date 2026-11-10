# US-63 — Performance des pages

## Objectif

Mesurer les performances des pages MedLink et identifier les optimisations nécessaires.

## Outil utilisé

Google Lighthouse, intégré à Chrome DevTools.

## Environnement de test

- Page : `/login`
- Appareil simulé : Desktop
- Mode : Navigation
- Environnement : localhost
- Version développement : Vite
- Version production locale : Nitro (`node .output/server/index.mjs`)

## Résultats

| Indicateur               | Développement | Production locale |
| ------------------------ | ------------: | ----------------: |
| Performance              |        94/100 |            93/100 |
| First Contentful Paint   |         0,8 s |             1,2 s |
| Largest Contentful Paint |         0,9 s |             1,3 s |
| Total Blocking Time      |        130 ms |              0 ms |
| Cumulative Layout Shift  |             0 |                 0 |
| Speed Index              |         1,7 s |             1,2 s |

## Analyse

Les deux mesures Lighthouse indiquent de bonnes performances pour la page de connexion.

Le CLS nul indique qu'aucun décalage visuel n'a été mesuré pendant ces tests.

Le TBT de 0 ms en production indique qu'aucun temps de blocage significatif n'a été relevé par Lighthouse lors de cette mesure.

Les résultats restent indicatifs, car ils proviennent d'une seule exécution par environnement.

## État d'avancement

- Build production : réussi.
- Test Lighthouse en développement : réalisé.
- Test Lighthouse en production locale : réalisé.
- Optimisations du code : pas encore réalisées.
- Autres pages : pas encore mesurées.

## Prochaines étapes

1. Mesurer les performances du tableau de bord Patient.
2. Identifier les éventuels problèmes dans les recommandations Lighthouse.
3. Répéter les mesures pour obtenir des résultats plus fiables.
4. Effectuer les optimisations nécessaires et comparer les résultats avant/après.

## Tableau de bord Patient — Production

URL testée : http://localhost:3000/patient/dashboard

Outil : Google Lighthouse (Desktop)

- Performance : 93/100
- First Contentful Paint : 1,2 s
- Largest Contentful Paint : 1,3 s
- Total Blocking Time : 0 ms
- Cumulative Layout Shift : 0,024
- Speed Index : 1,2 s

Résultat : bonnes performances sur le tableau de bord Patient
lors de cette mesure locale.

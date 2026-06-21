# Catalogue et fiche produit

## Catalogue

Le catalogue est un cockpit compact, pas un tableau de bord marketing. Son
résumé utilise une grille de métriques : chaque valeur et chaque label sont
séparés, avec les doublons potentiels visuellement secondaires.

Les filtres restent combinables dans l’URL :

- recherche ;
- espace actif ;
- statut ;
- complétude ;
- audit ;
- état actif ou masqué ;
- import source ;
- tri et pagination.

Le paramètre `import=<importId>` est conservé lors des changements de filtre.
Les espaces archivés sont exclus des sélecteurs actifs. Les doublons sont
signalés sans fusion, suppression ou validation automatique.

Chaque carte produit privilégie le titre, le statut, la complétude, l’espace et
une action d’ouverture. Les actions de lot restent disponibles dans le contexte
de l’import sans dominer la liste.

## Fiche produit

L’ordre d’usage est :

1. identité et action principale ;
2. navigation compacte dans le lot, si applicable ;
3. image produit ;
4. aperçu des informations principales ;
5. complétude et champs à corriger ;
6. édition des données de travail ;
7. audit déterministe ;
8. origine import ;
9. validation ;
10. éligibilité export ;
11. actions secondaires et dangereuses.

Le noyau de la fiche place le média et les informations dans deux zones sur
écran large, puis les empile proprement sur écran étroit. La navigation de lot
reste une barre secondaire compacte avec précédent, position, suivant et
retour au lot.

Le panneau média possède une seule limite visuelle. L’aperçu, l’upload, le
remplacement et le retrait restent dans le même bloc, avec une action
destructive séparée.

Les valeurs absentes ne sont pas répétées sous forme de longues listes de
« Non renseigné ». Elles sont regroupées dans un résumé « À compléter ». Le
brouillon structuré reste accessible dans une section repliable.

## Export

Une fiche est exportable uniquement si :

- son statut est `validated` ;
- elle n’est pas supprimée ;
- un snapshot `validated_data` existe côté service d’export.

La fiche affiche explicitement « Export verrouillé » lorsqu’elle n’est pas
éligible. Aucun changement de cette interface ne modifie automatiquement
`validated_data`.

## Règles visuelles

- Aucun texte ou statut concaténé.
- Aucun panneau majeur déclenché au survol.
- Aucun titre secondaire surdimensionné.
- Historiques compacts avec métadonnées séparées.
- Une seule carte quand une seule frontière suffit.
- Les grands conteneurs utilisent un wrapper intérieur aligné après la courbe
  du squircle.
- Actions dangereuses distinctes des actions principales.
- Pictogrammes uniquement lorsqu’ils accélèrent la compréhension.
- Copies courtes, accentuées et orientées action.

## Vérification ciblée

```sh
npm run test:visual-regression-copy-fixes
npm run test:session-drawer-layout
npm run test:import-stepper-layout
npm run test:product-batch-navigation-ui
npm run test:product-image-panel
npm run test:exports-imports-card-layout
npm run test:catalog-premium-core
npm run test:product-detail-premium-core
npm run test:product-export-eligibility-ui
npm run test:ui-no-concatenated-copy
npm run test:catalog-metrics-layout
npm run test:product-detail-layout-rebuild
npm run test:imports-exports-card-compactness
npm run test:rounded-panel-content-alignment
```

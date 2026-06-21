# Revue des lots importés

Un lot importé est l’ensemble des produits liés au même `imports.id` par
`products.import_id`. La vue `/catalog?import=<importId>` reste limitée au
workspace de la session.

## Revue et filtres rapides

Le bloc « Revue du lot » présente un résumé compact :

- le fichier et la date d’import ;
- les produits à compléter, à vérifier et validés ;
- les produits masqués ;
- les audits à lancer ou à relancer.

Les raccourcis réutilisent les paramètres du catalogue. Ils conservent le
filtre `import` et restent combinables avec la recherche, l’espace, le statut,
la complétude, l’état supprimé et la pagination.

## Audit du lot

« Lancer l’audit du lot » appelle uniquement le moteur déterministe existant.
Les produits supprimés, les autres imports et les autres workspaces sont
ignorés. L’action :

- ne lance aucun fournisseur IA ;
- ne valide aucun produit ;
- ne modifie pas `validated_data` ;
- crée un audit courant pour chaque produit actif du lot.

## Navigation produit

Une fiche issue d’un import propose le produit précédent, le produit suivant
et le retour au lot. L’ordre suit d’abord le numéro de ligne CSV, puis la date
de création, le titre et l’identifiant. Les produits supprimés sont exclus de
cette navigation.

Cette navigation est présentée comme une barre secondaire compacte :
`Précédent`, position dans le lot, puis `Suivant`. Les états de début et de fin
restent visibles mais discrets. La barre ne doit jamais prendre la taille ou le
poids visuel du titre produit.

## Masquage et restauration

« Masquer les produits de cet import » est un soft-delete groupé. Une
confirmation exacte du nom du fichier source est obligatoire.

Le masquage :

- renseigne uniquement `products.deleted_at` et `deleted_reason` ;
- ne supprime ni ligne produit, ni import, ni espace ;
- ne supprime aucun fichier local ;
- ne supprime ou ne modifie aucun export historique ;
- ne modifie ni `draft_data`, ni `validated_data` ;
- peut être relancé sans double effet.

L’import source et son CSV ne sont pas supprimés. Fichr ne présente pas de
bouton « Supprimer l’import » tant qu’un workflow de rétention complet n’existe
pas. L’action disponible porte explicitement sur les produits associés.

« Restaurer les produits de cet import » remet `deleted_at` et
`deleted_reason` à `null` pour les produits supprimés du lot. Les produits ne
sont pas recréés.

Les produits supprimés restent exclus des nouveaux exports, même lorsqu’ils
étaient validés avant leur masquage. Les exports historiques restent
inchangés.

## Espaces

Archiver un espace et masquer des produits sont deux opérations distinctes :

- archiver un espace le retire des sélecteurs actifs et conserve ses produits ;
- masquer les produits agit sur les fiches, pas sur l’espace.

Un espace archivé n’est plus accepté comme filtre catalogue normal. Une fiche
qui y reste liée demeure consultable et peut être réaffectée à un espace actif.

Cette passe n’ajoute pas de masquage groupé par espace. Cette action pourra
être étudiée plus tard avec un workflow de restauration explicite.

## Limites

- aucune validation massive automatique ;
- aucune suppression physique ;
- pas de sélection persistante multi-page ;
- l’audit de lot est séquentiel et destiné aux lots de taille raisonnable de
  la bêta privée.

# Parcours d’import CSV

Le parcours Fichr suit quatre étapes visibles :

1. fichier importé ;
2. mapping des colonnes ;
3. préparation de la création ;
4. création des brouillons.

Chaque étape affiche un état explicite : terminé, en cours, prêt, bloqué ou à
corriger. L’historique `/imports` reste compact : fichier, date, statut, nombre
de lignes et prochaine action.

Le stepper utilise quatre blocs structurés. Le numéro, l’icône, le libellé et
le statut sont des éléments séparés afin d’éviter les concaténations et les
numéros isolés. Il reste en grille sur écran large et passe en colonne sur
écran étroit.

## Doublons

Le stockage calcule déjà un SHA-256 du fichier source. Lorsqu’un fichier de
même contenu existe dans le workspace, le nouvel import reste autorisé mais
affiche l’avertissement « Un import similaire existe déjà ».

Dans le fichier, Fichr ignore les lignes en double lorsqu’elles partagent :

- la même référence/SKU ; ou
- le même titre et le même espace ; ou
- à défaut, le même titre et le même prix.

Le contrôle signale les lignes ignorées dans le résumé. Il ne fusionne et ne
supprime aucune fiche existante.

## Mapping

Le champ `Titre` est obligatoire. Les autres champs sont recommandés ou
optionnels selon leur usage. Les colonnes reconnues et les colonnes non
utilisées sont affichées séparément.

Une colonne non utilisée ne bloque pas l’import. Un mapping sans `Titre` reste
bloqué jusqu’à ce qu’une colonne soit associée.

## Préparation de la création

Le bloc « Préparation de la création » utilise les mêmes fonctions pures que
la création réelle. Il affiche :

- lignes totales, créables et ignorées ;
- produits qui seront créés ;
- espaces nouveaux, réutilisés ou en conflit avec un espace archivé ;
- plan actif ;
- quotas produits et espaces utilisés, disponibles et maximaux ;
- verdict prêt ou bloqué.

Ce preflight est strictement en lecture seule. Il ne crée ni produit, ni
espace, ne modifie aucune ligne d’import et ne met à jour aucun quota.

## Démo et Studio

- Démo : un CSV de 30 lignes créables est bloqué avant toute écriture, car le
  plan autorise 10 produits ;
- Studio : le même CSV est prêt si les quotas produits et espaces restants
  sont suffisants.

Le quota est vérifié avant la transaction. Un quota insuffisant ne laisse donc
aucun produit ou espace partiellement créé.

## Création des brouillons

Le bouton est actif uniquement lorsque le mapping, le rôle et les quotas
autorisent la création. Lorsqu’il est désactivé, le bloc affiche la cause et
l’action attendue.

Après succès, Fichr indique le nombre de produits créés et de lignes ignorées,
puis propose un accès principal au catalogue filtré sur cet import. Le lien
« Voir les produits créés » ouvre `/catalog?import=<importId>` et n’affiche que
les fiches reliées au lot courant. Un import déjà traité affiche « Brouillons
déjà créés », conserve ce lien et ne peut pas recréer les mêmes lignes.
L’idempotence repose sur `import_row_id`, y compris si l’action serveur est
relancée.

La page de détail présente aussi un aperçu limité des fiches créées avec leur
statut, leur complétude et leur espace. Le traitement complet du lot reste dans
le catalogue.

Les cartes d’historique gardent le nom du fichier et la date sur deux lignes
distinctes. Les statuts, compteurs et actions sont compacts et ne doivent pas
transformer le nom du CSV en titre de page.

La création remplit uniquement `raw_data`, `draft_data` et les champs de
travail. Elle ne remplit jamais automatiquement `validated_data`.

## Origine et catalogue filtré

Chaque fiche créée depuis un CSV conserve `import_id` et `import_row_id`. Le
catalogue accepte le paramètre `import=<importId>` en combinaison avec la
recherche, l’espace, le statut, la complétude, l’état supprimé et la
pagination.

Quand ce filtre est actif, un résumé compact affiche le fichier source, la
date, les statuts du lot, les fiches incomplètes, les fiches supprimées et les
espaces concernés. La fiche produit affiche également le fichier source, la
ligne CSV et des liens vers l’import et vers le lot filtré.

Un produit créé sans import reste visible normalement et n’apparaît dans aucun
lot importé. Un import absent ou appartenant à un autre workspace retourne le
même état introuvable, sans exposer son existence ni un chemin de stockage.

La vue du lot permet ensuite de filtrer rapidement les fiches incomplètes,
brouillons, à vérifier, validées, supprimées ou sans audit. Elle permet aussi
de lancer l’audit déterministe du lot, de masquer les produits par soft-delete
et de les restaurer avec confirmation explicite.

La fiche produit propose une navigation précédent/suivant dans le lot selon
la ligne CSV source. Voir `docs/imported-batch-review.md` pour les garanties de
conservation du stockage, des exports et des snapshots validés.

## Lignes à vérifier

Les problèmes principaux sont regroupés par message et par nombre de lignes.
Le détail ligne par ligne reste disponible dans une section repliable avec les
filtres Prêtes, À vérifier, Invalides et Ignorées.

Les erreurs connues restent courtes et actionnables : quota produit, quota
espace, mapping incomplet, fichier invalide, stockage indisponible, workspace
interdit ou entitlement insuffisant. Elles ne contiennent ni secret, ni chemin
système, ni stack trace.

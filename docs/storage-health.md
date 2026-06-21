# Diagnostic de santé du stockage

`storage:doctor` compare le manifeste `storage_objects` avec les fichiers
physiques du workspace. La commande est strictement en lecture seule.

```sh
npm run storage:doctor
npm run storage:doctor -- --workspace wks_...
npm run storage:doctor -- --email personne@example.com
```

Sans argument, la commande accepte uniquement une instance contenant un seul
workspace. Avec plusieurs workspaces, il faut en sélectionner un explicitement.

## Contrôles

Pour chaque objet suivi :

- validation de la clé et du scope workspace ;
- présence du fichier ;
- taille physique si `size_bytes` est renseigné ;
- SHA-256 si `hash_sha256` est renseigné.

Le provider local scanne également :

```text
storage/imports/<workspace>/
storage/images/<workspace>/
storage/exports/<workspace>/
```

Un fichier présent sans ligne active dans `storage_objects` est signalé :

- `orphan_possible_legacy` s’il n’est pas connu du manifeste ; les fichiers
  créés avant le manifeste entrent normalement dans cette catégorie ;
- `orphan_unexpected` si sa ligne est déjà marquée supprimée.

Une référence DB sans fichier devient `missing_file`. Les divergences de taille
ou de hash sont signalées séparément.

## Indexation des fichiers hérités

Commencez toujours par un dry-run :

```sh
npm run storage:index-legacy -- --workspace wks_... --dry-run
```

Le rapport calcule le type probable selon le dossier, la taille et le SHA-256.
Il refuse les chemins dangereux et ne modifie ni les fichiers ni SQLite.

Après vérification manuelle :

```sh
npm run storage:index-legacy -- --workspace wks_... --apply
```

`--apply` crée uniquement les lignes `storage_objects` manquantes avec une
métadonnée `legacy: true`. Il ne déplace, ne renomme et ne supprime aucun
fichier. Il ne modifie aucune fiche, aucun import historique et aucun export
historique, car ces relations peuvent être ambiguës.

Relancer ensuite `storage:doctor`. Les fichiers indexés ne sont plus signalés
comme orphelins legacy et apparaissent dans le compteur legacy déjà indexé.

## Absence de réparation automatique

Le diagnostic :

- ne supprime aucun fichier ;
- ne modifie aucune ligne DB ;
- ne recrée aucun contenu manquant ;
- ne recalcule pas silencieusement les hashes suivis.

Les fichiers manquants doivent être restaurés depuis une sauvegarde vérifiée.
Les orphelins doivent être examinés avant une éventuelle suppression manuelle.
Une future commande d’indexation pourra rattacher explicitement les fichiers
hérités à des entités métier si la relation est certaine. Cette passe ne
l’invente pas.

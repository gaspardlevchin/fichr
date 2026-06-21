# Pré-restauration des backups

`backup:restore-preflight` analyse un backup local avant une éventuelle
restauration future. Il ne restaure rien, ne remplace pas la SQLite active et
ne modifie pas le storage actif.

## Commandes

Pour un ZIP privé non chiffré :

```sh
npm run backup:restore-preflight -- --file artifacts/fichr-backup-....zip
```

Pour un `.fichrbackup` :

```sh
BACKUP_PASSPHRASE="une-passphrase-longue" \
  npm run backup:restore-preflight -- \
  --file artifacts/fichr-backup-....fichrbackup
```

Sans passphrase, le rapport indique qu’elle est requise. Une mauvaise
passphrase ou une enveloppe altérée est refusée sans produire de fichier
partiel persistant. La passphrase n’est ni stockée ni journalisée.

## Contrôles effectués

Le preflight :

- vérifie le manifeste et son hash ;
- refuse les chemins dangereux, `.env.local`, `node_modules` et `.next` ;
- vérifie SQLite, storage, tailles et SHA-256 ;
- extrait uniquement les fichiers vérifiés dans un dossier temporaire privé ;
- ouvre la SQLite extraite en lecture seule et exécute son contrôle
  d’intégrité ;
- compare les workspaces du backup avec ceux de l’installation active ;
- compare les tailles SQLite et détecte les conflits de dossiers storage ;
- signale les fichiers storage à structure legacy ;
- nettoie tous les temporaires après succès ou erreur.

La comparaison de l’installation active est strictement en lecture seule.
Aucune DB, aucun fichier storage et aucun manifeste actif n’est modifié.

## Statuts

- `restorable` : aucun blocage ni warning détecté ;
- `restorable_with_warnings` : contenu valide, mais les avertissements doivent
  être examinés avant toute restauration future ;
- `not_restorable` : erreur bloquante ou passphrase requise.

Les warnings possibles couvrent notamment un backup non chiffré, plusieurs
workspaces, une version Fichr différente, un workspace déjà présent, un
workspace absent, des fichiers legacy, des conflits storage et l’absence de
snapshot atomique commun entre SQLite et le système de fichiers.

`compatibility: probable` signifie que les contrôles structurels ont réussi.
Cela ne garantit pas qu’une future migration applicative sera inutile.

## Ce que la commande ne fait pas

- aucune restauration ;
- aucun écrasement de SQLite ;
- aucun déplacement ou écrasement du storage ;
- aucune suppression de données utilisateur ;
- aucun appel réseau ou provider cloud ;
- aucune synchronisation multi-device.

Une future commande pourrait prendre la forme suivante :

```sh
npm run backup:restore -- --file ... --target ./restore-target
```

Elle n’existe pas dans cette version. Une restauration réelle devra demander
une confirmation explicite, cibler un dossier distinct et être effectuée
serveur arrêté. Fermez également le serveur lors de la création d’un backup
destiné à une restauration importante.

# Client-owned storage

Fichr suit un principe **client-owned** : l’utilisateur ou son organisation
reste propriétaire des données de travail et choisit l’environnement qui les
héberge. Fichr ne doit pas devenir, par défaut, un stockage central de toutes
les fiches, images, sources et exports clients.

## Modes de propriété

- `local_device` : stockage sur l’appareil ou le serveur local qui exécute
  Fichr ; c’est le mode actuel par défaut ;
- `self_hosted` : instance et stockage administrés par le client ;
- `user_cloud` : futur stockage cloud choisi et contrôlé par le client ;
- `fichr_managed_optional` : futur service optionnel, jamais activé par défaut.

Les providers `user_cloud`, `self_hosted` distant et Fichr-managed ne sont que
des possibilités d’architecture. Aucun connecteur Google Drive, Dropbox,
OneDrive, iCloud, S3, WebDAV ou NAS n’est branché dans cette version.

## Séparation des données

Les données de travail destinées à rester client-owned sont :

- imports CSV et fichiers source ;
- images produit ;
- exports PDF, CSV et TXT ;
- futurs documents et pièces jointes ;
- à terme, `raw_data`, `draft_data`, `validated_data` et les audits détaillés.

Le serveur commercial Fichr doit conserver seulement le minimum nécessaire :

- comptes, sessions, memberships et métadonnées workspace minimales ;
- plans, entitlements, quotas et licences ;
- facturation, statuts de paiement et événements minimaux ;
- identité de vérification des exports si nécessaire ;
- logs techniques et sécurité minimaux.

La V1 reste local-first : les données produit et audits sont encore dans la
SQLite de l’instance. Elles ne sont pas migrées pendant cette passe. La couche
de provider prépare leur déplacement futur sans casser l’application actuelle.

## StorageProvider

`StorageProvider` définit les opérations serveur `writeFile`, `readFile`,
`deleteFile`, `exists` et `getMetadata`. Le code métier ne construit plus de
chemin système pour les imports, images et exports.

`LocalStorageProvider` est la seule implémentation active. Elle conserve les
répertoires existants :

```text
storage/imports/<workspace>/
storage/images/<workspace>/
storage/exports/<workspace>/
```

Les anciens chemins présents dans SQLite restent lisibles. Les nouveaux
enregistrements utilisent une `storage_key` relative et non publique.

## Sécurité des chemins

Chaque opération :

- valide la clé de stockage ;
- refuse les chemins absolus, `..`, antislashs et segments dangereux ;
- vérifie que le workspace de la clé correspond au workspace autorisé ;
- résout la cible sous `LOCAL_STORAGE_ROOT` uniquement ;
- utilise des noms de fichiers contrôlés ou nettoyés ;
- n’expose jamais le chemin système dans l’interface.

La table `storage_objects` est un manifeste minimal. Elle stocke le provider,
le mode de propriété, le workspace, le type d’objet, la clé, le nom, le MIME,
la taille, le SHA-256 et la date de suppression. Elle ne stocke pas le contenu
des fichiers ni une fiche produit complète.

## Sauvegarde et multi-device

En mode local, le client doit sauvegarder ensemble la SQLite et le dossier
`storage`. Une copie de l’un sans l’autre peut produire des références de
fichiers manquantes.

Utilisez `npm run storage:doctor` pour comparer le manifeste aux fichiers et
`npm run backup:local` pour créer une archive privée SQLite + storage. Les
fichiers orphelins ne sont jamais supprimés automatiquement.

Pour tout backup transporté ou conservé hors de la machine locale, utilisez
`backup:local --encrypt` avec une passphrase temporaire. Cette passphrase n’est
jamais stockée et ne peut pas être récupérée par Fichr.

Avant une restauration manuelle, utilisez `backup:restore-preflight`. Cette
commande analyse le backup dans un dossier temporaire, compare ses workspaces
et son storage à l’installation active, puis nettoie le temporaire. Elle
n’écrit jamais dans la SQLite ou le storage actifs.

Les fichiers créés avant `storage_objects` peuvent être indexés avec un
dry-run puis un `--apply` explicite via `storage:index-legacy`. Cette opération
n’invente aucune relation métier.

La synchronisation multi-device, les conflits, la rotation des accès et les
URLs signées ne sont pas implémentés. Un futur provider devra préserver les
mêmes contrôles workspace et ne jamais rendre une clé publique par défaut.

## Exports sécurisés

Le fichier d’export reste client-owned. SQLite conserve uniquement les
métadonnées nécessaires : `export_code`, hashes, périmètre, statut et clé de
stockage. Le `file_hash` est toujours calculé sur le fichier final et
l’identité Fichr reste inchangée.

## Configuration locale

```sh
STORAGE_PROVIDER=local
DATA_OWNERSHIP_MODE=local_device
LOCAL_STORAGE_ROOT=./storage
```

Toute autre valeur de provider est refusée explicitement tant qu’un adaptateur
réel, sécurisé et choisi par le client n’existe pas.

Voir aussi :

- `docs/storage-health.md` ;
- `docs/backup-restore-preflight.md` ;
- `docs/local-backup-and-restore.md`.

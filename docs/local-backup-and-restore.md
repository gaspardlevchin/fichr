# Sauvegarde locale et restauration

Fichr distingue deux archives :

- `npm run archive:clean` : archive de code partageable, sans SQLite, storage
  réel ni `.env.local` ;
- `npm run backup:local` : sauvegarde ZIP privée non chiffrée, réservée au
  développement local ;
- `backup:local --encrypt` : sauvegarde privée chiffrée, recommandée dès que le
  fichier doit être transporté ou archivé.

## Créer une sauvegarde

```sh
npm run backup:local
npm run backup:local -- --workspace wks_...
npm run backup:local -- --email personne@example.com
```

La commande affiche :

> Cette archive contient des données utilisateur. Ne pas partager.

Le fichier est créé sous :

```text
artifacts/fichr-backup-YYYYMMDD-HHMMSSZ-XXXXXXXX.zip
```

Ne partagez jamais ce ZIP non chiffré.

## Créer un backup chiffré

```sh
BACKUP_PASSPHRASE="une-passphrase-longue" \
  npm run backup:local -- --workspace wks_... --encrypt
```

Le résultat utilise l’extension :

```text
artifacts/fichr-backup-YYYYMMDD-HHMMSSZ-XXXXXXXX.fichrbackup
```

La passphrase doit contenir au moins 12 caractères. Elle est lue uniquement
depuis l’environnement du processus, n’est pas écrite dans `.env.local`, le
backup ou les logs, et doit être supprimée de l’environnement après usage :

```sh
unset BACKUP_PASSPHRASE
```

Une commande saisie directement peut rester dans l’historique du shell. Pour un
backup sensible, utilisez un mécanisme temporaire adapté à votre shell et ne
commitez jamais la passphrase.

Fichr ne peut pas récupérer une passphrase perdue. Sans elle, le backup chiffré
est définitivement inutilisable.

Pour limiter les incohérences entre SQLite et les fichiers, évitez toute
écriture, import, image ou export pendant la création de la sauvegarde.

## Contenu

La sauvegarde contient uniquement :

- `database/fichr.sqlite`, créé avec l’API de snapshot SQLite ;
- le dossier `storage/` local ;
- `backup-manifest.json`.

Le snapshot SQLite couvre l’instance locale complète. Si elle contient plusieurs
workspaces, le script l’indique dans les warnings du manifeste. Le
`workspace_id` est le workspace de référence sélectionné, pas un export isolé
de ses seules lignes.

Le manifeste contient l’identifiant de backup, la date, la version, le
workspace demandé, tous les workspaces inclus, le nombre d’objets suivis, les
fichiers, tailles, SHA-256, la taille totale et une note de restauration.

La sauvegarde n’inclut pas :

- `.env.local` ou les secrets ;
- `node_modules` ;
- `.next` et les builds ;
- le code source complet ;
- un provider cloud.

Dans le ZIP interne, le champ `encrypted` vaut `false` car ce manifeste décrit
le contenu avant enveloppement. Pour un `.fichrbackup`, ce ZIP et son manifeste
détaillé sont entièrement chiffrés.

### Format chiffré

L’enveloppe publique contient uniquement :

- version du format ;
- `AES-256-GCM` ;
- paramètres `scrypt` ;
- salt et IV uniques ;
- tag d’authentification ;
- date de création ;
- avertissement de passphrase requise ;
- ciphertext Base64.

Elle n’expose ni workspace, ni chemin interne, ni DB, ni storage, ni checksums
détaillés. La clé est dérivée avec `scrypt` (`N=32768`, `r=8`, `p=1`) et le
contenu est authentifié par GCM. Aucun ZIP chiffré par mot de passe faible,
XOR ou algorithme personnalisé n’est utilisé.

## Vérifier un backup

La vérification ne restaure et ne modifie rien :

```sh
npm run backup:verify -- --file artifacts/fichr-backup-....zip
```

Elle contrôle la lisibilité ZIP, le manifeste, la présence de SQLite et
`storage/`, les compteurs, tailles et SHA-256. Elle refuse `.env.local`,
`node_modules`, `.next`, les chemins dangereux et les fichiers non décrits par
le manifeste.

Un backup vérifié est cohérent avec son manifeste. Cela ne signifie pas qu’il a
été restauré ni qu’une restauration répond aux besoins métier actuels.

Pour un backup chiffré, sans passphrase :

```sh
npm run backup:verify -- --file artifacts/fichr-backup-....fichrbackup
```

La commande indique que la passphrase est requise sans tenter de restaurer.
Pour effectuer la vérification complète :

```sh
BACKUP_PASSPHRASE="une-passphrase-longue" \
  npm run backup:verify -- --file artifacts/fichr-backup-....fichrbackup
```

Une mauvaise passphrase ou une enveloppe altérée est refusée avant toute
extraction. Les fichiers temporaires déchiffrés sont créés avec des permissions
privées et supprimés après succès ou erreur.

## Préparer une restauration

Avant toute manipulation manuelle, lancez le preflight :

```sh
npm run backup:restore-preflight -- --file artifacts/fichr-backup-....zip
```

Pour un backup chiffré :

```sh
BACKUP_PASSPHRASE="une-passphrase-longue" \
  npm run backup:restore-preflight -- \
  --file artifacts/fichr-backup-....fichrbackup
```

Le preflight extrait le contenu vérifié dans un dossier temporaire privé,
inspecte la SQLite et le storage, puis compare les workspaces et conflits
potentiels avec l’installation actuelle. Il ne modifie ni la DB active ni le
storage actif et nettoie les temporaires après succès ou erreur.

Les statuts sont `restorable`, `restorable_with_warnings` et
`not_restorable`. Un statut restaurable reste une compatibilité probable, pas
une restauration effectuée. Voir `docs/backup-restore-preflight.md`.

## Restauration manuelle

La restauration automatique n’est volontairement pas disponible.

1. Arrêter Fichr et conserver une copie de l’état actuel.
2. Lancer `backup:restore-preflight` et examiner tous les warnings.
3. Extraire l’archive dans un dossier temporaire privé.
4. Vérifier `sha256_manifest` et les checksums listés.
5. Remplacer la SQLite locale par `database/fichr.sqlite`.
6. Remplacer le dossier `storage/` par celui de l’archive.
7. Relancer `npm run storage:doctor`.
8. Démarrer Fichr uniquement après examen du rapport.

Ne mélangez pas une SQLite d’une sauvegarde avec le storage d’une autre.

## Limites

- le snapshot SQLite est cohérent, mais SQLite et le système de fichiers ne
  peuvent pas être figés atomiquement ensemble sans arrêter les écritures ;
- aucune restauration UI ;
- aucune commande de restauration active ;
- aucune rotation ou expiration automatique des backups ;
- aucune synchronisation multi-device.

Le chiffrement protège le fichier au repos, pas un appareil déjà compromis ni
une passphrase faible ou exposée dans l’historique shell.

Les futures étapes pourront ajouter une restauration guidée, une politique de
rétention et des providers choisis explicitement par le client.

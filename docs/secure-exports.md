# Identité sécurisée des exports

Chaque nouvel export Fichr reçoit une identité stable stockée dans SQLite.
Cette couche améliore la traçabilité et prépare une future vérification, sans
prétendre empêcher physiquement une copie, une modification ou une photocopie.

Le fichier généré reste client-owned et passe par le `StorageProvider`
workspace-scoped. Fichr ne stocke dans SQLite que sa clé relative et les
métadonnées de vérification nécessaires.

## Identité

Un export possède :

- un `export_code` unique, par exemple
  `FICHR-EXP-2026-001122334455` ;
- un `export_scope` (`product`, `selection` ou `catalog`) ;
- un `data_hash` SHA-256 calculé sur une représentation canonique des
  `validated_data` et des identifiants produit utilisés ;
- un `file_hash` SHA-256 calculé sur les octets du fichier généré ;
- un snapshot léger et trié des identifiants produit ;
- un nom de fichier contrôlé contenant l’`export_code` ;
- la date, le workspace, le créateur, le type et le nombre de produits.

L’`export_code` utilise l’année UTC et 48 bits d’entropie cryptographique. Une
contrainte unique en base empêche sa réutilisation. Le service vérifie également
la disponibilité du code avant création.

## Source des données

Les exports utilisent toujours exclusivement `products.validated_data`.

- une fiche non validée est refusée ;
- une fiche supprimée est refusée ;
- `draft_data` et `raw_data` ne sont jamais utilisés pour produire le document ;
- l’export ne modifie ni `validated_data` ni `draft_data` ;
- la sélection et le téléchargement restent limités au workspace de la session.
- la création respecte les droits et quotas du plan serveur ;
- le mode démo bloque le PDF mais conserve un faible quota TXT/CSV avec identité.

## Formats

### PDF

Chaque page contient discrètement :

- Fichr ;
- l’`export_code` ;
- le workspace ;
- le périmètre et le nombre de fiches ;
- la date ;
- le numéro de page ;
- les 12 premiers caractères du `data_hash` ;
- la mention `Document généré par Fichr` ;
- un filigrane typographique Fichr très léger.

Le dictionnaire de métadonnées interne du PDF reprend également l’identité
Fichr et le hash complet.

### TXT

Le fichier commence par un en-tête Fichr avec le code, la date, le périmètre,
le workspace, le nombre de fiches et le hash complet.

### CSV

Le CSV reste strictement tabulaire et compatible avec les outils externes. Il
ne reçoit aucun commentaire ni ligne de métadonnées. Son identité reste dans
l’enregistrement SQLite, son hash et son nom de fichier.

## Noms de fichiers

Les nouveaux fichiers suivent ce format :

```text
fichr-export-FICHR-EXP-2026-001122334455.pdf
fichr-export-FICHR-EXP-2026-001122334455.csv
fichr-export-FICHR-EXP-2026-001122334455.txt
```

Le nom n’utilise aucune entrée utilisateur et le stockage vérifie son format.

## Limites et suite

Cette fondation ne constitue pas un DRM et ne garantit pas qu’un document ne
peut pas être copié ou photocopié. Les étapes futures pourront ajouter :

- une route publique de vérification ne révélant aucune donnée privée ;
- un QR code local pointant vers cette vérification ;
- une révocation et une expiration explicites ;
- un destinataire et un filigrane individualisé ;
- un motif copy-evident mesuré et testé ;
- une signature cryptographique asymétrique.

## Vérification

```sh
npm run test:export-identity
npm run test:exports-selection
npm run test:catalog-bulk-export
npm run lint
npm run typecheck
npm run build
```

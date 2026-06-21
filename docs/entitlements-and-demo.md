# Entitlements et mode démo

Fichr résout les droits selon la chaîne suivante :

```text
session utilisateur -> membership workspace -> entitlement -> plan -> droits
```

Le client ne transmet jamais un plan faisant autorité. Toutes les mutations
lisent le workspace depuis `requireWorkspaceAccess`, puis contrôlent les droits
et quotas côté serveur.

## Plans internes

Les plans `demo`, `starter`, `studio`, `pro` et `business` sont définis dans
`src/server/entitlements/plans.ts`. Les montants et quotas sont des valeurs V1
modifiables, pas une tarification commerciale définitive.

Chaque plan définit :

- produits ;
- espaces ;
- imports ;
- exports ;
- images ;
- export PDF/CSV/TXT ;
- identité sécurisée des exports ;
- suggestions IA ;
- accès au checkout.

## Mode démo

Un workspace sans ligne `workspace_entitlements` est automatiquement en démo.
Les statuts `pending_payment`, `overdue`, `canceled`, `expired` et `suspended`
résolvent également les droits effectifs du plan démo.

Le mode démo conserve les données et les lectures :

- catalogue et fiches consultables ;
- exports historiques consultables ;
- restauration produit possible ;
- aucune suppression automatique lors d’un déclassement.

Il autorise un faible volume de produits, espaces, imports, images et exports
TXT/CSV. Le PDF et l’IA sont bloqués. Les exports autorisés conservent leur
identité sécurisée Fichr.

Les quotas V1 utilisés par le flux d’import sont :

- Démo : 10 produits, 2 espaces et 2 imports ;
- Studio : 500 produits, 40 espaces et 100 imports.

Avant de créer les brouillons, Fichr calcule toutes les lignes réellement
créables et tous les nouveaux espaces demandés. Si le quota restant est
insuffisant, aucun produit et aucun espace ne sont créés partiellement.

Exemples de messages attendus :

- `Votre plan Démo autorise 10 produits. Ce fichier contient 30 lignes prêtes à créer.`
- `Votre plan Démo autorise 2 espaces. Ce fichier demande 3 nouveaux espaces.`
- `Passez en Studio ou réduisez le fichier pour continuer.`

Un import bloqué par quota ne doit pas être présenté comme un échec CSV
générique.

La page détail affiche désormais ce contrôle avant l’action : lignes
créables, produits prévus, espaces nouveaux/réutilisés, quota consommé et
quota restant. Ce preflight visible est en lecture seule et utilise le même
cœur de calcul que la création effective.

La page Compte suit la même règle de lisibilité. Chaque limite indique :

- la ressource concernée ;
- le nombre utilisé sur la limite du plan ;
- le nombre encore disponible ;
- une progression discrète.

Les capacités PDF et exports sécurisés sont indiquées en toutes lettres. Un
ratio brut tel que `60 / 500` n’est jamais la seule explication visible.

## Enforcement serveur

Les contrôles sont appliqués avant :

- import CSV ;
- création des fiches depuis un import ;
- création d’un espace, y compris via `space_name` ;
- ajout d’une image ;
- export TXT, CSV ou PDF ;
- création d’une suggestion IA ;
- création d’un checkout.

Une limite produit ne rend jamais une fiche non validée exportable. Les règles
`validated_data` et soft delete restent appliquées après les entitlements.

## Scripts locaux

Appliquer directement un entitlement de développement :

```sh
npm run entitlement:set -- --email adresse@example.com --plan studio --status active --period-days 30
```

Cette commande charge l’environnement local via l’API ESM de `@next/env`,
retrouve le workspace existant de l’adresse et applique l’entitlement. Elle ne
crée pas silencieusement d’utilisateur ou de workspace et refuse la production.

Pour activer Studio localement pendant 30 jours :

```sh
npm run entitlement:set -- \
  --email gaspardlevchin.pro@gmail.com \
  --plan studio \
  --status active \
  --period-days 30
```

Simuler localement une facture payée et une souscription interne :

```sh
npm run billing:simulate-paid -- --email adresse@example.com --plan studio --amount 2900 --period-days 30
```

Ces commandes refusent `NODE_ENV=production`. Elles n’exposent aucune route
publique et ne remplacent pas la confirmation serveur d’un provider réel.

## Erreurs d’import explicites

Le flux distingue les erreurs de validation CSV, mapping incomplet, quota,
entitlement, workspace, lignes invalides et stockage. Le mapping doit au
minimum associer une colonne au champ `Titre`.

Une création réussie affiche le nombre de brouillons créés et de lignes
ignorées. Une erreur de quota est détectée avant la transaction de création ;
elle ne laisse donc aucun produit ou espace partiel.

Voir également `docs/import-flow.md`.

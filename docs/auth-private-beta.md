# Authentification bêta privée

Fichr utilise désormais une session opaque stockée côté serveur dans SQLite.
Le navigateur ne reçoit qu’un cookie de session `HttpOnly`; il ne contient ni
données utilisateur ni workspace et n’est jamais stocké dans `localStorage`.

## Stratégie

- aucun mot de passe maison ni flux de réinitialisation ;
- allowlist d’emails normalisés en minuscules ;
- token aléatoire, stocké uniquement sous forme de HMAC SHA-256 en base ;
- cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production, expirant après
  sept jours ;
- logout avec révocation de la session en base ;
- workspace principal résolu depuis `workspace_members` après validation de la
  session ;
- aucun `workspaceId` envoyé par le client n’est une source d’autorité.

Les champs `provider` et `provider_account_id` préparent le modèle utilisateur,
mais aucun OAuth Google ou Apple n’est intégré dans cette passe. Il n’existe pas
de faux bouton OAuth.

## Configuration locale

Copier `.env.example` vers `.env.local`, puis renseigner :

```sh
AUTH_SESSION_SECRET=une-valeur-aleatoire-d-au-moins-32-caracteres
PRIVATE_BETA_ALLOWED_EMAILS=adresse@example.com
AUTH_DEV_LOGIN_ENABLED=true
PRIVATE_BETA_DEV_EMAIL=adresse@example.com
```

`AUTH_SESSION_SECRET` doit contenir au moins 32 caractères.
`AUTH_DEV_LOGIN_ENABLED=true` ne fonctionne que lorsque
`NODE_ENV=development`. L’adresse saisie doit correspondre à
`PRIVATE_BETA_DEV_EMAIL` et appartenir à `PRIVATE_BETA_ALLOWED_EMAILS`.

Une variable présente mais trop courte n’est pas considérée comme configurée.
La page de connexion indique désormais quelle catégorie de configuration
manque, sans afficher la valeur ni le secret.

Pour générer un secret local suffisamment long :

```sh
openssl rand -hex 32
```

Copier la sortie dans `AUTH_SESSION_SECRET`, puis redémarrer `npm run dev` afin
que Next recharge `.env.local`.

Ne jamais commiter `.env.local`. En production, une allowlist vide refuse
l’accès et le mode de connexion de développement reste désactivé.

## Routes protégées

Les pages `/`, `/catalog`, `/products/[productId]`, `/spaces`, `/imports`,
`/exports` et `/settings` passent par une session serveur et un membership.
Une session valide sans rôle autorisé est redirigée vers `/access-denied`.
Les lectures et mutations produits, espaces, imports, exports, images, audits
et suggestions IA utilisent le même helper central `requireWorkspaceAccess`.
Les entitlements et la facturation réutilisent ce workspace serveur ; aucun
plan ou workspace transmis par le client n’est une source d’autorité.

Les téléchargements d’exports et les images produit interrogent également les
données avec le workspace issu de la session. Une ressource d’un autre
workspace est donc refusée.

## Vérification

Sans lancer de navigateur :

```sh
npm run test:auth-private-beta
npm run test:workspace-access
npm run lint
npm run typecheck
npm run build
```

Vérification visuelle locale :

```sh
npm run db:migrate
npm run dev
```

Ouvrir `/login`, se connecter avec l’adresse de développement autorisée, puis
vérifier le catalogue, une image privée, un téléchargement et la déconnexion.

## Limites actuelles

- un seul workspace principal est sélectionné automatiquement par membership ;
- il n’existe pas encore d’invitation d’équipe ;
- Google/Apple OAuth et les magic links ne sont pas intégrés ;
- le mode email de développement est un mécanisme local explicite, pas un mode
  de connexion de production.

La prochaine étape recommandée est l’intégration réelle d’un fournisseur OAuth
ou magic link, avec vérification de l’allowlist après retour du fournisseur.

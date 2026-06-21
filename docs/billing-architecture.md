# Architecture de facturation

Fichr possède sa logique commerciale. Mollie est uniquement un rail V1 pour
créer un paiement et notifier son statut.

La facturation et les entitlements restent séparés des données de travail
client-owned. Ils n’accordent jamais au serveur de facturation un accès aux
fiches, imports, images ou exports complets.

## Données internes

SQLite contient :

- `billing_customers` : liaison workspace/provider/email ;
- `billing_subscriptions` : plan, période, montant et statut internes ;
- `billing_invoices` : facture et référence de paiement ;
- `billing_events` : notification, hash, statut de traitement et idempotence ;
- `workspace_entitlements` : source de vérité des droits applicatifs.

Aucune carte bancaire, donnée de carte ou IBAN client n’est demandé ou stocké.

## Provider agnostique

Le contrat `BillingProvider` expose :

- création d’une session checkout ;
- lecture du statut de paiement ;
- parsing d’une notification webhook ;
- détection de configuration.

Le service de facturation importe uniquement le registre provider. Seul
`src/server/billing/providers/mollie.ts` connaît l’API Mollie. Un remplacement
futur consiste à ajouter un adaptateur et à modifier le registre, sans changer
les imports, produits, exports ou entitlements.

## Checkout

`startBillingCheckout` :

1. vérifie session, rôle workspace et droit checkout ;
2. valide le plan et la période contre les plans internes ;
3. crée une facture `pending` ;
4. appelle le provider ;
5. stocke uniquement l’identifiant de paiement et l’URL provider.

La facture pending n’active aucun droit. Une configuration Mollie incomplète
retourne une erreur claire et aucun appel réseau n’est tenté.

## Webhook Mollie

`/api/billing/mollie/webhook` :

1. vérifie le secret serveur présent dans l’URL webhook configurée ;
2. parse la notification puis relit le statut auprès de l’adaptateur Mollie ;
3. calcule un SHA-256 du payload et du statut provider observé ;
4. stocke un événement interne minimal ;
5. refuse le retraitement du même payload pour le même statut ;
6. traite la facture concernée.

Un statut `paid` crée la souscription interne, marque la facture payée et active
l’entitlement. Un statut pending, failed, canceled ou expired n’active rien.
Une facture déjà payée est ignorée afin de ne pas prolonger deux fois la
période. L’inclusion du statut dans la clé d’idempotence permet à une même
notification de passer de `pending` à `paid` sans être bloquée comme doublon.

Le payload brut complet n’est pas stocké : uniquement l’identifiant provider
minimal et son hash.

## Configuration

```sh
BILLING_PROVIDER=mollie
MOLLIE_API_KEY=
MOLLIE_WEBHOOK_SECRET=
MOLLIE_PROFILE_ID=
FICHR_APP_URL=http://localhost:3000
FICHR_BILLING_RETURN_URL=http://localhost:3000/account
```

Sans ces valeurs complètes, les pages compte/plans restent utilisables mais le
checkout affiche que la facturation automatisée n’est pas configurée.

## Limites V1

- l’adaptateur crée actuellement un paiement de période, pas encore un mandat
  ou abonnement récurrent Mollie ;
- l’annulation distante d’une souscription n’est pas encore implémentée ;
- aucun remboursement automatique ;
- aucune relance d’impayé ;
- les factures sont des enregistrements internes, pas encore des documents
  fiscaux téléchargeables.

Ces limites n’affaiblissent pas la règle principale : seuls les webhooks
validés côté serveur peuvent activer les droits billing-provider.

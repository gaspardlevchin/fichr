import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionGroup } from "@/components/ui/action-group";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getInvoiceStatusLabel,
  getPlanStatusLabel
} from "@/lib/plan-status";
import { getAccountBillingData } from "@/server/billing/service";
import { getCurrentWorkspaceStorageSummary } from "@/server/storage/health-service";
import { getDataOwnershipLabel } from "@/server/storage/ownership";

export const dynamic = "force-dynamic";

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    currency,
    style: "currency"
  }).format(amountCents / 100);
}

function formatPeriodDate(value: string | null): string {
  if (!value) {
    return "Non définie";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function UsageLimit({
  label,
  limit,
  unit,
  usageLabel,
  used
}: {
  label: string;
  limit: number;
  unit: string;
  usageLabel: string;
  used: number;
}) {
  const remaining = Math.max(0, limit - used);
  const progress = limit > 0 ? Math.round((used / limit) * 100) : 100;

  return (
    <article className="usage-limit">
      <div className="usage-limit-heading">
        <strong>{label}</strong>
        <span>
          {used} {usageLabel} sur {limit}
        </span>
      </div>
      <ProgressBar
        detail={`Disponibles : ${remaining} ${unit}${remaining !== 1 ? "s" : ""}`}
        label={`Utilisation ${label.toLowerCase()}`}
        value={progress}
      />
    </article>
  );
}

export default async function AccountPage() {
  const [data, storageSummary] = await Promise.all([
    getAccountBillingData(),
    getCurrentWorkspaceStorageSummary()
  ]);
  const { entitlement, plan, usage } = data.entitlement;

  return (
    <AppShell>
      <PageHeader
        actions={
          <ActionGroup>
            <Link className="primary-link" href="/billing/plans">
              Voir les plans
            </Link>
            <Link className="text-link compact-link" href="/settings">
              Ouvrir les réglages
            </Link>
          </ActionGroup>
        }
        description="Consultez votre plan, vos accès, votre stockage et vos sauvegardes."
        eyebrow="Accès et données"
        title="Compte"
        titleId="account-title"
      />

      <section
        className="result-panel content-card"
        aria-labelledby="account-plan-title"
      >
        <div className="content-card-inner">
        <div className="result-header">
          <div>
            <p className="eyebrow">{getPlanStatusLabel(entitlement.status)}</p>
            <h2 id="account-plan-title">{plan.label}</h2>
          </div>
          <StatusBadge status={entitlement.status}>
            {getPlanStatusLabel(entitlement.status)}
          </StatusBadge>
        </div>
        <dl className="metadata-grid">
          <div>
            <dt>Email</dt>
            <dd>{data.email}</dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd>{data.workspaceName}</dd>
          </div>
          <div>
            <dt>Début de période</dt>
            <dd>{formatPeriodDate(entitlement.currentPeriodStart)}</dd>
          </div>
          <div>
            <dt>Fin de période</dt>
            <dd>{formatPeriodDate(entitlement.currentPeriodEnd)}</dd>
          </div>
        </dl>
        {!data.billingConfigured ? (
          <p className="muted-text">
            Le changement de plan en ligne n’est pas encore disponible.
          </p>
        ) : null}
        </div>
      </section>

      <section
        className="result-panel content-card"
        aria-labelledby="account-usage-title"
      >
        <div className="content-card-inner">
        <div className="result-header">
          <div>
            <p className="eyebrow">Utilisation</p>
            <h2 id="account-usage-title">Limites principales</h2>
          </div>
        </div>
        <div className="usage-limit-grid">
          <UsageLimit
            label="Produits"
            limit={plan.quotas.maxProducts}
            unit="produit"
            usageLabel="produits utilisés"
            used={usage.maxProducts}
          />
          <UsageLimit
            label="Espaces"
            limit={plan.quotas.maxSpaces}
            unit="espace"
            usageLabel="espaces utilisés"
            used={usage.maxSpaces}
          />
          <UsageLimit
            label="Imports"
            limit={plan.quotas.maxImports}
            unit="import"
            usageLabel="imports utilisés"
            used={usage.maxImports}
          />
          <UsageLimit
            label="Exports"
            limit={plan.quotas.maxExports}
            unit="export"
            usageLabel="exports utilisés"
            used={usage.maxExports}
          />
          <UsageLimit
            label="Images"
            limit={plan.quotas.maxImages}
            unit="image"
            usageLabel="images utilisées"
            used={usage.maxImages}
          />
        </div>
        <dl className="metadata-grid account-feature-grid">
          <div>
            <dt>PDF</dt>
            <dd>{plan.features.export_pdf ? "Inclus" : "Non inclus"}</dd>
          </div>
          <div>
            <dt>Exports sécurisés</dt>
            <dd>
              {plan.features.secure_export_identity ? "Inclus" : "Limités"}
            </dd>
          </div>
        </dl>
        </div>
      </section>

      <section
        className="result-panel content-card"
        aria-labelledby="account-storage-title"
      >
        <div className="content-card-inner">
        <div className="result-header">
          <div>
            <p className="eyebrow">Stockage des données</p>
            <h2 id="account-storage-title">État du stockage</h2>
            <p className="muted-text">
              Mode configuré :{" "}
              {getDataOwnershipLabel(storageSummary.ownershipMode)}
            </p>
          </div>
          <span className="status-pill">Contrôlé par le workspace</span>
        </div>
        <p className="muted-text">
          Les données de travail restent dans l’environnement configuré pour ce
          workspace.
        </p>
        <p className="muted-text">
          Le serveur Fichr ne doit conserver que les informations nécessaires
          au compte, à l’accès, à la facturation et à la vérification.
        </p>
        <dl className="metadata-grid">
          <div>
            <dt>Provider</dt>
            <dd>{storageSummary.providerKind}</dd>
          </div>
          <div>
            <dt>Fichiers suivis</dt>
            <dd>{storageSummary.trackedFileCount}</dd>
          </div>
        </dl>
        <details className="technical-details">
          <summary>Commandes de diagnostic et de sauvegarde</summary>
          <div className="technical-command-list">
            <code>
              npm run storage:doctor -- --workspace {storageSummary.workspaceId}
            </code>
            <code>
              npm run storage:index-legacy -- --workspace{" "}
              {storageSummary.workspaceId} --dry-run
            </code>
            <code>
              npm run backup:local -- --workspace {storageSummary.workspaceId}
            </code>
            <code>
              npm run backup:verify -- --file artifacts/fichr-backup-....zip
            </code>
            <code>
              npm run backup:restore-preflight -- --file
              artifacts/fichr-backup-....zip
            </code>
          </div>
          <p className="muted-text">
            Les sauvegardes non chiffrées ne doivent jamais être partagées.
            Ces commandes ne sont pas exécutées depuis l’interface.
          </p>
        </details>
        </div>
      </section>

      <section
        className="result-panel content-card"
        aria-labelledby="account-invoices-title"
      >
        <div className="content-card-inner">
        <div className="result-header">
          <div>
            <p className="eyebrow">Factures</p>
            <h2 id="account-invoices-title">Historique interne</h2>
          </div>
        </div>
        {data.invoices.length === 0 ? (
          <EmptyState
            contained
            description="Les factures apparaîtront ici lorsqu’un paiement sera enregistré."
            label="Aucune facture"
            title="Aucune facture"
          />
        ) : (
          <div className="import-list">
            {data.invoices.map((invoice) => (
              <div className="export-list-row" key={invoice.id}>
                <span>{invoice.invoiceNumber}</span>
                <span>{invoice.planKey}</span>
                <span>{formatMoney(invoice.amountCents, invoice.currency)}</span>
                <StatusBadge status={invoice.status}>
                  {getInvoiceStatusLabel(invoice.status)}
                </StatusBadge>
              </div>
            ))}
          </div>
        )}
        </div>
      </section>
    </AppShell>
  );
}

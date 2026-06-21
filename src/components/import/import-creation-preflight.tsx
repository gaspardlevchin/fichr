import Link from "next/link";

import { ProgressBar } from "@/components/ui/progress-bar";
import { UiIcon } from "@/components/ui/ui-icon";
import { formatCount } from "@/lib/format-count";
import { getImportPreflightStatusLabel } from "@/lib/import-status";
import { createDraftProductsAction } from "@/server/imports/actions";
import type { ImportCreationPreflight } from "@/types/import";

function getQuotaProgress(used: number, limit: number): number {
  return limit > 0 ? Math.round((used / limit) * 100) : 100;
}

export function ImportCreationPreflightPanel({
  created,
  importId,
  preflight,
  skipped
}: {
  created?: string;
  importId: string;
  preflight: ImportCreationPreflight;
  skipped?: string;
}) {
  const processed = preflight.status === "already_processed";
  const hasSuccess = created !== undefined || skipped !== undefined;

  return (
    <section
      className="result-panel import-preflight-panel"
      aria-labelledby="import-preflight-title"
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">Préparation</p>
          <h2 id="import-preflight-title">Préparation de la création</h2>
        </div>
        <span
          className={`status-pill import-preflight-status-${preflight.status}`}
        >
          {getImportPreflightStatusLabel(preflight.status)}
        </span>
      </div>

      {hasSuccess ? (
        <div className="import-success-summary" role="status">
          <div>
            <strong>{created ?? "0"} produits brouillons créés.</strong>
            <span>{skipped ?? "0"} lignes ignorées.</span>
          </div>
          <Link
            className="primary-link compact-link"
            href={`/catalog?import=${encodeURIComponent(importId)}`}
          >
            Voir les produits créés
            <UiIcon name="arrow-right" />
          </Link>
        </div>
      ) : null}

      <dl className="metadata-grid import-preflight-metrics">
        <div>
          <dt>Lignes totales</dt>
          <dd>{preflight.totalRowCount}</dd>
        </div>
        <div>
          <dt>{processed ? "Lignes créées" : "Lignes créables"}</dt>
          <dd>{preflight.creatableRowCount}</dd>
        </div>
        <div>
          <dt>Ignorées ou invalides</dt>
          <dd>{preflight.ignoredRowCount}</dd>
        </div>
        <div>
          <dt>Produits à créer</dt>
          <dd>{preflight.productsToCreate}</dd>
        </div>
        <div>
          <dt>Espaces à créer</dt>
          <dd>{preflight.newSpaceCount}</dd>
        </div>
        <div>
          <dt>Espaces réutilisés</dt>
          <dd>{preflight.reusedSpaceCount}</dd>
        </div>
      </dl>

      <div className="import-quota-grid">
        <div>
          <p>
            <strong>Plan {preflight.planLabel}</strong>
            <span>Produits</span>
          </p>
          <ProgressBar
            detail={`${preflight.productQuota.used}/${preflight.productQuota.limit} utilisés · ${preflight.productQuota.remaining} restants`}
            label="Quota produits"
            value={getQuotaProgress(
              preflight.productQuota.used,
              preflight.productQuota.limit
            )}
          />
        </div>
        <div>
          <p>
            <strong>Plan {preflight.planLabel}</strong>
            <span>Espaces</span>
          </p>
          <ProgressBar
            detail={`${preflight.spaceQuota.used}/${preflight.spaceQuota.limit} utilisés · ${preflight.spaceQuota.remaining} restants`}
            label="Quota espaces"
            value={getQuotaProgress(
              preflight.spaceQuota.used,
              preflight.spaceQuota.limit
            )}
          />
        </div>
      </div>

      {preflight.archivedConflictSpaceCount > 0 ? (
        <p className="muted-text">
          {formatCount(
            preflight.archivedConflictSpaceCount,
            "nom correspond",
            "noms correspondent"
          )}{" "}
          à un espace archivé. Les produits concernés resteront sans espace.
        </p>
      ) : null}

      {preflight.blockingMessage ? (
        <div className="warning-panel" role="alert">
          <p>{preflight.blockingMessage}</p>
        </div>
      ) : preflight.status === "ready" ? (
        <p className="success-text">
          {preflight.productsToCreate} produits prêts à être créés. Plan{" "}
          {preflight.planLabel} : quotas suffisants.
        </p>
      ) : processed ? (
        <p className="success-text">
          Brouillons déjà créés. Cette action ne peut pas recréer les mêmes
          lignes.
        </p>
      ) : null}

      <div className="inline-actions import-preflight-actions">
        {processed ? (
          <Link
            className="primary-link compact-link"
            href={`/catalog?import=${encodeURIComponent(importId)}`}
          >
            Voir les produits créés
            <UiIcon name="arrow-right" />
          </Link>
        ) : (
          <form action={createDraftProductsAction}>
            <input name="importId" type="hidden" value={importId} />
            <button
              className="primary-button"
              disabled={!preflight.canCreate}
              type="submit"
            >
              <UiIcon name="check" />
              Créer les produits brouillons
            </button>
          </form>
        )}
        {!preflight.canCreate && !processed ? (
          <span className="muted-state">
            Corrigez le blocage indiqué avant de lancer la création.
          </span>
        ) : null}
      </div>
    </section>
  );
}

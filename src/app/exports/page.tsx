import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { DeleteExportForm } from "@/components/export/delete-export-form";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { UiIcon } from "@/components/ui/ui-icon";
import { getExportStatusLabel } from "@/lib/export-status";
import { formatCount } from "@/lib/format-count";
import { createCatalogExportAction } from "@/server/exports/actions";
import { getCatalogExportsPageData } from "@/server/exports/service";
import type {
  CatalogExportSummary,
  CatalogExportType,
  ValidatedCatalogExportProduct
} from "@/types/export";

export const dynamic = "force-dynamic";

type ExportsPageProps = {
  searchParams?: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
  }>;
};

function ExportForm({
  disabled,
  exportType,
  label
}: {
  disabled: boolean;
  exportType: CatalogExportType;
  label: string;
}) {
  return (
    <form action={createCatalogExportAction}>
      <input name="exportType" type="hidden" value={exportType} />
      <button className="primary-button" disabled={disabled} type="submit">
        <UiIcon name="download" />
        {label}
      </button>
    </form>
  );
}

function SelectedProductsExportForm({
  canExportCsv,
  canExportPdf,
  canExportText,
  exportLimitReached,
  products
}: {
  canExportCsv: boolean;
  canExportPdf: boolean;
  canExportText: boolean;
  exportLimitReached: boolean;
  products: ValidatedCatalogExportProduct[];
}) {
  if (products.length === 0) {
    return (
      <EmptyState
        action={
          <Link className="text-link compact-link" href="/catalog">
            Ouvrir le catalogue
            <UiIcon name="arrow-right" />
          </Link>
        }
        contained
        description="Validez une fiche depuis le catalogue pour préparer une sélection."
        label="Aucun produit validé"
        title="Aucun produit prêt à exporter"
      />
    );
  }

  return (
    <form action={createCatalogExportAction}>
      <input name="exportMode" type="hidden" value="selected" />

      <div className="import-list" aria-label="Produits valides exportables">
        {products.map((product) => (
          <label className="export-list-row" key={product.id}>
            <span className="catalog-checkbox-label">
              <input
                className="native-checkbox"
                name="productIds"
                type="checkbox"
                value={product.id}
              />
              <span>{product.title}</span>
            </span>
            <span className="status-pill">Validé</span>
            <span>{product.category ?? "Sans catégorie"}</span>
            <span>{product.sku ?? "Sans SKU"}</span>
          </label>
        ))}
      </div>

      <div className="inline-actions">
        <button
          className="primary-button"
          disabled={!canExportText || exportLimitReached}
          name="exportType"
          type="submit"
          value="text"
        >
          <UiIcon name="download" />
          Exporter la sélection en TXT
        </button>
        <button
          className="primary-button"
          disabled={!canExportCsv || exportLimitReached}
          name="exportType"
          type="submit"
          value="csv"
        >
          <UiIcon name="download" />
          Exporter la sélection en CSV
        </button>
        <button
          className="primary-button"
          disabled={!canExportPdf || exportLimitReached}
          name="exportType"
          type="submit"
          value="pdf"
        >
          <UiIcon name="download" />
          Exporter la sélection en PDF
        </button>
      </div>
    </form>
  );
}

function ExportHistory({ exports }: { exports: CatalogExportSummary[] }) {
  if (exports.length === 0) {
    return (
      <EmptyState
        action={
          <Link className="text-link compact-link" href="/catalog">
            Ouvrir le catalogue
            <UiIcon name="arrow-right" />
          </Link>
        }
        contained
        description="Validez une fiche produit, puis générez un document depuis cette page."
        label="Aucun export"
        title="Aucun export généré"
      />
    );
  }

  return (
    <div className="history-list import-list">
      {exports.map((exportRecord) => (
        <div
          className="history-card export-list-row export-history-row"
          key={exportRecord.id}
        >
          <div className="export-history-main">
            <strong className="export-history-code">
              {exportRecord.exportCode ?? exportRecord.id}
            </strong>
            <span className="export-history-meta">
              {exportRecord.exportType.toUpperCase()} ·{" "}
              {new Intl.DateTimeFormat("fr-FR", {
                dateStyle: "medium",
                timeStyle: "short"
              }).format(new Date(exportRecord.createdAt))}
            </span>
          </div>
          <StatusBadge status={exportRecord.status}>
            {getExportStatusLabel(exportRecord.status)}
          </StatusBadge>
          <span>
            {formatCount(exportRecord.productCount, "produit", "produits")}
          </span>
          {exportRecord.status === "complete" && exportRecord.storagePath ? (
            <div className="export-row-actions">
              <Link
                className="text-link compact-link"
                href={`/exports/${exportRecord.id}/download`}
              >
                <UiIcon name="download" />
                Télécharger
              </Link>
              <DeleteExportForm exportId={exportRecord.id} />
            </div>
          ) : (
            <span className="muted-state">
              {exportRecord.status === "deleted"
                ? "Export révoqué"
                : exportRecord.status === "failed"
                  ? "Génération échouée"
                  : "Génération en cours"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default async function ExportsPage({ searchParams }: ExportsPageProps) {
  const query = await searchParams;
  const data = await getCatalogExportsPageData();

  return (
    <AppShell>
      <PageHeader
        actions={
          <Link
            className="text-link compact-link"
            href="/catalog?status=validated"
          >
            Voir les fiches validées
          </Link>
        }
        description="Générez et retrouvez les documents issus des fiches validées."
        eyebrow="Documents"
        title="Exports"
        titleId="exports-title"
      />

      <section
        className="result-panel content-card"
        aria-labelledby="export-create-title"
      >
        <div className="content-card-inner">
        <div className="result-header">
          <div>
            <p className="eyebrow">Produits disponibles</p>
            <h2 id="export-create-title">Exporter tous les produits validés</h2>
          </div>
          <span className="status-pill">
            {formatCount(data.validatedProductCount, "validé", "validés")}
          </span>
        </div>

        <dl className="metadata-grid">
          <div>
            <dt>Produits validés</dt>
            <dd>{data.validatedProductCount}</dd>
          </div>
          <div>
            <dt>Produits ignorés</dt>
            <dd>{data.skippedProductCount}</dd>
          </div>
        </dl>

        <ProgressBar
          detail={`${formatCount(data.validatedProductCount, "validé", "validés")} sur ${formatCount(
            data.validatedProductCount + data.skippedProductCount,
            "produit",
            "produits"
          )}`}
          label="Produits prêts à exporter"
          value={
            data.validatedProductCount + data.skippedProductCount === 0
              ? 0
              : Math.round(
                  (data.validatedProductCount /
                    (data.validatedProductCount + data.skippedProductCount)) *
                    100
                )
          }
        />

        {query?.error ? (
          <InlineAlert variant="error">{query.error}</InlineAlert>
        ) : null}
        {query?.created ? (
          <InlineAlert variant="success">
            Export créé : {query.created}
          </InlineAlert>
        ) : null}
        {query?.deleted ? (
          <InlineAlert variant="success">
            Export révoqué : {query.deleted}
          </InlineAlert>
        ) : null}

        <div className="inline-actions">
          <ExportForm
            disabled={
              data.validatedProductCount === 0 ||
              !data.canExportText ||
              data.exportLimitReached
            }
            exportType="text"
            label="Exporter tout en texte"
          />
          <ExportForm
            disabled={
              data.validatedProductCount === 0 ||
              !data.canExportCsv ||
              data.exportLimitReached
            }
            exportType="csv"
            label="Exporter tout en CSV"
          />
          <ExportForm
            disabled={
              data.validatedProductCount === 0 ||
              !data.canExportPdf ||
              data.exportLimitReached
            }
            exportType="pdf"
            label="Exporter tout en PDF"
          />
        </div>
        </div>
      </section>

      <section
        className="result-panel content-card"
        aria-labelledby="export-selection-title"
      >
        <div className="content-card-inner">
        <div className="result-header">
          <div>
            <p className="eyebrow">Sélection</p>
            <h2 id="export-selection-title">Produits validés</h2>
          </div>
        </div>

        {!data.canExportPdf ? (
          <p className="muted-text">
            L’export PDF nécessite un plan actif.
          </p>
        ) : null}
        {data.exportLimitReached ? (
          <p className="error-text">Limite d’exports atteinte pour ce plan.</p>
        ) : null}
        <SelectedProductsExportForm
          canExportCsv={data.canExportCsv}
          canExportPdf={data.canExportPdf}
          canExportText={data.canExportText}
          exportLimitReached={data.exportLimitReached}
          products={data.validatedProducts}
        />
        </div>
      </section>

      <section
        className="result-panel content-card"
        aria-labelledby="export-history-title"
      >
        <div className="content-card-inner">
        <div className="result-header">
          <div>
            <p className="eyebrow">Historique</p>
            <h2 id="export-history-title">Exports existants</h2>
          </div>
        </div>

        <ExportHistory exports={data.exports} />
        </div>
      </section>
    </AppShell>
  );
}

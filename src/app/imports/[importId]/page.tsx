import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ImportCreationPreflightPanel } from "@/components/import/import-creation-preflight";
import { ImportCreatedProducts } from "@/components/import/import-created-products";
import { ImportFlowSteps } from "@/components/import/import-flow-steps";
import { ImportValidationSummary } from "@/components/import/import-validation-summary";
import { ProgressBar } from "@/components/ui/progress-bar";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/ui/page-header";
import { UiIcon } from "@/components/ui/ui-icon";
import { formatCount } from "@/lib/format-count";
import { getImportStatusLabel } from "@/lib/import-status";
import {
  applyCsvMappingPresetAction,
  correctImportRowAction,
  validateColumnMappingAction
} from "@/server/imports/actions";
import {
  IGNORE_COLUMN_VALUE,
  standardProductFields,
  suggestColumnMapping
} from "@/server/imports/mapping";
import {
  getImportPreview,
  getImportCreationPreflight,
  getImportSpaceAssignmentReview
} from "@/server/imports/queries";
import { getImportedProductBatchPreview } from "@/server/products/queries";
import type {
  ColumnMapping,
  ImportSpaceAssignmentReview,
  ImportPreview,
  ImportStatus,
  ImportValidationFilter,
  ImportValidationRow,
  ImportValidationRowStatus,
  ProductFieldKey,
  RawImportRow
} from "@/types/import";

export const dynamic = "force-dynamic";

type ImportDetailPageProps = {
  params: Promise<{ importId: string }>;
  searchParams?: Promise<{
    created?: string;
    corrected?: string;
    error?: string;
    rowStatus?: string;
    skipped?: string;
  }>;
};

const validationFilters: Array<{
  key: ImportValidationFilter;
  label: string;
}> = [
  { key: "all", label: "Toutes" },
  { key: "ready", label: "Prêtes" },
  { key: "warning", label: "À vérifier" },
  { key: "error", label: "Invalides" },
  { key: "skipped", label: "Ignorées" }
];

const rowStatusLabels: Record<ImportValidationRowStatus, string> = {
  error: "invalide",
  ready: "prête",
  skipped: "ignorée",
  warning: "à vérifier"
};

function getImportProgress(status: ImportStatus): number {
  return {
    uploaded: 20,
    parsed: 45,
    mapped: 75,
    processed: 100,
    failed: 0
  }[status];
}

const correctionFieldPriority: ProductFieldKey[] = [
  "title",
  "description",
  "current_price",
  "desired_price",
  "cost_price",
  "image_url",
  "materials",
  "dimensions",
  "origin"
];

function parseRowStatusFilter(value?: string): ImportValidationFilter {
  return validationFilters.some((filter) => filter.key === value)
    ? (value as ImportValidationFilter)
    : "all";
}

function getActiveMapping(preview: ImportPreview): ColumnMapping {
  return (
    preview.columnMapping ??
    preview.mappingPresetSuggestion?.mapping ??
    suggestColumnMapping(preview.detectedColumns)
  );
}

function getMappingWarnings(mapping: ColumnMapping): string[] {
  const warnings: string[] = [];
  const hasPriceMapping = Boolean(
    mapping.current_price || mapping.desired_price || mapping.cost_price
  );

  if (!mapping.title) {
    warnings.push("Aucun titre n’est mappé.");
  }

  if (!hasPriceMapping) {
    warnings.push("Aucun prix n’est mappé.");
  }

  return warnings;
}

function ImportPreviewTable({ preview }: { preview: ImportPreview }) {
  if (preview.rows.length === 0) {
    return <p className="muted-text">Aucune ligne disponible pour l’aperçu.</p>;
  }

  return (
    <div className="table-scroll" aria-label="Aperçu des premières lignes">
      <table className="preview-table">
        <thead>
          <tr>
            {preview.detectedColumns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex + 1}`}>
              {preview.detectedColumns.map((column) => (
                <td key={column}>{row[column]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getFilterCount(
  preview: ImportPreview,
  filter: ImportValidationFilter
): number {
  const summary = preview.validationSummary;

  if (filter === "all") {
    return summary.totalRows;
  }

  if (filter === "ready") {
    return summary.readyRows;
  }

  if (filter === "warning") {
    return summary.warningRows;
  }

  if (filter === "error") {
    return summary.invalidRows;
  }

  return summary.skippedRows;
}

function getRowPreview(rawData: RawImportRow, columns: string[]): string {
  const values = columns
    .flatMap((column) => {
      const value = rawData[column];
      return value ? [`${column}: ${value}`] : [];
    })
    .slice(0, 4);

  return values.length > 0 ? values.join(" - ") : "Aucune valeur exploitable";
}

function getRowStatusHelp(status: ImportValidationRowStatus): string {
  if (status === "error") {
    return "Cette ligne ne créera pas de fiche produit.";
  }

  if (status === "skipped") {
    return "Cette ligne est ignorée et ne créera pas de fiche produit.";
  }

  if (status === "warning") {
    return "Cette ligne peut continuer, mais demande attention.";
  }

  return "Cette ligne est prête.";
}

function getCorrectionColumns(preview: ImportPreview): string[] {
  const activeMapping = getActiveMapping(preview);
  const detectedColumns = new Set(preview.detectedColumns);
  const mappedPriorityColumns = correctionFieldPriority.flatMap((field) => {
    const column = activeMapping[field];

    return column && detectedColumns.has(column) ? [column] : [];
  });
  const uniqueMappedPriorityColumns = Array.from(new Set(mappedPriorityColumns));

  if (uniqueMappedPriorityColumns.length > 0) {
    return uniqueMappedPriorityColumns.slice(0, 7);
  }

  return preview.detectedColumns.slice(0, 5);
}

function ImportRowCorrectionForm({
  activeFilter,
  preview,
  row
}: {
  activeFilter: ImportValidationFilter;
  preview: ImportPreview;
  row: ImportValidationRow;
}) {
  if (row.status !== "error" && row.status !== "warning") {
    return null;
  }

  const correctionColumns = getCorrectionColumns(preview);

  if (correctionColumns.length === 0) {
    return null;
  }

  return (
    <details className="row-correction-panel">
      <summary>Corriger la ligne</summary>
      <form action={correctImportRowAction} className="row-correction-form">
        <input name="importId" type="hidden" value={preview.id} />
        <input name="rowId" type="hidden" value={row.id} />
        <input name="rowStatus" type="hidden" value={activeFilter} />
        <div className="mapping-grid">
          {correctionColumns.map((column) => (
            <label className="mapping-row" key={`${row.id}-${column}`}>
              <span>{column}</span>
              <input
                className="text-input"
                defaultValue={row.rawData[column] ?? ""}
                name={`rowValue.${column}`}
              />
            </label>
          ))}
        </div>
        <div className="inline-actions">
          <button className="primary-button" type="submit">
            <UiIcon name="check" />
            Enregistrer la correction
          </button>
          {row.hasCorrections ? (
            <span className="muted-state">Correction déjà enregistrée</span>
          ) : null}
        </div>
      </form>
    </details>
  );
}

function ImportRowsValidationPanel({
  activeFilter,
  preview
}: {
  activeFilter: ImportValidationFilter;
  preview: ImportPreview;
}) {
  const hasAnyIssue =
    preview.validationSummary.invalidRows > 0 ||
    preview.validationSummary.skippedRows > 0 ||
    preview.validationSummary.warningRows > 0;

  return (
    <section className="result-panel" aria-labelledby="row-validation-title">
      <div className="result-header">
        <div>
          <p className="eyebrow">Validation lignes</p>
          <h2 id="row-validation-title">Résultats ligne par ligne</h2>
        </div>
        <span className="status-pill">
          {formatCount(
            preview.validationRows.length,
            "ligne affichée",
            "lignes affichées"
          )}
        </span>
      </div>

      {!hasAnyIssue ? (
        <p className="success-text">Aucune erreur de validation détectée.</p>
      ) : (
        <p className="muted-text">
          {formatCount(
            preview.validationSummary.invalidRows +
              preview.validationSummary.warningRows +
              preview.validationSummary.skippedRows,
            "ligne demande",
            "lignes demandent"
          )}{" "}
          une vérification. Les lignes valides peuvent continuer si les quotas
          le permettent.
        </p>
      )}

      <details className="row-validation-details">
        <summary>Voir et corriger les lignes</summary>
        <div className="inline-actions" aria-label="Filtres validation lignes">
          {validationFilters.map((filter) => (
            <Link
              className={
                activeFilter === filter.key
                  ? "primary-link compact-link"
                  : "text-link compact-link"
              }
              href={
                filter.key === "all"
                  ? `/imports/${preview.id}`
                  : `/imports/${preview.id}?rowStatus=${filter.key}`
              }
              key={filter.key}
            >
              {filter.label} ({getFilterCount(preview, filter.key)})
            </Link>
          ))}
        </div>

        {preview.validationRows.length === 0 ? (
          <p className="muted-text">Aucune ligne pour ce filtre.</p>
        ) : (
          <div className="import-list">
            {preview.validationRows.map((row) => (
              <div className="import-list-row" key={row.id}>
                <span>
                  Ligne {row.rowIndex} -{" "}
                  {getRowPreview(row.rawData, preview.detectedColumns)}
                  {row.hasCorrections ? " - corrigée" : ""}
                </span>
                <span className={`status-pill status-${row.status}`}>
                  {rowStatusLabels[row.status]}
                </span>
                <span>{row.errorMessage ?? getRowStatusHelp(row.status)}</span>
                <ImportRowCorrectionForm
                  activeFilter={activeFilter}
                  preview={preview}
                  row={row}
                />
              </div>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}

function MappingForm({ preview }: { preview: ImportPreview }) {
  const activeMapping = getActiveMapping(preview);
  const mappedColumns = new Set(Object.values(activeMapping));
  const ignoredColumns = preview.detectedColumns.filter(
    (column) => !mappedColumns.has(column)
  );
  const recognizedColumns = preview.detectedColumns.filter((column) =>
    mappedColumns.has(column)
  );
  const warnings = getMappingWarnings(activeMapping);
  const missingRecommendedFields = standardProductFields.filter(
    (field) => field.recommended && !activeMapping[field.key]
  );

  return (
    <section className="result-panel" aria-labelledby="mapping-title">
      <div className="result-header">
        <div>
          <p className="eyebrow">Mapping colonnes</p>
          <h2 id="mapping-title">Associer les colonnes CSV</h2>
        </div>
        <span className="status-pill">
          {preview.columnMapping ? "mapping sauvegardé" : "suggestion auto"}
        </span>
      </div>

      {warnings.length > 0 ? (
        <div className="warning-panel" aria-label="Warnings mapping">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {missingRecommendedFields.length > 0 ? (
        <p className="muted-text">
          Champs recommandés manquants :{" "}
          {missingRecommendedFields.map((field) => field.label).join(", ")}.
        </p>
      ) : null}

      {preview.mappingPresetSuggestion ? (
        <div className="notice-panel" aria-label="Mapping précédent détecté">
          <div>
            <p>
              Mapping précédent détecté. Ce mapping vient d’un import précédent
              du même workspace.
            </p>
            <p>
              Compatibilité :{" "}
              {preview.mappingPresetSuggestion.matchType === "exact"
                ? "colonnes identiques"
                : "colonnes proches"}
              . Champs proposés : {preview.mappingPresetSuggestion.mappedFieldCount}.
            </p>
          </div>
          <form action={applyCsvMappingPresetAction} className="inline-actions">
            <input name="importId" type="hidden" value={preview.id} />
            <input
              name="presetId"
              type="hidden"
              value={preview.mappingPresetSuggestion.id}
            />
            <button className="primary-button" type="submit">
              <UiIcon name="check" />
              Appliquer ce mapping
            </button>
          </form>
        </div>
      ) : null}

      <form action={validateColumnMappingAction} className="mapping-form">
        <input name="importId" type="hidden" value={preview.id} />
        <div className="mapping-grid" role="group" aria-label="Mapping CSV">
          {standardProductFields.map((field) => (
            <label className="mapping-row" key={field.key}>
              <span>
                {field.label}
                {field.key === "title" ? (
                  <strong className="recommended-marker"> obligatoire</strong>
                ) : field.recommended ? (
                  <strong className="recommended-marker"> recommandé</strong>
                ) : null}
              </span>
              <select
                className="select-input"
                defaultValue={activeMapping[field.key] ?? IGNORE_COLUMN_VALUE}
                name={`mapping.${field.key}`}
              >
                <option value={IGNORE_COLUMN_VALUE}>Ignorer ce champ</option>
                {preview.detectedColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button className="primary-button" type="submit">
          <UiIcon name="check" />
          Valider le mapping
        </button>
      </form>

      <div className="mapping-column-summary">
        <div>
          <h3>Colonnes reconnues</h3>
          <div className="column-list" aria-label="Colonnes reconnues">
            {recognizedColumns.length > 0 ? (
              recognizedColumns.map((column) => (
                <span className="column-used" key={column}>
                  <UiIcon name="check" size={14} />
                  {column}
                </span>
              ))
            ) : (
              <span>Aucune colonne reconnue</span>
            )}
          </div>
        </div>
        <div>
          <h3>Colonnes non utilisées</h3>
          <p className="muted-text">
            Elles seront ignorées et ne bloquent pas l’import.
          </p>
          <div className="column-list" aria-label="Colonnes non utilisées">
            {ignoredColumns.length > 0 ? (
              ignoredColumns.map((column) => <span key={column}>{column}</span>)
            ) : (
              <span>Aucune colonne ignorée</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ImportSpaceReview({
  review
}: {
  review: ImportSpaceAssignmentReview;
}) {
  if (!review.mapped) {
    return null;
  }

  return (
    <section className="import-space-review" aria-labelledby="space-review-title">
      <div>
        <p className="eyebrow">Organisation détectée</p>
        <h3 id="space-review-title">Répartition dans les espaces</h3>
      </div>

      {review.items.length > 0 ? (
        <div className="import-space-review-list">
          {review.items.map((item) => (
            <div
              className={`import-space-review-row space-review-${item.status}`}
              key={`${item.status}-${item.name}`}
            >
              <span>
                {item.status === "existing"
                  ? "Espace existant"
                  : item.status === "new"
                    ? "Nouvel espace"
                    : "Conflit espace archivé"}
              </span>
              <strong>{item.name}</strong>
              <span>
                {formatCount(item.productCount, "produit", "produits")}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-text">Aucun espace renseigné dans cet import.</p>
      )}

      {review.unassignedCount > 0 ? (
        <p className="muted-text">
          {formatCount(review.unassignedCount, "produit", "produits")}{" "}
          {review.unassignedCount === 1 ? "restera" : "resteront"} sans espace.
        </p>
      ) : null}
    </section>
  );
}

export default async function ImportDetailPage({
  params,
  searchParams
}: ImportDetailPageProps) {
  const { importId } = await params;
  const query = await searchParams;
  const activeFilter = parseRowStatusFilter(query?.rowStatus);
  const preview = await getImportPreview(importId, activeFilter);

  if (!preview) {
    notFound();
  }
  const [preflight, spaceReview, createdProducts] = await Promise.all([
    getImportCreationPreflight(importId),
    getImportSpaceAssignmentReview(importId),
    getImportedProductBatchPreview(importId)
  ]);

  if (!preflight || !spaceReview) {
    notFound();
  }

  return (
    <AppShell>
      <PageHeader
        back={
          <Link className="back-link" href="/imports">
            <UiIcon name="arrow-left" />
            Retour aux imports
          </Link>
        }
        description="Vérifiez le mapping, préparez la création et retrouvez les produits du lot."
        eyebrow="Import CSV"
        title={preview.originalFilename}
        titleId="import-title"
      />

      {query?.error ? (
        <InlineAlert variant="error">{query.error}</InlineAlert>
      ) : null}
      {query?.corrected ? (
        <InlineAlert variant="success">
          Ligne corrigée. Nouveau statut : {query.corrected}.
        </InlineAlert>
      ) : null}

      <ImportFlowSteps
        importStatus={preview.status}
        preflight={preflight}
      />

      <section className="result-panel" aria-label="Détail import">
        <div className="result-header">
          <div>
            <p className="eyebrow">Statut</p>
            <h2>{getImportStatusLabel(preview.status)}</h2>
          </div>
          <span className="status-pill">
            {preview.sourceType.toUpperCase()}
          </span>
        </div>

        <dl className="metadata-grid">
          <div>
            <dt>Lignes détectées</dt>
            <dd>{preview.rowCount}</dd>
          </div>
          <div>
            <dt>Colonnes détectées</dt>
            <dd>{preview.detectedColumns.length}</dd>
          </div>
        </dl>

        <ProgressBar
          label="Progression de l’import"
          value={getImportProgress(preview.status)}
        />

        <div className="column-list" aria-label="Colonnes détectées">
          {preview.detectedColumns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>

        <ImportValidationSummary preview={preview} />

        <ImportPreviewTable preview={preview} />
      </section>

      {preview.status !== "failed" && preview.status !== "processed" ? (
        <>
          <MappingForm preview={preview} />
          <ImportSpaceReview review={spaceReview} />
        </>
      ) : null}

      <ImportCreationPreflightPanel
        created={query?.created}
        importId={preview.id}
        preflight={preflight}
        skipped={query?.skipped}
      />

      {createdProducts ? (
        <ImportCreatedProducts batch={createdProducts} importId={preview.id} />
      ) : null}

      <ImportRowsValidationPanel
        activeFilter={activeFilter}
        preview={preview}
      />
    </AppShell>
  );
}

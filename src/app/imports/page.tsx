import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/ui/page-header";
import { ImportDropzone } from "@/components/import/import-dropzone";
import { ImportValidationSummary } from "@/components/import/import-validation-summary";
import { ProgressBar } from "@/components/ui/progress-bar";
import { UiIcon } from "@/components/ui/ui-icon";
import { formatCount } from "@/lib/format-count";
import { getImportStatusLabel } from "@/lib/import-status";
import { getImportPreview, getRecentImports } from "@/server/imports/queries";
import type { ImportPreview, ImportStatus, ImportSummary } from "@/types/import";

export const dynamic = "force-dynamic";

type ImportsPageProps = {
  searchParams?: Promise<{
    error?: string;
    importId?: string;
  }>;
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

function ImportResult({ preview }: { preview: ImportPreview }) {
  return (
    <section
      className="result-panel content-card"
      aria-labelledby="import-result-title"
    >
      <div className="content-card-inner">
      <div className="result-header">
        <div>
          <p className="eyebrow">Résultat import</p>
          <h2 id="import-result-title">{preview.originalFilename}</h2>
        </div>
        <span className="status-pill">
          {getImportStatusLabel(preview.status)}
        </span>
      </div>

      <Link className="text-link" href={`/imports/${preview.id}`}>
        Ouvrir le détail et le mapping
        <UiIcon name="arrow-right" />
      </Link>

      <dl className="metadata-grid">
        <div>
          <dt>Lignes détectées</dt>
          <dd>{preview.rowCount}</dd>
        </div>
        <div>
          <dt>Type source</dt>
          <dd>{preview.sourceType.toUpperCase()}</dd>
        </div>
      </dl>

      <ProgressBar
        label="Progression de l’import"
        value={getImportProgress(preview.status)}
      />

      <ImportValidationSummary preview={preview} />

      <div className="column-list" aria-label="Colonnes détectées">
        {preview.detectedColumns.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>

      {preview.rows.length > 0 ? (
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
      ) : (
        <p className="muted-text">Aucune ligne disponible pour l’aperçu.</p>
      )}
      </div>
    </section>
  );
}

function ImportList({ imports }: { imports: ImportSummary[] }) {
  if (imports.length === 0) {
    return (
      <EmptyState
        action={
          <Link className="primary-link compact-link" href="#import-csv">
            <UiIcon name="upload" />
            Choisir un CSV
          </Link>
        }
        description="Choisissez un fichier CSV pour préparer le mapping et créer vos premières fiches."
        label="Liste des imports"
        title="Aucun import"
      />
    );
  }

  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  return (
    <section
      className="result-panel content-card"
      aria-labelledby="imports-list-title"
    >
      <div className="content-card-inner">
      <div className="result-header">
        <div>
          <p className="eyebrow">Historique local</p>
          <h2 id="imports-list-title">Imports récents</h2>
        </div>
      </div>
      <div className="history-list import-list">
        {imports.map((importItem) => (
          <Link
            className="history-card import-list-row import-history-row"
            href={`/imports/${importItem.id}`}
            key={importItem.id}
          >
            <span className="import-history-main">
              <strong className="import-history-filename">
                {importItem.originalFilename}
              </strong>
              <time dateTime={importItem.createdAt}>
                {dateFormatter.format(new Date(importItem.createdAt))}
              </time>
            </span>
            <span className="status-pill">
              {getImportStatusLabel(importItem.status)}
            </span>
            <span className="import-history-count">
              {formatCount(importItem.rowCount, "ligne", "lignes")}
            </span>
            <span className="text-link compact-link import-history-action">
              {importItem.status === "processed" ? "Voir" : "Continuer"}
              <UiIcon name="arrow-right" />
            </span>
          </Link>
        ))}
      </div>
      </div>
    </section>
  );
}

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  const params = await searchParams;
  const preview = params?.importId
    ? await getImportPreview(params.importId)
    : null;
  const recentImports = await getRecentImports();

  return (
    <AppShell>
      <PageHeader
        description="Ajoutez un CSV, vérifiez son mapping puis créez les brouillons."
        eyebrow="Catalogue source"
        title="Imports CSV"
        titleId="imports-title"
      />

      {params?.error ? (
        <InlineAlert variant="error">{params.error}</InlineAlert>
      ) : null}

      <ImportDropzone />

      <ImportList imports={recentImports} />

      {params?.importId && !preview ? (
        <InlineAlert variant="error">
          Import introuvable pour ce workspace.
        </InlineAlert>
      ) : null}

      {preview ? <ImportResult preview={preview} /> : null}
    </AppShell>
  );
}

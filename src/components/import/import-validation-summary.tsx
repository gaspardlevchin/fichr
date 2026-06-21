import Link from "next/link";

import { formatCount } from "@/lib/format-count";
import type { ImportPreview } from "@/types/import";

export function ImportValidationSummary({
  preview
}: {
  preview: ImportPreview;
}) {
  const summary = preview.validationSummary;
  const hasWarnings = summary.warningRows > 0;
  const hasErrors = summary.invalidRows > 0 || summary.skippedRows > 0;

  return (
    <div aria-label="Résumé de la validation CSV">
      <dl className="metadata-grid">
        <div>
          <dt>Lignes totales</dt>
          <dd>{summary.totalRows}</dd>
        </div>
        <div>
          <dt>Lignes prêtes</dt>
          <dd>{summary.readyRows}</dd>
        </div>
        <div>
          <dt>À vérifier</dt>
          <dd>{summary.warningRows}</dd>
        </div>
        <div>
          <dt>Ignorées / invalides</dt>
          <dd>{summary.skippedRows + summary.invalidRows}</dd>
        </div>
      </dl>

      {!preview.errorMessage && !hasWarnings && !hasErrors ? (
        <p className="success-text">
          {summary.readyRows} lignes prêtes à être transformées en fiches.
        </p>
      ) : null}

      {hasWarnings ? (
        <div className="warning-panel">
          <p>
            {summary.warningRows} lignes demandent attention, mais l’import peut
            continuer avec les lignes valides.
          </p>
        </div>
      ) : null}

      {preview.errorMessage ? (
        preview.status === "failed" ? (
          <p className="error-text">{preview.errorMessage}</p>
        ) : (
          <div className="warning-panel">
            <p>{preview.errorMessage}</p>
          </div>
        )
      ) : null}

      {preview.issueSummary.length > 0 ? (
        <div className="import-issue-summary" aria-label="Résumé des erreurs">
          <div>
            <strong>Points principaux à vérifier</strong>
            <span>
              {formatCount(
                summary.invalidRows +
                  summary.warningRows +
                  summary.skippedRows,
                "ligne concernée",
                "lignes concernées"
              )}
            </span>
          </div>
          <ul>
            {preview.issueSummary.map((issue) => (
              <li key={issue.message}>
                <span>{issue.message}</span>
                <strong>{issue.count}</strong>
              </li>
            ))}
          </ul>
          <Link
            className="text-link compact-link"
            href={`/imports/${preview.id}?rowStatus=${
              summary.invalidRows > 0 ? "error" : "warning"
            }`}
          >
            Voir les lignes concernées
          </Link>
        </div>
      ) : null}
    </div>
  );
}

import type { CatalogExportStatus } from "../types/export.ts";

const exportStatusLabels: Record<CatalogExportStatus, string> = {
  complete: "Généré",
  deleted: "Révoqué",
  failed: "Erreur",
  pending: "En cours"
};

export function getExportStatusLabel(status: CatalogExportStatus): string {
  return exportStatusLabels[status];
}

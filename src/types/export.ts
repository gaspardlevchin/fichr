export const catalogExportTypes = ["text", "csv", "pdf"] as const;
export const catalogExportScopes = ["product", "selection", "catalog"] as const;
export const catalogExportStatuses = [
  "pending",
  "complete",
  "failed",
  "deleted"
] as const;

export type CatalogExportType = (typeof catalogExportTypes)[number];
export type CatalogExportScope = (typeof catalogExportScopes)[number];
export type CatalogExportStatus = (typeof catalogExportStatuses)[number];

export type CatalogExportSummary = {
  dataHash: string | null;
  id: string;
  exportCode: string | null;
  exportScope: CatalogExportScope;
  exportType: CatalogExportType;
  filename: string | null;
  fileHash: string | null;
  status: CatalogExportStatus;
  productCount: number;
  storagePath: string | null;
  createdAt: string;
  deletedAt: string | null;
};

export type ExportIdentity = {
  dataHash: string;
  exportCode: string;
  exportScope: CatalogExportScope;
  exportType: CatalogExportType;
  generatedAt: string;
  productCount: number;
  workspaceName: string;
};

export type ValidatedCatalogExportProduct = {
  id: string;
  title: string;
  category: string | null;
  sku: string | null;
};

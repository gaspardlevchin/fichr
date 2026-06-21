export const importStatuses = [
  "uploaded",
  "parsed",
  "mapped",
  "processed",
  "failed"
] as const;
export const importRowStatuses = [
  "pending",
  "ready",
  "imported",
  "skipped",
  "error"
] as const;
export const importSourceTypes = ["csv"] as const;
export const productFieldKeys = [
  "title",
  "subtitle",
  "category",
  "description",
  "materials",
  "dimensions",
  "origin",
  "current_price",
  "desired_price",
  "cost_price",
  "target_margin",
  "sku",
  "image_url",
  "client_notes"
] as const;
export const importMappingFieldKeys = [
  ...productFieldKeys,
  "space_name"
] as const;

export type ImportStatus = (typeof importStatuses)[number];
export type ImportRowStatus = (typeof importRowStatuses)[number];
export type ImportSourceType = (typeof importSourceTypes)[number];
export type ProductFieldKey = (typeof productFieldKeys)[number];
export type ImportMappingFieldKey = (typeof importMappingFieldKeys)[number];
export type ImportValidationFilter =
  | "all"
  | "ready"
  | "warning"
  | "error"
  | "skipped";
export type ImportValidationRowStatus = Exclude<ImportValidationFilter, "all">;
export type CsvMappingPresetMatchType = "exact" | "partial";

export type RawImportRow = Record<string, string>;
export type ColumnMapping = Partial<Record<ImportMappingFieldKey, string>>;

export type StandardProductField = {
  key: ImportMappingFieldKey;
  label: string;
  recommended: boolean;
};

export type ImportSummary = {
  id: string;
  originalFilename: string;
  status: ImportStatus;
  rowCount: number;
  createdAt: string;
};

export type ImportValidationSummary = {
  invalidRows: number;
  readyRows: number;
  skippedRows: number;
  totalRows: number;
  warningRows: number;
};

export type ImportRowIssue = {
  errorMessage: string;
  rowIndex: number;
  status: ImportValidationRowStatus;
};

export type ImportIssueSummary = {
  count: number;
  message: string;
};

export type ImportValidationRow = {
  correctedData: RawImportRow | null;
  errorMessage: string | null;
  hasCorrections: boolean;
  id: string;
  rawData: RawImportRow;
  rowIndex: number;
  status: ImportValidationRowStatus;
};

export type CsvMappingPresetSuggestion = {
  id: string;
  mappedFieldCount: number;
  mapping: ColumnMapping;
  matchType: CsvMappingPresetMatchType;
  name: string;
  usageCount: number;
};

export type ImportPreview = {
  id: string;
  originalFilename: string;
  status: ImportStatus;
  sourceType: ImportSourceType;
  rowCount: number;
  detectedColumns: string[];
  columnMapping: ColumnMapping | null;
  errorMessage: string | null;
  mappingPresetSuggestion: CsvMappingPresetSuggestion | null;
  issueSummary: ImportIssueSummary[];
  rowIssues: ImportRowIssue[];
  rows: RawImportRow[];
  validationRows: ImportValidationRow[];
  validationSummary: ImportValidationSummary;
};

export type ImportSpaceAssignmentReviewItem = {
  name: string;
  productCount: number;
  status: "existing" | "new" | "archived_conflict";
};

export type ImportSpaceAssignmentReview = {
  emptyNameCount: number;
  items: ImportSpaceAssignmentReviewItem[];
  mapped: boolean;
  unassignedCount: number;
};

export type ImportCreationPreflightStatus =
  | "mapping_required"
  | "blocked"
  | "ready"
  | "already_processed"
  | "failed";

export type ImportCreationPreflight = {
  archivedConflictSpaceCount: number;
  blockingMessage: string | null;
  canCreate: boolean;
  creatableRowCount: number;
  ignoredRowCount: number;
  mappedFieldCount: number;
  newSpaceCount: number;
  planKey: string;
  planLabel: string;
  productQuota: {
    limit: number;
    remaining: number;
    used: number;
  };
  productsToCreate: number;
  reusedSpaceCount: number;
  spaceQuota: {
    limit: number;
    remaining: number;
    used: number;
  };
  status: ImportCreationPreflightStatus;
  titleMapped: boolean;
  totalRowCount: number;
};

import type { ProductFieldKey, RawImportRow } from "@/types/import";

export const productStatuses = [
  "draft",
  "needs_info",
  "needs_review",
  "validated"
] as const;

export type ProductStatus = (typeof productStatuses)[number];
export type ProductAuditState = "current" | "missing" | "stale";

export type ProductDraftValue = string | number | null;

export type ProductDraftData = Partial<Record<ProductFieldKey, ProductDraftValue>> & {
  parsing_notes?: string[];
};

export type ProductListItem = {
  auditStatus?: ProductAuditState;
  createdAt?: string;
  deletedAt: string | null;
  id: string;
  title: string;
  subtitle: string | null;
  category: string | null;
  description: string | null;
  currentPrice: number | null;
  desiredPrice: number | null;
  imageUrl: string | null;
  status: ProductStatus;
  importId: string | null;
  sku: string | null;
  spaceId: string | null;
  spaceArchivedAt: string | null;
  spaceName: string | null;
};

export type ProductDetail = ProductListItem & {
  subtitle: string | null;
  description: string | null;
  materials: string | null;
  dimensions: string | null;
  origin: string | null;
  costPrice: number | null;
  targetMargin: number | null;
  sku: string | null;
  clientNotes: string | null;
  draftData: ProductDraftData;
  rawData: RawImportRow;
  validatedData: ProductDraftData | null;
  deletedReason: string | null;
  importOrigin?: ProductImportOrigin | null;
};

export type ProductImportOrigin = {
  createdAt: string;
  id: string;
  originalFilename: string;
  rowIndex: number | null;
};

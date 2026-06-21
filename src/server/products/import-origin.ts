import type {
  CatalogProductListItem,
  ProductImportBatchSummary
} from "./catalog-filters.ts";
import type { ProductImportOrigin } from "../../types/product.ts";

export function buildProductImportOrigin(input: {
  importCreatedAt: string | null;
  importId: string | null;
  importOriginalFilename: string | null;
  importRowIndex: number | null;
}): ProductImportOrigin | null {
  if (
    !input.importId ||
    !input.importCreatedAt ||
    !input.importOriginalFilename
  ) {
    return null;
  }

  return {
    createdAt: input.importCreatedAt,
    id: input.importId,
    originalFilename: input.importOriginalFilename,
    rowIndex: input.importRowIndex
  };
}

export function buildProductImportBatchSummary(
  products: CatalogProductListItem[]
): ProductImportBatchSummary {
  const activeProducts = products.filter((product) => !product.deletedAt);
  const spaceNames = Array.from(
    new Set(
      products.flatMap((product) =>
        product.spaceName ? [product.spaceName] : []
      )
    )
  ).sort((left, right) =>
    left.localeCompare(right, "fr", { sensitivity: "base" })
  );

  return {
    activeProductCount: activeProducts.length,
    deletedProductCount: products.length - activeProducts.length,
    draftCount: activeProducts.filter((product) => product.status === "draft")
      .length,
    incompleteCount: activeProducts.filter(
      (product) =>
        product.completenessIndicator === "blocked" ||
        product.completenessIndicator === "incomplete"
    ).length,
    missingAuditCount: activeProducts.filter(
      (product) => product.auditStatus === "missing"
    ).length,
    needsInfoCount: activeProducts.filter(
      (product) => product.status === "needs_info"
    ).length,
    needsReviewCount: activeProducts.filter(
      (product) => product.status === "needs_review"
    ).length,
    productCount: products.length,
    spaceNames,
    staleAuditCount: activeProducts.filter(
      (product) => product.auditStatus === "stale"
    ).length,
    validatedCount: activeProducts.filter(
      (product) => product.status === "validated"
    ).length
  };
}

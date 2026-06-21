import type { ProductAuditState, ProductStatus } from "../types/product.ts";

const productStatusLabels: Record<ProductStatus, string> = {
  draft: "Brouillon",
  needs_info: "Incomplet",
  needs_review: "À vérifier",
  validated: "Validé"
};

const productAuditStateLabels: Record<ProductAuditState, string> = {
  current: "Audit à jour",
  missing: "Audit manquant",
  stale: "Audit obsolète"
};

export function getProductStatusLabel(status: ProductStatus): string {
  return productStatusLabels[status];
}

export function getProductAuditStateLabel(
  status: ProductAuditState
): string {
  return productAuditStateLabels[status];
}

export function getDeletedProductStatusLabel(): string {
  return "Supprimé";
}

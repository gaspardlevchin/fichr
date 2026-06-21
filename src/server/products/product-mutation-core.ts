import type { ProductDraftData, ProductStatus } from "../../types/product";

export function applyProductImageDraftChange(input: {
  currentStatus: ProductStatus;
  draftData: ProductDraftData;
  imageUrl: string | null;
}): {
  draftData: ProductDraftData;
  status: ProductStatus;
} {
  return {
    draftData: {
      ...input.draftData,
      image_url: input.imageUrl
    },
    status:
      input.currentStatus === "validated"
        ? "needs_review"
        : input.currentStatus
  };
}

export function assertProductDeletionConfirmation(input: {
  confirmation: string;
  title: string;
}): void {
  if (!input.confirmation || input.confirmation !== input.title) {
    throw new Error("La confirmation doit correspondre exactement au titre.");
  }
}

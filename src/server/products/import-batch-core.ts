export type ImportBatchProduct = {
  createdAt: string;
  deletedAt: string | null;
  id: string;
  importId: string | null;
  rowIndex: number | null;
  title: string;
  workspaceId: string;
};

export type ProductBatchNavigation = {
  importId: string;
  nextProductId: string | null;
  position: number;
  previousProductId: string | null;
  total: number;
};

export function assertImportBatchConfirmation(input: {
  confirmation: string;
  originalFilename: string;
}): void {
  if (input.confirmation.trim() !== input.originalFilename) {
    throw new Error(
      "Saisissez exactement le nom du fichier source pour confirmer."
    );
  }
}

export function selectImportBatchProducts(
  products: ImportBatchProduct[],
  input: {
    importId: string;
    includeDeleted?: boolean;
    workspaceId: string;
  }
): ImportBatchProduct[] {
  return products.filter(
    (product) =>
      product.workspaceId === input.workspaceId &&
      product.importId === input.importId &&
      (input.includeDeleted || !product.deletedAt)
  );
}

export function buildProductBatchNavigation(
  products: ImportBatchProduct[],
  input: {
    currentProductId: string;
    importId: string;
    workspaceId: string;
  }
): ProductBatchNavigation | null {
  const orderedProducts = selectImportBatchProducts(products, {
    importId: input.importId,
    workspaceId: input.workspaceId
  }).sort((left, right) => {
    if (left.rowIndex !== null || right.rowIndex !== null) {
      if (left.rowIndex === null) {
        return 1;
      }

      if (right.rowIndex === null) {
        return -1;
      }

      if (left.rowIndex !== right.rowIndex) {
        return left.rowIndex - right.rowIndex;
      }
    }

    return (
      left.createdAt.localeCompare(right.createdAt) ||
      left.title.localeCompare(right.title, "fr", { sensitivity: "base" }) ||
      left.id.localeCompare(right.id)
    );
  });
  const currentIndex = orderedProducts.findIndex(
    (product) => product.id === input.currentProductId
  );

  if (currentIndex < 0) {
    return null;
  }

  return {
    importId: input.importId,
    nextProductId: orderedProducts[currentIndex + 1]?.id ?? null,
    position: currentIndex + 1,
    previousProductId: orderedProducts[currentIndex - 1]?.id ?? null,
    total: orderedProducts.length
  };
}

export function planImportBatchAudit(
  products: ImportBatchProduct[],
  input: {
    importId: string;
    workspaceId: string;
  }
): {
  productIds: string[];
  skippedDeletedCount: number;
} {
  const scopedProducts = selectImportBatchProducts(products, {
    importId: input.importId,
    includeDeleted: true,
    workspaceId: input.workspaceId
  });

  return {
    productIds: scopedProducts
      .filter((product) => !product.deletedAt)
      .map((product) => product.id),
    skippedDeletedCount: scopedProducts.filter((product) => product.deletedAt)
      .length
  };
}

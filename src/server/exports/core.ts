export type ExportProductField =
  | "title"
  | "subtitle"
  | "category"
  | "description"
  | "materials"
  | "dimensions"
  | "origin"
  | "current_price"
  | "desired_price"
  | "cost_price"
  | "target_margin"
  | "sku"
  | "image_url"
  | "client_notes";

export type ProductDraftValue = string | number | null;

export type ProductDraftData = Partial<
  Record<ExportProductField, ProductDraftValue>
> & {
  parsing_notes?: string[];
};

export type ExportProductRow = {
  category: string | null;
  deletedAt?: string | null;
  id: string;
  sku: string | null;
  status: string;
  title: string;
  validatedData: ProductDraftData | null;
};

export type ValidatedExportProduct = {
  id: string;
  validatedData: ProductDraftData;
};

export type ValidatedCatalogExportProduct = {
  category: string | null;
  id: string;
  sku: string | null;
  title: string;
};

export type ExportProductSelection = {
  exportProducts: ValidatedExportProduct[];
  selectedProductCount: number | null;
  skippedProductCount: number;
  validatedProducts: ValidatedCatalogExportProduct[];
};

export const exportFields: ExportProductField[] = [
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
];

const textLabels: Record<ExportProductField, string> = {
  title: "Nom",
  subtitle: "Sous-titre",
  category: "Categorie",
  description: "Description",
  materials: "Matiere",
  dimensions: "Dimensions",
  origin: "Origine",
  current_price: "Prix actuel",
  desired_price: "Prix souhaite",
  cost_price: "Prix de revient",
  target_margin: "Marge cible",
  sku: "SKU",
  image_url: "Image URL",
  client_notes: "Notes client"
};

function valueToString(value: ProductDraftValue | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeSelectedProductIds(productIds?: string[]): string[] | null {
  if (!productIds) {
    return null;
  }

  const selectedProductIds = Array.from(
    new Set(productIds.map((productId) => productId.trim()).filter(Boolean))
  );

  if (selectedProductIds.length === 0) {
    throw new Error("Selectionnez au moins un produit valide a exporter.");
  }

  return selectedProductIds;
}

export function resolveExportProductSelection(
  workspaceProducts: ExportProductRow[],
  productIds?: string[]
): ExportProductSelection {
  const selectedProductIds = normalizeSelectedProductIds(productIds);
  const validatedProducts = workspaceProducts.flatMap((product) =>
    !product.deletedAt &&
    product.status === "validated" &&
    product.validatedData
      ? [
          {
            category: product.category,
            id: product.id,
            sku: product.sku,
            title: product.title
          }
        ]
      : []
  );
  const validatedProductIds = new Set(
    validatedProducts.map((product) => product.id)
  );
  const selectedProductIdSet = selectedProductIds
    ? new Set(selectedProductIds)
    : null;

  if (selectedProductIds) {
    const invalidProductIds = selectedProductIds.filter(
      (productId) => !validatedProductIds.has(productId)
    );

    if (invalidProductIds.length > 0) {
      throw new Error(
        "La selection contient des produits introuvables ou non valides."
      );
    }
  }

  const exportProducts = workspaceProducts.flatMap((product) => {
    if (
      product.status !== "validated" ||
      product.deletedAt ||
      !product.validatedData ||
      (selectedProductIdSet && !selectedProductIdSet.has(product.id))
    ) {
      return [];
    }

    return [{ id: product.id, validatedData: product.validatedData }];
  });

  return {
    exportProducts,
    selectedProductCount: selectedProductIds ? selectedProductIds.length : null,
    skippedProductCount: selectedProductIds
      ? 0
      : workspaceProducts.length - exportProducts.length,
    validatedProducts
  };
}

export function renderTextExport(
  exportProducts: ValidatedExportProduct[],
  identity?: ExportIdentity
): string {
  const content = exportProducts
    .map((product) => {
      const lines = exportFields.flatMap((field) => {
        const value = valueToString(product.validatedData[field]);
        return value.length > 0 ? [`${textLabels[field]}: ${value}`] : [];
      });

      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  if (!identity) {
    return content;
  }

  const header = [
    "Fichr Export",
    `Code : ${identity.exportCode}`,
    `Date : ${identity.generatedAt}`,
    `Type : ${identity.exportScope}`,
    `Fiches : ${identity.productCount}`,
    `Workspace : ${identity.workspaceName}`,
    `Hash : ${identity.dataHash}`,
    ""
  ].join("\n");

  return `${header}\n${content}`;
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function renderCsvExport(exportProducts: ValidatedExportProduct[]): string {
  const rows = [
    exportFields.join(","),
    ...exportProducts.map((product) =>
      exportFields
        .map((field) => escapeCsvCell(valueToString(product.validatedData[field])))
        .join(",")
    )
  ];

  return rows.join("\n");
}

export function createExportLogMetadata(input: {
  exportId: string;
  exportType: string;
  productCount: number;
  selectedProductCount: number | null;
  skippedProductCount: number;
  status: "complete" | "failed";
}): Record<string, string | number | null> {
  return {
    export_id: input.exportId,
    export_type: input.exportType,
    product_count: input.productCount,
    selected_product_count: input.selectedProductCount,
    skipped_product_count: input.skippedProductCount,
    status: input.status
  };
}
import type { ExportIdentity } from "../../types/export";

import { asc, and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  imports,
  importRows,
  productAudits,
  products,
  spaces
} from "../../../db/schema";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import {
  applyCatalogFilters,
  createCatalogProductListItem,
  getCatalogCompletenessCounts,
  markPotentialCatalogDuplicates,
  normalizeCatalogFilters,
  paginateCatalogProducts,
  type CatalogCompletenessCounts,
  type CatalogFilters,
  type CatalogPagination,
  type CatalogProductListItem,
  type ProductImportBatchSummary,
  type CatalogSearchInput
} from "@/server/products/catalog-filters";
import {
  buildProductImportBatchSummary,
  buildProductImportOrigin
} from "@/server/products/import-origin";
import type {
  ProductDetail,
  ProductListItem,
  ProductStatus
} from "@/types/product";

const productReadRoles = ["owner", "admin", "editor", "viewer"] as const;

async function getProductReadAccess() {
  return requireWorkspaceAccess(productReadRoles);
}

export type CatalogProductsResult = {
  completenessCounts: CatalogCompletenessCounts;
  filters: CatalogFilters;
  importContext: CatalogImportContext | null;
  importFilterStatus: "active" | "none" | "unavailable";
  potentialDuplicateCount: number;
  pagination: CatalogPagination;
  products: CatalogProductListItem[];
  resultCount: number;
  selectedSpaceName: string | null;
  spaces: WorkspaceSpace[];
  statusCounts: Record<ProductStatus, number>;
  totalCount: number;
};

export type CatalogImportContext = {
  canAudit: boolean;
  canManage: boolean;
  createdAt: string;
  id: string;
  originalFilename: string;
  summary: ProductImportBatchSummary;
};

export type ImportedProductBatchPreview = {
  products: CatalogProductListItem[];
  summary: ProductImportBatchSummary;
};

export type WorkspaceSpace = {
  archivedAt?: string | null;
  description: string | null;
  id: string;
  name: string;
};

export type WorkspaceSpaceSummary = WorkspaceSpace & {
  productCount: number;
};

export async function getWorkspaceSpaces(): Promise<WorkspaceSpace[]> {
  const access = await getProductReadAccess();

  return db
    .select({
      description: spaces.description,
      id: spaces.id,
      name: spaces.name
    })
    .from(spaces)
    .where(
      and(
        eq(spaces.workspaceId, access.workspaceId),
        isNull(spaces.deletedAt)
      )
    )
    .orderBy(asc(spaces.name))
    .all();
}

export async function getWorkspaceSpaceSummaries(): Promise<WorkspaceSpaceSummary[]> {
  return getWorkspaceSpaceSummariesByStatus("active");
}

export async function getWorkspaceSpaceSummariesByStatus(
  status: "active" | "archived"
): Promise<WorkspaceSpaceSummary[]> {
  const access = await getProductReadAccess();

  return db
    .select({
      archivedAt: spaces.deletedAt,
      description: spaces.description,
      id: spaces.id,
      name: spaces.name,
      productCount: sql<number>`count(${products.id})`.mapWith(Number)
    })
    .from(spaces)
    .leftJoin(
      products,
      and(
        eq(products.spaceId, spaces.id),
        eq(products.workspaceId, access.workspaceId),
        isNull(products.deletedAt)
      )
    )
    .where(
      and(
        eq(spaces.workspaceId, access.workspaceId),
        status === "active"
          ? isNull(spaces.deletedAt)
          : sql`${spaces.deletedAt} is not null`
      )
    )
    .groupBy(spaces.id)
    .orderBy(asc(spaces.name))
    .all();
}

export async function getCatalogProducts(
  input?: CatalogSearchInput
): Promise<ProductListItem[]> {
  return (await getCatalogProductsResult(input)).products;
}

export async function getCatalogProductsResult(
  input?: CatalogSearchInput
): Promise<CatalogProductsResult> {
  const access = await getProductReadAccess();
  const workspaceSpaces = await getWorkspaceSpaces();
  const normalizedFilters = normalizeCatalogFilters(input);
  const rawImportId = Array.isArray(input?.import)
    ? input.import[0] ?? ""
    : input?.import ?? "";
  const importFilterRequested = rawImportId.trim().length > 0;
  const selectedImport = normalizedFilters.importId
    ? db
        .select({
          createdAt: imports.createdAt,
          id: imports.id,
          originalFilename: imports.originalFilename
        })
        .from(imports)
        .where(
          and(
            eq(imports.id, normalizedFilters.importId),
            eq(imports.workspaceId, access.workspaceId)
          )
        )
        .limit(1)
        .get()
    : null;
  const importFilterStatus = !importFilterRequested
    ? "none"
    : selectedImport
      ? "active"
      : "unavailable";
  const workspaceSpaceIds = new Set(workspaceSpaces.map((space) => space.id));
  const selectedSpace =
    normalizedFilters.space !== "all" &&
    normalizedFilters.space !== "unassigned"
      ? workspaceSpaces.find((space) => space.id === normalizedFilters.space)
      : null;
  const filters =
    normalizedFilters.space === "all" ||
    normalizedFilters.space === "unassigned" ||
    workspaceSpaceIds.has(normalizedFilters.space)
      ? normalizedFilters
      : { ...normalizedFilters, space: "all" };
  const workspaceProducts = db
    .select({
      category: products.category,
      clientNotes: products.clientNotes,
      costPrice: products.costPrice,
      createdAt: products.createdAt,
      currentPrice: products.currentPrice,
      deletedAt: products.deletedAt,
      description: products.description,
      desiredPrice: products.desiredPrice,
      dimensions: products.dimensions,
      draftData: products.draftData,
      id: products.id,
      imageUrl: products.imageUrl,
      importId: products.importId,
      materials: products.materials,
      origin: products.origin,
      sku: products.sku,
      spaceId: products.spaceId,
      spaceArchivedAt: spaces.deletedAt,
      spaceName: spaces.name,
      status: products.status,
      subtitle: products.subtitle,
      targetMargin: products.targetMargin,
      title: products.title,
      validatedData: products.validatedData,
      workspaceId: products.workspaceId
    })
    .from(products)
    .leftJoin(
      spaces,
      and(
        eq(products.spaceId, spaces.id),
        eq(spaces.workspaceId, access.workspaceId)
      )
    )
    .where(eq(products.workspaceId, access.workspaceId))
    .orderBy(asc(products.createdAt))
    .all();
  const auditStatusByProduct = new Map<string, "current" | "stale">();
  const workspaceAudits = db
    .select({
      productId: productAudits.productId,
      status: productAudits.status
    })
    .from(productAudits)
    .where(eq(productAudits.workspaceId, access.workspaceId))
    .orderBy(desc(productAudits.updatedAt), desc(productAudits.createdAt))
    .all();

  for (const audit of workspaceAudits) {
    const currentStatus = auditStatusByProduct.get(audit.productId);

    if (audit.status === "current" || !currentStatus) {
      auditStatusByProduct.set(audit.productId, audit.status);
    }
  }

  const catalogProducts = markPotentialCatalogDuplicates(
    workspaceProducts.map((product) =>
      createCatalogProductListItem({
        ...product,
        auditStatus: auditStatusByProduct.get(product.id) ?? "missing"
      })
    )
  );
  const importContext = selectedImport
    ? {
        ...selectedImport,
        canAudit: ["owner", "admin", "editor"].includes(access.role),
        canManage: ["owner", "admin"].includes(access.role),
        summary: buildProductImportBatchSummary(
          catalogProducts.filter(
            (product) => product.importId === selectedImport.id
          )
        )
      }
    : null;
  const scopeProducts =
    importFilterStatus === "unavailable"
      ? []
      : applyCatalogFilters(catalogProducts, {
          ...filters,
          completeness: "all",
          page: 1,
          q: "",
          sort: "oldest",
          status: "all"
        });
  const filteredProducts =
    importFilterStatus === "unavailable"
      ? []
      : applyCatalogFilters(catalogProducts, filters);
  const paginatedResult = paginateCatalogProducts(filteredProducts, filters);
  const paginatedFilters = {
    ...filters,
    page: paginatedResult.pagination.page
  };

  return {
    completenessCounts: getCatalogCompletenessCounts(scopeProducts),
    filters: paginatedFilters,
    importContext,
    importFilterStatus,
    potentialDuplicateCount: scopeProducts.filter(
      (product) => product.potentialDuplicate
    ).length,
    pagination: paginatedResult.pagination,
    products: paginatedResult.products,
    resultCount: filteredProducts.length,
    selectedSpaceName: selectedSpace?.name ?? null,
    spaces: workspaceSpaces,
    statusCounts: {
      draft: scopeProducts.filter((product) => product.status === "draft")
        .length,
      needs_info: scopeProducts.filter(
        (product) => product.status === "needs_info"
      ).length,
      needs_review: scopeProducts.filter(
        (product) => product.status === "needs_review"
      ).length,
      validated: scopeProducts.filter(
        (product) => product.status === "validated"
      ).length
    },
    totalCount: scopeProducts.length
  };
}

export async function getImportedProductBatchPreview(
  importId: string
): Promise<ImportedProductBatchPreview | null> {
  const result = await getCatalogProductsResult({ import: importId });

  if (result.importFilterStatus !== "active" || !result.importContext) {
    return null;
  }

  return {
    products: result.products.slice(0, 5),
    summary: result.importContext.summary
  };
}

export async function getProductDetail(
  productId: string
): Promise<ProductDetail | null> {
  const access = await getProductReadAccess();
  const product = db
    .select({
      importCreatedAt: imports.createdAt,
      importOriginalFilename: imports.originalFilename,
      importRowIndex: importRows.rowIndex,
      product: products,
      spaceArchivedAt: spaces.deletedAt,
      spaceName: spaces.name
    })
    .from(products)
    .leftJoin(
      spaces,
      and(
        eq(products.spaceId, spaces.id),
        eq(spaces.workspaceId, access.workspaceId)
      )
    )
    .leftJoin(
      imports,
      and(
        eq(products.importId, imports.id),
        eq(imports.workspaceId, access.workspaceId)
      )
    )
    .leftJoin(
      importRows,
      and(
        eq(products.importRowId, importRows.id),
        eq(importRows.workspaceId, access.workspaceId)
      )
    )
    .where(and(eq(products.id, productId), eq(products.workspaceId, access.workspaceId)))
    .limit(1)
    .get();

  if (!product) {
    return null;
  }

  return {
    id: product.product.id,
    createdAt: product.product.createdAt,
    deletedAt: product.product.deletedAt,
    deletedReason: product.product.deletedReason,
    title: product.product.title,
    subtitle: product.product.subtitle,
    category: product.product.category,
    description: product.product.description,
    materials: product.product.materials,
    dimensions: product.product.dimensions,
    origin: product.product.origin,
    currentPrice: product.product.currentPrice,
    desiredPrice: product.product.desiredPrice,
    costPrice: product.product.costPrice,
    targetMargin: product.product.targetMargin,
    sku: product.product.sku,
    imageUrl: product.product.imageUrl,
    clientNotes: product.product.clientNotes,
    status: product.product.status,
    importId: product.product.importId,
    importOrigin: buildProductImportOrigin({
      importCreatedAt: product.importCreatedAt,
      importId: product.product.importId,
      importOriginalFilename: product.importOriginalFilename,
      importRowIndex: product.importRowIndex
    }),
    spaceId: product.product.spaceId,
    spaceArchivedAt: product.spaceArchivedAt,
    spaceName: product.spaceName,
    draftData: product.product.draftData,
    rawData: product.product.rawData,
    validatedData: product.product.validatedData
  };
}

import {
  analyzeProductCompleteness,
  getProductCompletenessIndicator,
  type ProductCompletenessIndicator,
  type ProductCompletenessResult
} from "../../lib/product-completeness.ts";
import type {
  ProductDraftData,
  ProductDraftValue,
  ProductAuditState,
  ProductListItem,
  ProductStatus
} from "../../types/product";

export type CatalogStatusFilter = ProductStatus | "all";
export type CatalogDeletedFilter = "active" | "deleted";
export type CatalogCompletenessFilter =
  | "all"
  | "blocked"
  | "incomplete"
  | "ready"
  | "complete";
export type CatalogAuditFilter = ProductAuditState | "all";
export type CatalogSort =
  | "newest"
  | "oldest"
  | "title_asc"
  | "title_desc"
  | "status"
  | "completeness_asc"
  | "completeness_desc";

export type CatalogSearchInput = {
  audit?: string | string[];
  completeness?: string | string[];
  deleted?: string | string[];
  import?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  q?: string | string[];
  sort?: string | string[];
  space?: string | string[];
  status?: string | string[];
};

export type CatalogFilters = {
  audit: CatalogAuditFilter;
  completeness: CatalogCompletenessFilter;
  deleted: CatalogDeletedFilter;
  importId: string;
  page: number;
  pageSize: CatalogPageSize;
  q: string;
  sort: CatalogSort;
  space: string;
  status: CatalogStatusFilter;
};

export type CatalogPageSize = 25 | 50 | 100;

export type CatalogPagination = {
  end: number;
  page: number;
  pageCount: number;
  pageSize: CatalogPageSize;
  start: number;
  total: number;
};

export type WorkspaceCatalogProduct = ProductListItem & {
  clientNotes?: string | null;
  costPrice?: number | null;
  dimensions?: string | null;
  draftData?: ProductDraftData;
  materials?: string | null;
  origin?: string | null;
  targetMargin?: number | null;
  validatedData?: ProductDraftData | null;
  workspaceId: string;
};

export type CatalogProductListItem = ProductListItem & {
  auditStatus: ProductAuditState;
  clientNotes: string | null;
  completeness: ProductCompletenessResult;
  completenessIndicator: ProductCompletenessIndicator;
  costPrice: number | null;
  dimensions: string | null;
  draftData: ProductDraftData;
  materials: string | null;
  origin: string | null;
  potentialDuplicate: boolean;
  targetMargin: number | null;
  validatedData: ProductDraftData | null;
};

export type CatalogCompletenessCounts = Record<
  CatalogCompletenessFilter,
  number
>;

export type ProductImportBatchSummary = {
  activeProductCount: number;
  deletedProductCount: number;
  draftCount: number;
  incompleteCount: number;
  missingAuditCount: number;
  needsInfoCount: number;
  needsReviewCount: number;
  productCount: number;
  spaceNames: string[];
  staleAuditCount: number;
  validatedCount: number;
};

const statusFilters = new Set<CatalogStatusFilter>([
  "all",
  "draft",
  "needs_info",
  "needs_review",
  "validated"
]);
const auditFilters = new Set<CatalogAuditFilter>([
  "all",
  "current",
  "missing",
  "stale"
]);
const completenessFilters = new Set<CatalogCompletenessFilter>([
  "all",
  "blocked",
  "incomplete",
  "ready",
  "complete"
]);
const sortOptions = new Set<CatalogSort>([
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
  "status",
  "completeness_asc",
  "completeness_desc"
]);
const pageSizeOptions = new Set<CatalogPageSize>([25, 50, 100]);
const statusSortOrder: ProductStatus[] = [
  "needs_info",
  "needs_review",
  "draft",
  "validated"
];

function getDraftValue(value: ProductDraftValue | undefined): ProductDraftValue {
  return value === undefined ? null : value;
}

function createDraftDataFromFlatProduct(
  product: WorkspaceCatalogProduct
): ProductDraftData {
  return {
    title: getDraftValue(product.title),
    subtitle: getDraftValue(product.subtitle),
    category: getDraftValue(product.category),
    description: getDraftValue(product.description),
    materials: getDraftValue(product.materials ?? null),
    dimensions: getDraftValue(product.dimensions ?? null),
    origin: getDraftValue(product.origin ?? null),
    current_price: getDraftValue(product.currentPrice),
    desired_price: getDraftValue(product.desiredPrice),
    cost_price: getDraftValue(product.costPrice ?? null),
    target_margin: getDraftValue(product.targetMargin ?? null),
    sku: getDraftValue(product.sku),
    image_url: getDraftValue(product.imageUrl),
    client_notes: getDraftValue(product.clientNotes ?? null)
  };
}

export function createCatalogProductListItem(
  product: WorkspaceCatalogProduct
): CatalogProductListItem {
  const draftData = product.draftData ?? createDraftDataFromFlatProduct(product);
  const catalogProduct = {
    auditStatus: product.auditStatus ?? "missing",
    category: product.category,
    clientNotes: product.clientNotes ?? null,
    costPrice: product.costPrice ?? null,
    createdAt: product.createdAt,
    deletedAt: product.deletedAt ?? null,
    currentPrice: product.currentPrice,
    description: product.description,
    desiredPrice: product.desiredPrice,
    dimensions: product.dimensions ?? null,
    draftData,
    id: product.id,
    imageUrl: product.imageUrl,
    importId: product.importId,
    materials: product.materials ?? null,
    origin: product.origin ?? null,
    potentialDuplicate: false,
    sku: product.sku,
    spaceId: product.spaceId ?? null,
    spaceArchivedAt: product.spaceArchivedAt ?? null,
    spaceName: product.spaceName ?? null,
    status: product.status,
    subtitle: product.subtitle,
    targetMargin: product.targetMargin ?? null,
    title: product.title,
    validatedData: product.validatedData ?? null
  };
  const completeness = analyzeProductCompleteness(catalogProduct);

  return {
    ...catalogProduct,
    completeness,
    completenessIndicator: getProductCompletenessIndicator(completeness)
  };
}

function getPotentialDuplicateKey(
  product: CatalogProductListItem
): string | null {
  if (product.deletedAt) {
    return null;
  }

  const sku = product.sku?.trim().toLocaleLowerCase("fr");

  if (sku) {
    return `sku:${sku}`;
  }

  const title = product.title.trim().toLocaleLowerCase("fr");

  return title
    ? `title-space:${title}|${product.spaceId ?? "unassigned"}`
    : null;
}

export function markPotentialCatalogDuplicates(
  products: CatalogProductListItem[]
): CatalogProductListItem[] {
  const counts = new Map<string, number>();

  for (const product of products) {
    const key = getPotentialDuplicateKey(product);

    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return products.map((product) => {
    const key = getPotentialDuplicateKey(product);

    return {
      ...product,
      potentialDuplicate: Boolean(key && (counts.get(key) ?? 0) > 1)
    };
  });
}

function isComplete(product: CatalogProductListItem): boolean {
  return (
    product.completeness.blockers.length === 0 &&
    product.completeness.missingRecommendedFields.length === 0 &&
    product.completeness.warnings.length === 0
  );
}

function matchesCompleteness(
  product: CatalogProductListItem,
  filter: CatalogCompletenessFilter
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "blocked") {
    return product.completeness.blockers.length > 0;
  }

  if (filter === "incomplete") {
    return (
      product.completeness.blockers.length === 0 &&
      product.completeness.missingRecommendedFields.length > 0
    );
  }

  if (filter === "ready") {
    return (
      product.completeness.blockers.length === 0 &&
      product.completeness.missingRecommendedFields.length === 0
    );
  }

  return isComplete(product);
}

function compareCompleteness(
  left: CatalogProductListItem,
  right: CatalogProductListItem
): number {
  return (
    left.completeness.completenessScore -
      right.completeness.completenessScore ||
    compareText(left.title, right.title)
  );
}

function getFirstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeSpace(value: string): string {
  const normalized = value.trim().slice(0, 128);

  if (normalized === "unassigned") {
    return normalized;
  }

  return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : "all";
}

function normalizeImportId(value: string): string {
  const normalized = value.trim().slice(0, 128);

  return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : "";
}

function normalizePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePageSize(value: string): CatalogPageSize {
  const parsed = normalizePositiveInteger(value, 25);

  return pageSizeOptions.has(parsed as CatalogPageSize)
    ? (parsed as CatalogPageSize)
    : 25;
}

function normalizeSearchValue(value: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesSearch(product: ProductListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalizeSearchValue(query);
  const values = [
    product.title,
    product.subtitle,
    product.sku,
    product.category,
    product.description
  ];

  return values.some((value) =>
    normalizeSearchValue(value).includes(normalizedQuery)
  );
}

function compareText(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "", "fr", {
    sensitivity: "base"
  });
}

function compareCreatedAt(left: ProductListItem, right: ProductListItem): number {
  return (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
}

export function normalizeCatalogFilters(
  input: CatalogSearchInput | undefined
): CatalogFilters {
  const audit = getFirstParam(input?.audit);
  const completeness = getFirstParam(input?.completeness);
  const deleted = getFirstParam(input?.deleted);
  const importId = normalizeImportId(getFirstParam(input?.import));
  const page = normalizePositiveInteger(getFirstParam(input?.page), 1);
  const pageSize = normalizePageSize(getFirstParam(input?.pageSize));
  const status = getFirstParam(input?.status);
  const sort = getFirstParam(input?.sort);
  const space = getFirstParam(input?.space);

  return {
    audit: auditFilters.has(audit as CatalogAuditFilter)
      ? (audit as CatalogAuditFilter)
      : "all",
    completeness: completenessFilters.has(completeness as CatalogCompletenessFilter)
      ? (completeness as CatalogCompletenessFilter)
      : "all",
    deleted: deleted === "deleted" ? "deleted" : "active",
    importId,
    page,
    pageSize,
    q: normalizeQuery(getFirstParam(input?.q)),
    sort: sortOptions.has(sort as CatalogSort) ? (sort as CatalogSort) : "oldest",
    space: normalizeSpace(space),
    status: statusFilters.has(status as CatalogStatusFilter)
      ? (status as CatalogStatusFilter)
      : "all"
  };
}

export function getCatalogHref(
  filters: CatalogFilters,
  next: Partial<CatalogFilters> = {}
): string {
  const params = new URLSearchParams();
  const audit = next.audit ?? filters.audit;
  const page = next.page ?? filters.page;
  const pageSize = next.pageSize ?? filters.pageSize;
  const q = next.q ?? filters.q;
  const status = next.status ?? filters.status;
  const sort = next.sort ?? filters.sort;
  const completeness = next.completeness ?? filters.completeness;
  const deleted = next.deleted ?? filters.deleted;
  const importId = next.importId ?? filters.importId;
  const space = next.space ?? filters.space;

  if (q) {
    params.set("q", q);
  }

  if (audit !== "all") {
    params.set("audit", audit);
  }

  if (completeness !== "all") {
    params.set("completeness", completeness);
  }

  if (status !== "all") {
    params.set("status", status);
  }

  if (deleted === "deleted") {
    params.set("deleted", "deleted");
  }

  if (importId) {
    params.set("import", importId);
  }

  if (space !== "all") {
    params.set("space", space);
  }

  if (sort !== "oldest") {
    params.set("sort", sort);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  if (pageSize !== 25) {
    params.set("pageSize", String(pageSize));
  }

  const query = params.toString();

  return query ? `/catalog?${query}` : "/catalog";
}

export function applyCatalogFilters(
  products: CatalogProductListItem[],
  filters: CatalogFilters
): CatalogProductListItem[] {
  const filteredProducts = products.filter((product) => {
    const isDeleted = Boolean(product.deletedAt);

    if (
      (filters.deleted === "active" && isDeleted) ||
      (filters.deleted === "deleted" && !isDeleted)
    ) {
      return false;
    }

    if (
      (filters.space === "unassigned" && product.spaceId) ||
      (filters.space !== "all" &&
        filters.space !== "unassigned" &&
        product.spaceId !== filters.space)
    ) {
      return false;
    }

    if (filters.importId && product.importId !== filters.importId) {
      return false;
    }

    if (filters.audit !== "all" && product.auditStatus !== filters.audit) {
      return false;
    }

    if (filters.status !== "all" && product.status !== filters.status) {
      return false;
    }

    return (
      matchesCompleteness(product, filters.completeness) &&
      matchesSearch(product, filters.q)
    );
  });

  return [...filteredProducts].sort((left, right) => {
    if (filters.sort === "completeness_asc") {
      return compareCompleteness(left, right);
    }

    if (filters.sort === "completeness_desc") {
      return compareCompleteness(right, left);
    }

    if (filters.sort === "newest") {
      return compareCreatedAt(right, left) || compareText(left.title, right.title);
    }

    if (filters.sort === "title_asc") {
      return compareText(left.title, right.title);
    }

    if (filters.sort === "title_desc") {
      return compareText(right.title, left.title);
    }

    if (filters.sort === "status") {
      return (
        statusSortOrder.indexOf(left.status) -
          statusSortOrder.indexOf(right.status) ||
        compareText(left.title, right.title)
      );
    }

    return compareCreatedAt(left, right) || compareText(left.title, right.title);
  });
}

export function paginateCatalogProducts(
  products: CatalogProductListItem[],
  filters: CatalogFilters
): {
  pagination: CatalogPagination;
  products: CatalogProductListItem[];
} {
  const total = products.length;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pageCount);
  const startOffset = (page - 1) * filters.pageSize;
  const pagedProducts = products.slice(startOffset, startOffset + filters.pageSize);

  return {
    pagination: {
      end: total === 0 ? 0 : startOffset + pagedProducts.length,
      page,
      pageCount,
      pageSize: filters.pageSize,
      start: total === 0 ? 0 : startOffset + 1,
      total
    },
    products: pagedProducts
  };
}

export function getWorkspaceCatalogProducts(
  products: WorkspaceCatalogProduct[],
  workspaceId: string
): CatalogProductListItem[] {
  return products
    .filter((product) => product.workspaceId === workspaceId)
    .map(createCatalogProductListItem);
}

export function getCatalogCompletenessCounts(
  products: CatalogProductListItem[]
): CatalogCompletenessCounts {
  return {
    all: products.length,
    blocked: products.filter((product) =>
      matchesCompleteness(product, "blocked")
    ).length,
    incomplete: products.filter((product) =>
      matchesCompleteness(product, "incomplete")
    ).length,
    ready: products.filter((product) => matchesCompleteness(product, "ready"))
      .length,
    complete: products.filter((product) =>
      matchesCompleteness(product, "complete")
    ).length
  };
}

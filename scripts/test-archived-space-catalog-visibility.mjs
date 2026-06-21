import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  applyCatalogFilters,
  normalizeCatalogFilters
} from "../src/server/products/catalog-filters.ts";

const queriesSource = await readFile("src/server/products/queries.ts", "utf8");
const catalogSource = await readFile("src/app/catalog/page.tsx", "utf8");
const spacesSource = await readFile("src/app/spaces/page.tsx", "utf8");

const filters = normalizeCatalogFilters(undefined);
const products = [
  {
    auditStatus: "missing",
    category: null,
    clientNotes: null,
    completeness: {
      blockers: [],
      completenessScore: 100,
      missingRecommendedFields: [],
      missingRequiredFields: [],
      quickActions: [],
      status: "ready_to_validate",
      statusLabel: "Prête",
      warnings: []
    },
    completenessIndicator: "complete",
    costPrice: null,
    createdAt: "2026-01-01",
    currentPrice: null,
    deletedAt: null,
    description: null,
    desiredPrice: null,
    dimensions: null,
    draftData: {},
    id: "prd_archived_space",
    imageUrl: null,
    importId: null,
    materials: null,
    origin: null,
    potentialDuplicate: false,
    sku: null,
    spaceArchivedAt: "2026-01-02",
    spaceId: "spc_archived",
    spaceName: "Archive",
    status: "draft",
    subtitle: null,
    targetMargin: null,
    title: "Produit conservé",
    validatedData: null
  }
];

assert.equal(applyCatalogFilters(products, filters).length, 1);
assert.match(
  queriesSource,
  /new Set\(workspaceSpaces\.map\(\(space\) => space\.id\)\)/
);
assert.match(queriesSource, /isNull\(spaces\.deletedAt\)/);
assert.equal(catalogSource.includes("selectedSpaceArchived"), false);
assert.equal(catalogSource.includes("Espace archivé —"), false);
assert.equal(spacesSource.includes("Espaces archivés"), true);
assert.match(queriesSource, /eq\(products\.workspaceId, access\.workspaceId\)/);

console.log("Archived space catalog visibility coverage passed.");

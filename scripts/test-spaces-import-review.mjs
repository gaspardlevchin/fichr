import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildImportSpaceAssignmentReview } from "../src/server/imports/space-review-core.ts";

async function main() {
  process.env.AI_ENABLED = "false";
  globalThis.fetch = () => {
    throw new Error("OpenAI must not be called by space import review.");
  };

  const rows = [
    { espace: " Showroom " },
    { espace: "Showroom" },
    { espace: "Nouvelle gamme" },
    { espace: "  " },
    { espace: "Archive historique" }
  ];
  const review = buildImportSpaceAssignmentReview({
    mapping: { space_name: "espace" },
    rows,
    spaces: [
      { archivedAt: null, name: "Showroom" },
      {
        archivedAt: "2026-06-18 12:00:00",
        name: "Archive historique"
      }
    ]
  });

  assert.equal(review.mapped, true);
  assert.equal(review.emptyNameCount, 1);
  assert.equal(review.unassignedCount, 2);
  assert.deepEqual(
    review.items.map((item) => ({
      name: item.name,
      productCount: item.productCount,
      status: item.status
    })),
    [
      {
        name: "Archive historique",
        productCount: 1,
        status: "archived_conflict"
      },
      {
        name: "Nouvelle gamme",
        productCount: 1,
        status: "new"
      },
      {
        name: "Showroom",
        productCount: 2,
        status: "existing"
      }
    ]
  );

  const unmappedReview = buildImportSpaceAssignmentReview({
    mapping: {},
    rows,
    spaces: []
  });
  assert.equal(unmappedReview.mapped, false);
  assert.equal(unmappedReview.items.length, 0);
  assert.equal(unmappedReview.unassignedCount, rows.length);

  const importSource = await readFile(
    "src/server/products/import-products.ts",
    "utf8"
  );
  const creationCoreSource = await readFile(
    "src/server/imports/creation-core.ts",
    "utf8"
  );
  const pageSource = await readFile(
    "src/app/imports/[importId]/page.tsx",
    "utf8"
  );

  assert.equal(creationCoreSource.includes('field === "space_name"'), true);
  assert.equal(importSource.includes("existingSpace.archivedAt"), true);
  assert.equal(importSource.includes("validatedData"), false);
  assert.equal(creationCoreSource.includes("validatedData"), false);
  assert.equal(pageSource.includes("Organisation détectée"), true);
  assert.equal(pageSource.includes("Conflit espace archivé"), true);

  console.log("Spaces import review coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  createExportLogMetadata,
  renderCsvExport,
  renderTextExport,
  resolveExportProductSelection
} from "../src/server/exports/core.ts";
import { renderPdfExport } from "../src/server/exports/pdf.ts";

const workspaceId = "wks_exports_selection";
const otherWorkspaceId = "wks_exports_selection_other";
const draftSentinel = "DRAFT_SENTINEL_DO_NOT_EXPORT";
const outsideSentinel = "OUTSIDE_WORKSPACE_SENTINEL_DO_NOT_EXPORT";

function insertProduct(db, input) {
  db.prepare(
    `insert into products (
      id,
      workspace_id,
      status,
      title,
      category,
      sku,
      validated_data
    ) values (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.workspaceId,
    input.status,
    input.title,
    input.category ?? null,
    input.sku ?? null,
    input.validatedData ? JSON.stringify(input.validatedData) : null
  );
}

function getWorkspaceProducts(db, targetWorkspaceId) {
  return db
    .prepare(
      `select
        id,
        category,
        sku,
        status,
        title,
        validated_data as validatedData
      from products
      where workspace_id = ?
      order by id`
    )
    .all(targetWorkspaceId)
    .map((product) => ({
      ...product,
      validatedData: product.validatedData
        ? JSON.parse(product.validatedData)
        : null
    }));
}

function expectRejected(callback, message) {
  assert.throws(callback, /Selectionnez|introuvables|non valides/, message);
}

function assertDoesNotLeak(value) {
  assert.equal(value.includes(draftSentinel), false);
  assert.equal(value.includes(outsideSentinel), false);
}

function toPdfHex(value) {
  return Buffer.from(value, "latin1").toString("hex").toUpperCase();
}

function assertPdfIncludesText(pdf, value) {
  assert.equal(
    pdf.includes(toPdfHex(value)),
    true,
    `PDF should include ${value}`
  );
}

function assertPdfExcludesText(pdf, value) {
  assert.equal(
    pdf.includes(toPdfHex(value)),
    false,
    `PDF should exclude ${value}`
  );
}

function assertPdfIsStructured(pdfBuffer) {
  const pdf = pdfBuffer.toString("latin1");

  assert.equal(pdf.startsWith("%PDF-1.4"), true);
  assertPdfIncludesText(pdf, "Fiche produit");
  assertPdfIncludesText(pdf, "Description");
  assertPdfIncludesText(pdf, "Informations produit");
  assertPdfIncludesText(pdf, "Généré avec Fichr");
  assert.equal(pdf.includes("/Users/"), false);
  assert.equal(pdf.includes("storage/"), false);
  assert.equal(pdf.includes("raw_data"), false);
  assert.equal(pdf.includes(toPdfHex("raw_data")), false);
  assertPdfExcludesText(pdf, draftSentinel);
  assertPdfExcludesText(pdf, outsideSentinel);

  return pdf;
}

function assertPdfContainsOnlySelectedProduct(pdfBuffer) {
  const pdf = assertPdfIsStructured(pdfBuffer);

  assertPdfIncludesText(pdf, "Selected Alpha");
  assertPdfExcludesText(pdf, "Selected Beta");
}

function assertPdfContainsAllValidatedProducts(pdfBuffer) {
  const pdf = assertPdfIsStructured(pdfBuffer);

  assertPdfIncludesText(pdf, "Selected Alpha");
  assertPdfIncludesText(pdf, "Selected Beta");
}

async function main() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-export-test-"));
  const databasePath = path.join(tempDir, "exports-selection.sqlite");
  const db = new Database(databasePath);

  try {
    db.exec(`
      create table products (
        id text primary key,
        workspace_id text not null,
        status text not null,
        title text not null,
        category text,
        sku text,
        validated_data text
      );
    `);

    insertProduct(db, {
      id: "prd_selected_alpha",
      workspaceId,
      status: "validated",
      title: "Selected Alpha",
      category: "Luminaire",
      sku: "ALPHA-SEL",
      validatedData: {
        title: "Selected Alpha",
        subtitle: "Alpha subtitle",
        category: "Luminaire",
        description: "Alpha validated export product",
        materials: "Acier",
        dimensions: "12 x 18 cm",
        origin: "France",
        desired_price: "120 EUR",
        cost_price: "40 EUR",
        target_margin: "30%",
        sku: "ALPHA-SEL"
      }
    });
    insertProduct(db, {
      id: "prd_selected_beta",
      workspaceId,
      status: "validated",
      title: "Selected Beta",
      category: "Mobilier",
      sku: "BETA-SEL",
      validatedData: {
        title: "Selected Beta",
        subtitle: "Beta subtitle",
        category: "Mobilier",
        description: "Beta validated export product",
        materials: "Bois",
        image_url: "https://example.test/beta.jpg",
        desired_price: "240 EUR",
        cost_price: "80 EUR",
        sku: "BETA-SEL"
      }
    });
    insertProduct(db, {
      id: "prd_non_validated",
      workspaceId,
      status: "draft",
      title: "Draft Sentinel",
      category: "Brouillon",
      sku: "DRAFT-SEL",
      validatedData: {
        title: draftSentinel,
        description: draftSentinel
      }
    });
    insertProduct(db, {
      id: "prd_other_workspace",
      workspaceId: otherWorkspaceId,
      status: "validated",
      title: "Outside Workspace",
      category: "Hidden",
      sku: "OUTSIDE-SEL",
      validatedData: {
        title: outsideSentinel,
        description: outsideSentinel
      }
    });

    const workspaceProducts = getWorkspaceProducts(db, workspaceId);
    const allSelection = resolveExportProductSelection(workspaceProducts);

    assert.equal(allSelection.exportProducts.length, 2);
    assert.equal(allSelection.selectedProductCount, null);
    assert.equal(allSelection.skippedProductCount, 1);

    const allText = renderTextExport(allSelection.exportProducts);
    assert.equal(allText.includes("Selected Alpha"), true);
    assert.equal(allText.includes("Selected Beta"), true);
    assertDoesNotLeak(allText);
    assertPdfContainsAllValidatedProducts(
      renderPdfExport(allSelection.exportProducts)
    );

    const selectedAlpha = resolveExportProductSelection(workspaceProducts, [
      "prd_selected_alpha"
    ]);
    assert.equal(selectedAlpha.exportProducts.length, 1);
    assert.equal(selectedAlpha.selectedProductCount, 1);
    assert.equal(selectedAlpha.skippedProductCount, 0);

    const selectedText = renderTextExport(selectedAlpha.exportProducts);
    assert.equal(selectedText.includes("Selected Alpha"), true);
    assert.equal(selectedText.includes("Selected Beta"), false);
    assertDoesNotLeak(selectedText);

    const selectedBeta = resolveExportProductSelection(workspaceProducts, [
      "prd_selected_beta"
    ]);
    const selectedCsv = renderCsvExport(selectedBeta.exportProducts);
    assert.equal(selectedCsv.includes("Selected Beta"), true);
    assert.equal(selectedCsv.includes("Selected Alpha"), false);
    assertDoesNotLeak(selectedCsv);

    assertPdfContainsOnlySelectedProduct(
      renderPdfExport(selectedAlpha.exportProducts)
    );

    expectRejected(
      () => resolveExportProductSelection(workspaceProducts, []),
      "empty selection must be rejected"
    );
    expectRejected(
      () => resolveExportProductSelection(workspaceProducts, ["prd_missing"]),
      "missing product id must be rejected"
    );
    expectRejected(
      () => resolveExportProductSelection(workspaceProducts, ["prd_non_validated"]),
      "non-validated product id must be rejected"
    );
    expectRejected(
      () =>
        resolveExportProductSelection(workspaceProducts, [
          "prd_other_workspace"
        ]),
      "out-of-workspace product id must be rejected"
    );

    const logMetadata = createExportLogMetadata({
      exportId: "exp_test_selection",
      exportType: "csv",
      productCount: selectedBeta.exportProducts.length,
      selectedProductCount: selectedBeta.selectedProductCount,
      skippedProductCount: selectedBeta.skippedProductCount,
      status: "complete"
    });
    const serializedMetadata = JSON.stringify(logMetadata);
    assert.equal(logMetadata.selected_product_count, 1);
    assert.equal(logMetadata.skipped_product_count, 0);
    assertDoesNotLeak(serializedMetadata);
    assert.equal(serializedMetadata.includes("Selected Alpha"), false);
    assert.equal(serializedMetadata.includes("Selected Beta"), false);

    console.log("Export selection coverage passed.");
  } finally {
    db.close();
    await rm(tempDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

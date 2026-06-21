import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  renderCsvExport,
  renderTextExport,
  resolveExportProductSelection
} from "../src/server/exports/core.ts";
import {
  createExportCode,
  createExportDataHash,
  createExportFilename,
  createExportIdentity,
  createSha256Hash,
  getExportScope,
  getShortExportHash
} from "../src/server/exports/identity.ts";
import { renderPdfExport } from "../src/server/exports/pdf.ts";
import {
  readExportFile,
  saveExportFile
} from "../src/server/exports/storage.ts";

function pdfHex(value) {
  return Buffer.from(value, "latin1").toString("hex").toUpperCase();
}

function assertPdfContains(pdf, value) {
  assert.equal(
    pdf.toString("latin1").includes(pdfHex(value)),
    true,
    `PDF should contain ${value}`
  );
}

async function main() {
  process.env.AI_ENABLED = "false";
  globalThis.fetch = () => {
    throw new Error("OpenAI must not be called by export identity tests.");
  };

  const exportProducts = [
    {
      id: "prd_alpha",
      validatedData: {
        description: "Description validée",
        sku: "ALPHA-001",
        title: "Produit Alpha"
      }
    },
    {
      id: "prd_beta",
      validatedData: {
        title: "Produit Beta",
        category: "Mobilier"
      }
    }
  ];
  const sameProductsDifferentKeyOrder = [
    {
      id: "prd_beta",
      validatedData: {
        category: "Mobilier",
        title: "Produit Beta"
      }
    },
    {
      id: "prd_alpha",
      validatedData: {
        title: "Produit Alpha",
        sku: "ALPHA-001",
        description: "Description validée"
      }
    }
  ];
  const changedProducts = structuredClone(exportProducts);
  changedProducts[0].validatedData.title = "Produit Alpha modifié";

  const dataHash = createExportDataHash(exportProducts);
  assert.equal(dataHash.length, 64);
  assert.equal(
    createExportDataHash(sameProductsDifferentKeyOrder),
    dataHash,
    "data hash must use a stable representation"
  );
  assert.notEqual(createExportDataHash(changedProducts), dataHash);

  const generatedAt = new Date("2026-06-19T12:00:00.000Z");
  const firstCode = createExportCode(
    generatedAt,
    Buffer.from("001122334455", "hex")
  );
  const secondCode = createExportCode(
    generatedAt,
    Buffer.from("AABBCCDDEEFF", "hex")
  );
  assert.equal(firstCode, "FICHR-EXP-2026-001122334455");
  assert.notEqual(firstCode, secondCode);
  assert.equal(
    new Set(Array.from({ length: 200 }, () => createExportCode())).size,
    200
  );
  assert.equal(getExportScope(undefined), "catalog");
  assert.equal(getExportScope(["prd_alpha"]), "product");
  assert.equal(getExportScope(["prd_alpha", "prd_beta"]), "selection");

  const filename = createExportFilename(firstCode, "pdf");
  assert.equal(filename, `fichr-export-${firstCode}.pdf`);
  assert.throws(
    () => createExportFilename("../unsafe", "pdf"),
    /Invalid export code/
  );

  const identity = createExportIdentity({
    dataHash,
    exportCode: firstCode,
    exportScope: "selection",
    exportType: "pdf",
    generatedAt: generatedAt.toISOString(),
    productCount: exportProducts.length,
    workspaceName: "Atelier Test"
  });
  const text = renderTextExport(exportProducts, identity);
  assert.match(text, /Fichr Export/);
  assert.equal(text.includes(firstCode), true);
  assert.equal(text.includes(dataHash), true);
  assert.equal(text.includes("Produit Alpha"), true);

  const csv = renderCsvExport(exportProducts);
  assert.equal(csv.split("\n")[0].startsWith("title,subtitle,category"), true);
  assert.equal(csv.includes(firstCode), false);
  assert.equal(csv.includes("#"), false);

  const pdf = renderPdfExport(exportProducts, identity);
  assert.equal(pdf.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assertPdfContains(pdf, "Fichr");
  assertPdfContains(pdf, firstCode);
  assertPdfContains(pdf, getShortExportHash(dataHash));
  assertPdfContains(pdf, "Document généré par Fichr");
  assertPdfContains(pdf, "Atelier Test");
  assertPdfContains(pdf, "Produit Alpha");

  const fileHash = createSha256Hash(pdf);
  assert.equal(fileHash.length, 64);
  assert.equal(createSha256Hash(pdf), fileHash);

  const selection = resolveExportProductSelection([
    {
      category: null,
      deletedAt: null,
      id: "prd_validated",
      sku: null,
      status: "validated",
      title: "Titre de travail",
      validatedData: { title: "Titre validé" }
    },
    {
      category: null,
      deletedAt: null,
      id: "prd_draft",
      sku: null,
      status: "draft",
      title: "Brouillon",
      validatedData: { title: "NEVER_EXPORT_DRAFT" }
    },
    {
      category: null,
      deletedAt: "2026-06-19T10:00:00.000Z",
      id: "prd_deleted",
      sku: null,
      status: "validated",
      title: "Supprimé",
      validatedData: { title: "NEVER_EXPORT_DELETED" }
    }
  ]);
  assert.deepEqual(
    selection.exportProducts.map((product) => product.id),
    ["prd_validated"]
  );

  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-export-identity-"));
  const previousStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  process.env.LOCAL_STORAGE_ROOT = tempDir;

  try {
    const storedExport = await saveExportFile({
      content: pdf,
      filename,
      workspaceId: "wks_identity"
    });
    const storedFile = await readExportFile(
      storedExport.storageKey,
      "wks_identity"
    );
    assert.equal(createSha256Hash(storedFile), fileHash);

    const db = new Database(":memory:");
    db.exec(`
      create table exports (
        id text primary key,
        workspace_id text not null,
        export_code text unique,
        data_hash text,
        file_hash text,
        filename text
      );
    `);
    db.prepare(
      `insert into exports
       (id, workspace_id, export_code, data_hash, file_hash, filename)
       values (?, ?, ?, ?, ?, ?)`
    ).run("exp_identity", "wks_identity", firstCode, dataHash, fileHash, filename);
    const storedIdentity = db
      .prepare("select * from exports where export_code = ?")
      .get(firstCode);
    assert.equal(storedIdentity.data_hash, dataHash);
    assert.equal(storedIdentity.file_hash, fileHash);
    assert.equal(storedIdentity.filename, filename);
    assert.throws(
      () =>
        db.prepare(
          `insert into exports
           (id, workspace_id, export_code) values (?, ?, ?)`
        ).run("exp_duplicate", "wks_other", firstCode),
      /UNIQUE/
    );
    db.close();
  } finally {
    if (previousStorageRoot === undefined) {
      delete process.env.LOCAL_STORAGE_ROOT;
    } else {
      process.env.LOCAL_STORAGE_ROOT = previousStorageRoot;
    }
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log("Export identity coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

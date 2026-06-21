import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  validateCsvImport,
  validateCsvRowData
} from "../src/server/imports/validation.ts";
import {
  countCorrectedImportRowFields,
  createImportRowCorrectionLogMetadata,
  getEditableImportRowData,
  getEffectiveImportRowData
} from "../src/server/imports/row-corrections-core.ts";

const workspaceId = "wks_csv_row_correction";
const importId = "imp_csv_row_correction";
const rowContentSentinel = "SECRET_FULL_ROW_CONTENT_DO_NOT_LOG";
const mapping = {
  title: "title",
  description: "description",
  current_price: "current_price",
  image_url: "image_url",
  materials: "materials",
  dimensions: "dimensions",
  origin: "origin"
};

function createSchema(db) {
  db.exec(`
    create table imports (
      id text primary key,
      workspace_id text not null,
      detected_columns text not null
    );

    create table import_rows (
      id text primary key,
      workspace_id text not null,
      import_id text not null,
      row_index integer not null,
      raw_data text not null,
      corrected_data text,
      status text not null,
      error_message text
    );

    create table products (
      id text primary key,
      workspace_id text not null,
      import_id text not null,
      import_row_id text not null unique,
      status text not null,
      title text not null,
      raw_data text not null
    );

    create table csv_mapping_presets (
      id text primary key,
      workspace_id text not null,
      mapping text not null,
      usage_count integer not null default 1
    );

    create table event_logs (
      id integer primary key autoincrement,
      workspace_id text not null,
      metadata text not null
    );
  `);
}

function insertImportFixture(db, validation) {
  db.prepare(
    `insert into imports (id, workspace_id, detected_columns) values (?, ?, ?)`
  ).run(importId, workspaceId, JSON.stringify(validation.columns));

  const insertRow = db.prepare(
    `insert into import_rows (
      id,
      workspace_id,
      import_id,
      row_index,
      raw_data,
      corrected_data,
      status,
      error_message
    ) values (?, ?, ?, ?, ?, null, ?, ?)`
  );

  for (const row of validation.rows) {
    insertRow.run(
      `row_${row.rowIndex}`,
      workspaceId,
      importId,
      row.rowIndex,
      JSON.stringify(row.rawData),
      row.status,
      row.errorMessage
    );
  }

  db.prepare(
    `insert into csv_mapping_presets (id, workspace_id, mapping)
     values (?, ?, ?)`
  ).run("preset_row_correction", workspaceId, JSON.stringify(mapping));
}

function getImportColumns(db) {
  const record = db
    .prepare(`select detected_columns as detectedColumns from imports where id = ?`)
    .get(importId);

  return JSON.parse(record.detectedColumns);
}

function getImportRow(db, rowId) {
  const row = db
    .prepare(
      `select
        id,
        row_index as rowIndex,
        raw_data as rawData,
        corrected_data as correctedData,
        status,
        error_message as errorMessage
       from import_rows
       where id = ? and workspace_id = ?`
    )
    .get(rowId, workspaceId);

  return {
    ...row,
    correctedData: row.correctedData ? JSON.parse(row.correctedData) : null,
    rawData: JSON.parse(row.rawData)
  };
}

function correctRow(db, rowId, values) {
  const row = getImportRow(db, rowId);
  const columns = getImportColumns(db);
  const editableData = getEditableImportRowData({
    columns,
    correctedData: row.correctedData,
    rawData: row.rawData
  });

  for (const [column, value] of Object.entries(values)) {
    assert.equal(columns.includes(column), true);
    editableData[column] = value;
  }

  const validation = validateCsvRowData({
    columns,
    rawData: editableData,
    rowIndex: row.rowIndex
  });
  const correctedFieldCount = countCorrectedImportRowFields({
    columns,
    correctedData: validation.rawData,
    rawData: row.rawData
  });
  const previousStatus =
    row.status === "ready" && row.errorMessage ? "warning" : row.status;
  const newStatus =
    validation.status === "ready" && validation.errorMessage
      ? "warning"
      : validation.status;
  const metadata = createImportRowCorrectionLogMetadata({
    correctedFieldCount,
    importId,
    newStatus,
    previousStatus,
    rowId
  });

  db.prepare(
    `update import_rows
     set corrected_data = ?,
         status = ?,
         error_message = ?
     where id = ? and workspace_id = ?`
  ).run(
    JSON.stringify(validation.rawData),
    validation.status,
    validation.errorMessage,
    rowId,
    workspaceId
  );
  db.prepare(`insert into event_logs (workspace_id, metadata) values (?, ?)`).run(
    workspaceId,
    JSON.stringify(metadata)
  );

  return validation;
}

function createDraftProducts(db) {
  const rows = db
    .prepare(
      `select
        id,
        row_index as rowIndex,
        raw_data as rawData,
        corrected_data as correctedData
       from import_rows
       where import_id = ?
         and workspace_id = ?
         and status in ('ready', 'pending')
       order by row_index`
    )
    .all(importId, workspaceId)
    .map((row) => ({
      ...row,
      correctedData: row.correctedData ? JSON.parse(row.correctedData) : null,
      rawData: JSON.parse(row.rawData)
    }));
  const blockedRows = db
    .prepare(
      `select id from import_rows
       where import_id = ?
         and workspace_id = ?
         and status in ('error', 'skipped')`
    )
    .all(importId, workspaceId);
  let createdProductCount = 0;
  let skippedRowCount = blockedRows.length;

  for (const row of rows) {
    const existingProduct = db
      .prepare(
        `select id from products where workspace_id = ? and import_row_id = ?`
      )
      .get(workspaceId, row.id);

    if (existingProduct) {
      skippedRowCount += 1;
      continue;
    }

    const effectiveRowData = getEffectiveImportRowData(row);
    const title =
      effectiveRowData[mapping.title] || `Produit sans titre - ligne ${row.rowIndex}`;

    db.prepare(
      `insert into products (
        id,
        workspace_id,
        import_id,
        import_row_id,
        status,
        title,
        raw_data
      ) values (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `prd_${row.id}`,
      workspaceId,
      importId,
      row.id,
      "draft",
      title,
      JSON.stringify(effectiveRowData)
    );

    db.prepare(`update import_rows set status = 'imported' where id = ?`).run(
      row.id
    );
    createdProductCount += 1;
  }

  return { createdProductCount, skippedRowCount };
}

function assertDoesNotLeakRowContent(value) {
  assert.equal(value.includes(rowContentSentinel), false);
  assert.equal(value.includes("Corrected Title"), false);
  assert.equal(value.includes("Bad Price"), false);
  assert.equal(value.includes("Bad Image"), false);
}

async function main() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-row-correction-"));
  const db = new Database(path.join(tempDir, "csv-row-correction.sqlite"));

  try {
    createSchema(db);

    const validation = validateCsvImport(
      [
        "title,description,current_price,image_url,materials,dimensions,origin",
        `,${rowContentSentinel},120,https://example.com/missing.jpg,laiton,20 cm,France`,
        "Bad Price,Description,abc,https://example.com/price.jpg,bois,30 cm,Italie",
        "Bad Image,Description,50,not-url,acier,40 cm,Portugal",
        `Broken,${rowContentSentinel},bad-price,https://example.com/broken.jpg,lin,50 cm,Espagne`,
        ",,,,,,"
      ].join("\n")
    );

    assert.equal(validation.summary.invalidRows, 4);
    assert.equal(validation.summary.skippedRows, 1);
    insertImportFixture(db, validation);

    assert.equal(correctRow(db, "row_1", { title: "Corrected Title" }).status, "ready");
    assert.equal(correctRow(db, "row_2", { current_price: "99,50" }).status, "ready");
    assert.equal(
      correctRow(db, "row_3", {
        image_url: "https://example.com/corrected.jpg"
      }).status,
      "ready"
    );

    const correctedMissingTitle = getImportRow(db, "row_1");
    assert.equal(correctedMissingTitle.rawData.title, "");
    assert.equal(correctedMissingTitle.correctedData.title, "Corrected Title");
    assert.equal(correctedMissingTitle.status, "ready");

    const firstCreation = createDraftProducts(db);
    assert.equal(firstCreation.createdProductCount, 3);
    assert.equal(firstCreation.skippedRowCount, 2);

    const correctedProduct = db
      .prepare(`select title, raw_data as rawData from products where import_row_id = ?`)
      .get("row_1");
    assert.equal(correctedProduct.title, "Corrected Title");
    assert.equal(JSON.parse(correctedProduct.rawData).title, "Corrected Title");

    const uncorrectedErrorProduct = db
      .prepare(`select id from products where import_row_id = ?`)
      .get("row_4");
    assert.equal(uncorrectedErrorProduct, undefined);
    const skippedProduct = db
      .prepare(`select id from products where import_row_id = ?`)
      .get("row_5");
    assert.equal(skippedProduct, undefined);

    const secondCreation = createDraftProducts(db);
    assert.equal(secondCreation.createdProductCount, 0);
    assert.equal(
      db.prepare(`select count(*) as count from products`).get().count,
      3
    );

    const preset = db
      .prepare(
        `select mapping, usage_count as usageCount
         from csv_mapping_presets
         where id = ?`
      )
      .get("preset_row_correction");
    assert.deepEqual(JSON.parse(preset.mapping), mapping);
    assert.equal(preset.usageCount, 1);
    assertDoesNotLeakRowContent(JSON.stringify(preset));

    const serializedLogs = JSON.stringify(
      db.prepare(`select metadata from event_logs`).all()
    );
    assert.equal(serializedLogs.includes("corrected_fields_count"), true);
    assertDoesNotLeakRowContent(serializedLogs);

    console.log("CSV row correction coverage passed.");
  } finally {
    db.close();
    await rm(tempDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

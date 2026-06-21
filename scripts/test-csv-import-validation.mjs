import assert from "node:assert/strict";

import {
  validateCsvImport
} from "../src/server/imports/validation.ts";

function assertStatus(result, rowIndex, status) {
  assert.equal(result.rows[rowIndex - 1]?.status, status);
}

function assertImportableRows(result, expectedCount) {
  const importableRows = result.rows.filter((row) =>
    ["ready", "pending"].includes(row.status)
  );

  assert.equal(importableRows.length, expectedCount);
}

const valid = validateCsvImport(
  "title,category,desired_price,image_url\nLampe,Luminaire,120,https://example.com/lampe.jpg"
);
assert.deepEqual(valid.blockingErrors, []);
assert.equal(valid.columns.join(","), "title,category,desired_price,image_url");
assert.equal(valid.summary.readyRows, 1);
assertImportableRows(valid, 1);

const empty = validateCsvImport("");
assert.equal(empty.blockingErrors[0]?.code, "empty_file");

const missingHeader = validateCsvImport("12,50\n13,60");
assert.equal(missingHeader.blockingErrors[0]?.code, "missing_header");

const duplicateColumns = validateCsvImport(
  "title,title,desired_price\nLampe,Alias,120"
);
assert.equal(duplicateColumns.columns.join(","), "title,title_2,desired_price");
assert.equal(
  duplicateColumns.columnIssues.some((issue) => issue.code === "duplicate_column"),
  true
);

const emptyLine = validateCsvImport("title,desired_price\n\nLampe,120");
assertStatus(emptyLine, 1, "skipped");
assertStatus(emptyLine, 2, "ready");
assert.equal(emptyLine.summary.skippedRows, 1);

const commaPrice = validateCsvImport("title;desired_price\nLampe;12,50");
assert.equal(commaPrice.delimiter, ";");
assertStatus(commaPrice, 1, "ready");

const invalidPrice = validateCsvImport("title,desired_price\nLampe,abc");
assertStatus(invalidPrice, 1, "error");
assert.equal(
  invalidPrice.rows[0]?.errorMessage?.includes("prix"),
  true
);
assertImportableRows(invalidPrice, 0);

const tooFewValues = validateCsvImport("title,category,desired_price\nLampe,120");
assertStatus(tooFewValues, 1, "error");
assert.equal(
  tooFewValues.rows[0]?.errorMessage?.includes("moins de valeurs"),
  true
);

const tooManyValues = validateCsvImport("title,desired_price\nLampe,120,extra");
assertStatus(tooManyValues, 1, "error");
assert.equal(
  tooManyValues.rows[0]?.errorMessage?.includes("plus de valeurs"),
  true
);

const invalidImageUrl = validateCsvImport("title,image_url\nLampe,not-url");
assertStatus(invalidImageUrl, 1, "error");
assert.equal(
  invalidImageUrl.rows[0]?.errorMessage?.includes("URL image"),
  true
);

const missingTitle = validateCsvImport("title,desired_price\n,120");
assertStatus(missingTitle, 1, "error");
assert.equal(
  missingTitle.rows[0]?.errorMessage?.includes("titre"),
  true
);

const duplicateRows = validateCsvImport(
  "title,desired_price\nLampe,120\nLampe,120"
);
assertStatus(duplicateRows, 1, "ready");
assertStatus(duplicateRows, 2, "skipped");
assert.equal(duplicateRows.summary.skippedRows, 1);
assertImportableRows(duplicateRows, 1);

const mixedRows = validateCsvImport(
  "title,desired_price,image_url\nReady,120,https://example.com/ready.jpg\n Warning\u200B,130,https://example.com/warning.jpg\nBroken,abc,https://example.com/broken.jpg\n\nReady,120,https://example.com/ready.jpg"
);
assert.equal(mixedRows.summary.readyRows, 1);
assert.equal(mixedRows.summary.warningRows, 1);
assert.equal(mixedRows.summary.invalidRows, 1);
assert.equal(mixedRows.summary.skippedRows, 2);
assertImportableRows(mixedRows, 2);

const trimmedValues = validateCsvImport(
  " title ,desired_price\n Lampe invisible\u200B ,120"
);
assert.equal(trimmedValues.columns[0], "title");
assert.equal(trimmedValues.rows[0]?.rawData.title, "Lampe invisible");
assert.equal(trimmedValues.summary.warningRows, 1);

console.log("CSV import validation coverage passed.");

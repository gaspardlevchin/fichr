import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const importsPage = await readFile("src/app/imports/page.tsx", "utf8");
const exportsPage = await readFile("src/app/exports/page.tsx", "utf8");
const styles = await readFile("src/styles/globals.css", "utf8");

assert.equal(importsPage.includes("history-card import-list-row"), true);
assert.equal(exportsPage.includes("history-card export-list-row"), true);
assert.equal(importsPage.includes("<time dateTime={importItem.createdAt}>"), true);
assert.equal(exportsPage.includes("export-history-meta"), true);
assert.equal(styles.includes(".history-card"), true);
assert.equal(styles.includes("min-height: 58px"), true);
assert.equal(styles.includes("padding: 11px 14px"), true);

console.log("Imports and exports card compactness coverage passed.");

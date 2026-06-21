import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  createColumnSignature,
  findBestPresetMatch
} from "../src/server/imports/mapping-presets-core.ts";

const workspaceId = "wks_mapping_presets";
const otherWorkspaceId = "wks_mapping_presets_other";
const columns = ["nom produit", "description", "prix", "photo", "matiere"];
const mapping = {
  title: "nom produit",
  description: "description",
  current_price: "prix",
  image_url: "photo",
  materials: "matiere"
};
const rowContentSentinel = "SECRET_PRODUCT_ROW_CONTENT";

function createSchema(db) {
  db.exec(`
    create table csv_mapping_presets (
      id text primary key not null,
      workspace_id text not null,
      name text not null,
      column_signature text not null,
      columns text not null,
      mapping text not null,
      usage_count integer not null default 1,
      last_used_at text not null default CURRENT_TIMESTAMP,
      created_at text not null default CURRENT_TIMESTAMP,
      updated_at text not null default CURRENT_TIMESTAMP,
      unique(workspace_id, column_signature)
    );
  `);
}

function savePreset(db, input) {
  const columnSignature = createColumnSignature(input.columns);
  const existingPreset = db
    .prepare(
      `select id, usage_count from csv_mapping_presets
       where workspace_id = ? and column_signature = ?`
    )
    .get(input.workspaceId, columnSignature);

  if (existingPreset) {
    db.prepare(
      `update csv_mapping_presets
       set columns = ?,
           mapping = ?,
           usage_count = usage_count + 1,
           last_used_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       where id = ? and workspace_id = ?`
    ).run(
      JSON.stringify(input.columns),
      JSON.stringify(input.mapping),
      existingPreset.id,
      input.workspaceId
    );
    return existingPreset.id;
  }

  const id = input.id ?? `map_${input.workspaceId}`;
  db.prepare(
    `insert into csv_mapping_presets (
      id,
      workspace_id,
      name,
      column_signature,
      columns,
      mapping
    ) values (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.workspaceId,
    `Mapping CSV - ${input.columns.length} colonnes`,
    columnSignature,
    JSON.stringify(input.columns),
    JSON.stringify(input.mapping)
  );
  return id;
}

function getWorkspacePresets(db, targetWorkspaceId) {
  return db
    .prepare(
      `select
        id,
        name,
        column_signature as columnSignature,
        columns,
        mapping,
        usage_count as usageCount
      from csv_mapping_presets
      where workspace_id = ?
      order by last_used_at desc, usage_count desc`
    )
    .all(targetWorkspaceId)
    .map((preset) => ({
      ...preset,
      columns: JSON.parse(preset.columns),
      mapping: JSON.parse(preset.mapping)
    }));
}

async function main() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-mapping-presets-"));
  const db = new Database(path.join(tempDir, "mapping-presets.sqlite"));

  try {
    createSchema(db);

    assert.equal(findBestPresetMatch([], columns), null);

    const presetId = savePreset(db, {
      columns,
      id: "map_workspace_catalog",
      mapping,
      workspaceId
    });
    assert.equal(presetId, "map_workspace_catalog");

    const exactMatch = findBestPresetMatch(
      getWorkspacePresets(db, workspaceId),
      columns
    );
    assert.equal(exactMatch?.matchType, "exact");
    assert.deepEqual(exactMatch?.mapping, mapping);

    const otherWorkspaceMatch = findBestPresetMatch(
      getWorkspacePresets(db, otherWorkspaceId),
      columns
    );
    assert.equal(otherWorkspaceMatch, null);

    const partialMatch = findBestPresetMatch(
      getWorkspacePresets(db, workspaceId),
      [...columns, "origine"]
    );
    assert.equal(partialMatch?.matchType, "partial");
    assert.equal(partialMatch?.mappedFieldCount, Object.keys(mapping).length);

    const incompatibleMatch = findBestPresetMatch(
      getWorkspacePresets(db, workspaceId),
      ["sku", "collection"]
    );
    assert.equal(incompatibleMatch, null);

    savePreset(db, {
      columns,
      mapping: { ...mapping, origin: "origine absente" },
      workspaceId
    });
    const updatedPreset = db
      .prepare(
        `select columns, mapping, usage_count as usageCount
         from csv_mapping_presets
         where id = ?`
      )
      .get(presetId);
    assert.equal(updatedPreset.usageCount, 2);

    const serializedPresetStorage = JSON.stringify(
      getWorkspacePresets(db, workspaceId)
    );
    assert.equal(serializedPresetStorage.includes(rowContentSentinel), false);
    assert.equal(serializedPresetStorage.includes("SECRET"), false);

    const mappedRawRow = {
      "nom produit": "Lampe test",
      description: rowContentSentinel,
      prix: "120",
      photo: "https://example.com/image.jpg",
      matiere: "laiton"
    };
    assert.equal(mappedRawRow[exactMatch.mapping.title], "Lampe test");
    assert.equal(mappedRawRow[exactMatch.mapping.current_price], "120");

    console.log("CSV mapping presets coverage passed.");
  } finally {
    db.close();
    await rm(tempDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

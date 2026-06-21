import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }

  return result.stdout;
}

async function main() {
  const gitignore = await readFile(".gitignore", "utf8");
  const archiveSource = await readFile("scripts/archive-clean.mjs", "utf8");
  const scripts = await Promise.all(
    [
      "scripts/archive-clean.mjs",
      "scripts/reset-dev-db.mjs",
      "scripts/ai-diagnose.mjs"
    ].map((file) => readFile(file, "utf8"))
  );

  assert.match(gitignore, /^node_modules\/$/m);
  assert.match(gitignore, /^\.next\/$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(gitignore, /^\*\.sqlite$/m);
  assert.match(gitignore, /^\*\.db$/m);
  assert.match(gitignore, /^storage\/\*$/m);
  assert.match(gitignore, /^artifacts\/$/m);

  assert.equal(archiveSource.includes("readFile"), false);
  assert.equal(archiveSource.includes("OPENAI_API_KEY"), false);
  assert.equal(scripts.some((source) => /cat\s+.*\.env\.local/.test(source)), false);
  assert.equal(scripts.some((source) => /readFile\([^)]*\.env\.local/.test(source)), false);

  run("node", ["scripts/archive-clean.mjs"]);
  const archiveEntries = run("unzip", [
    "-Z1",
    "artifacts/fichr-clean.zip"
  ])
    .trim()
    .split("\n")
    .filter(Boolean);

  assert.equal(archiveEntries.includes(".env.example"), true);
  assert.equal(archiveEntries.some((entry) => entry === ".env.local"), false);
  assert.equal(archiveEntries.some((entry) => entry.startsWith(".next/")), false);
  assert.equal(
    archiveEntries.some((entry) => entry.startsWith("node_modules/")),
    false
  );
  assert.equal(archiveEntries.some((entry) => entry.startsWith("storage/")), false);
  assert.equal(
    archiveEntries.some((entry) => /\.(?:sqlite|db)(?:-shm|-wal)?$/.test(entry)),
    false
  );

  await rm("artifacts/fichr-clean.zip", { force: true });
  console.log("Project hygiene coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

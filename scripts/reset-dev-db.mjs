import { spawnSync } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const defaultDatabaseUrl = "file:./db/fichr.sqlite";

const sqliteFiles = [
  "db/fichr.sqlite",
  "db/fichr.sqlite-wal",
  "db/fichr.sqlite-shm"
];

const storageDirs = [
  "storage/imports",
  "storage/exports",
  "storage/images"
];

async function removeLocalFile(relativePath) {
  const targetPath = path.join(projectRoot, relativePath);
  await rm(targetPath, { force: true });
  console.log(`removed ${relativePath}`);
}

async function cleanStorageDir(relativePath) {
  const targetDir = path.join(projectRoot, relativePath);
  await mkdir(targetDir, { recursive: true });

  const entries = await readdir(targetDir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.name !== ".gitkeep")
      .map((entry) =>
        rm(path.join(targetDir, entry.name), {
          force: true,
          recursive: true
        })
      )
  );

  await writeFile(path.join(targetDir, ".gitkeep"), "");
  console.log(`cleaned ${relativePath}`);
}

async function resetDevDatabase() {
  console.log("Resetting local development SQLite database.");
  console.log("This removes db/fichr.sqlite and local storage test files.");

  await Promise.all(sqliteFiles.map(removeLocalFile));
  await Promise.all(storageDirs.map(cleanStorageDir));

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const migrate = spawnSync(npmCommand, ["run", "db:migrate"], {
    env: {
      ...process.env,
      DATABASE_URL: defaultDatabaseUrl
    },
    stdio: "inherit"
  });

  if (migrate.status !== 0) {
    process.exit(migrate.status ?? 1);
  }
}

resetDevDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});

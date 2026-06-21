import { spawnSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const artifactsDir = path.join(projectRoot, "artifacts");
const outputPath = path.join(artifactsDir, "fichr-clean.zip");
const excludedDirectories = new Set([
  ".git",
  ".next",
  "__MACOSX",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "storage"
]);

function isExcludedFile(relativePath) {
  const basename = path.basename(relativePath);

  if (basename === ".DS_Store" || basename === "tsconfig.tsbuildinfo") {
    return true;
  }

  if (basename.startsWith(".env") && basename !== ".env.example") {
    return true;
  }

  return /\.(sqlite|sqlite-shm|sqlite-wal|db|db-shm|db-wal)$/.test(basename);
}

async function collectShareableFiles(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name)) {
        continue;
      }

      files.push(
        ...(await collectShareableFiles(
          path.join(directory, entry.name),
          relativePath
        ))
      );
      continue;
    }

    if (entry.isFile() && !isExcludedFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

async function createCleanArchive() {
  const files = await collectShareableFiles(projectRoot);

  if (files.length === 0) {
    throw new Error("Aucun fichier partageable trouvé.");
  }

  await mkdir(artifactsDir, { recursive: true });
  await rm(outputPath, { force: true });

  const archive = spawnSync("zip", ["-q", outputPath, ...files], {
    cwd: projectRoot,
    encoding: "utf8"
  });

  if (archive.status !== 0) {
    throw new Error(
      archive.stderr?.trim() || "La commande zip n’est pas disponible."
    );
  }

  console.log("Archive propre créée : artifacts/fichr-clean.zip");
}

createCleanArchive().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

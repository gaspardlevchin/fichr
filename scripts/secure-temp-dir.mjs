import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const controlledPrefix = "fichr-restore-preflight-";
const allowedTemporaryRoot = path.resolve(tmpdir());

export function ensureTempInsideAllowedRoot(targetPath) {
  const resolvedTarget = path.resolve(targetPath);

  if (!resolvedTarget.startsWith(`${allowedTemporaryRoot}${path.sep}`)) {
    throw new Error("Chemin temporaire hors de la racine contrôlée.");
  }

  return resolvedTarget;
}

export async function createSecureTempDir() {
  const directory = await mkdtemp(
    path.join(allowedTemporaryRoot, controlledPrefix)
  );
  await chmod(directory, 0o700);

  return ensureTempInsideAllowedRoot(directory);
}

export async function cleanupTempDir(directory) {
  const controlledDirectory = ensureTempInsideAllowedRoot(directory);

  if (!path.basename(controlledDirectory).startsWith(controlledPrefix)) {
    throw new Error("Refus de nettoyer un dossier temporaire non contrôlé.");
  }

  await rm(controlledDirectory, {
    force: true,
    recursive: true
  });
}

export const restorePreflightTempPrefix = controlledPrefix;

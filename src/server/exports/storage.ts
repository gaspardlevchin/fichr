import {
  createWorkspaceStorageKey,
  normalizeStoredStorageKey
} from "../storage/path-safety.ts";
import { getStorageProvider } from "../storage/providers/index.ts";
import { getLocalStorageRoot } from "../storage/providers/local.ts";
import type { StorageFileMetadata } from "../storage/providers/types.ts";

export async function saveExportFile(input: {
  content: string | Uint8Array;
  filename: string;
  workspaceId: string;
}): Promise<StorageFileMetadata> {
  if (!/^fichr-export-FICHR-EXP-\d{4}-[A-F0-9]{12}\.(txt|csv|pdf)$/.test(input.filename)) {
    throw new Error("Invalid export filename.");
  }

  const storageKey = createWorkspaceStorageKey({
    namespace: "exports",
    relativeKey: input.filename,
    workspaceId: input.workspaceId
  });
  const extension = input.filename.split(".").at(-1);
  const mimeType =
    extension === "pdf"
      ? "application/pdf"
      : extension === "csv"
        ? "text/csv"
        : "text/plain";

  return getStorageProvider().writeFile({
    content: input.content,
    mimeType,
    storageKey,
    workspaceId: input.workspaceId
  });
}

export function getExportStorageKey(
  storageReference: string,
  workspaceId: string
): string {
  return normalizeStoredStorageKey({
    reference: storageReference,
    storageRoot: getLocalStorageRoot(),
    workspaceId
  });
}

export async function readExportFile(
  storageReference: string,
  workspaceId: string
): Promise<Buffer> {
  return getStorageProvider().readFile({
    storageKey: getExportStorageKey(storageReference, workspaceId),
    workspaceId
  });
}

export async function deleteExportFile(
  storageReference: string,
  workspaceId: string
): Promise<boolean> {
  return getStorageProvider().deleteFile({
    storageKey: getExportStorageKey(storageReference, workspaceId),
    workspaceId
  });
}

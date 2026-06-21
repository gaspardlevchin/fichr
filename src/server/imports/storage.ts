import {
  createWorkspaceStorageKey,
  sanitizeFilename
} from "../storage/path-safety.ts";
import { getStorageProvider } from "../storage/providers/index.ts";
import type { StorageFileMetadata } from "../storage/providers/types.ts";

type SaveOriginalCsvInput = {
  workspaceId: string;
  importId: string;
  filename: string;
  content: Buffer;
};

export async function saveOriginalCsvFile(
  input: SaveOriginalCsvInput
): Promise<StorageFileMetadata> {
  const filename = `${input.importId}-${sanitizeFilename(input.filename)}`;
  const storageKey = createWorkspaceStorageKey({
    namespace: "imports",
    relativeKey: filename,
    workspaceId: input.workspaceId
  });

  return getStorageProvider().writeFile({
    content: input.content,
    mimeType: "text/csv",
    storageKey,
    workspaceId: input.workspaceId
  });
}

export async function deleteOriginalCsvFile(input: {
  storageKey: string;
  workspaceId: string;
}): Promise<boolean> {
  return getStorageProvider().deleteFile(input);
}

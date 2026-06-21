import { getMappedSpaceName } from "./space-mapping.ts";
import type {
  ColumnMapping,
  ImportSpaceAssignmentReview,
  ImportSpaceAssignmentReviewItem,
  RawImportRow
} from "../../types/import.ts";

export type ReviewWorkspaceSpace = {
  archivedAt: string | null;
  name: string;
};

export function buildImportSpaceAssignmentReview(input: {
  mapping: ColumnMapping | null;
  rows: RawImportRow[];
  spaces: ReviewWorkspaceSpace[];
}): ImportSpaceAssignmentReview {
  if (!input.mapping?.space_name) {
    return {
      emptyNameCount: 0,
      items: [],
      mapped: false,
      unassignedCount: input.rows.length
    };
  }

  const activeNames = new Set(
    input.spaces
      .filter((space) => !space.archivedAt)
      .map((space) => space.name)
  );
  const archivedNames = new Set(
    input.spaces
      .filter((space) => space.archivedAt)
      .map((space) => space.name)
  );
  const groupedItems = new Map<string, ImportSpaceAssignmentReviewItem>();
  let emptyNameCount = 0;

  for (const row of input.rows) {
    const name = getMappedSpaceName(row, input.mapping);

    if (!name) {
      emptyNameCount += 1;
      continue;
    }

    const status = activeNames.has(name)
      ? "existing"
      : archivedNames.has(name)
        ? "archived_conflict"
        : "new";
    const key = `${status}:${name}`;
    const existingItem = groupedItems.get(key);

    if (existingItem) {
      existingItem.productCount += 1;
    } else {
      groupedItems.set(key, {
        name,
        productCount: 1,
        status
      });
    }
  }

  const items = [...groupedItems.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "fr", { sensitivity: "base" })
  );
  const archivedConflictCount = items
    .filter((item) => item.status === "archived_conflict")
    .reduce((total, item) => total + item.productCount, 0);

  return {
    emptyNameCount,
    items,
    mapped: true,
    unassignedCount: emptyNameCount + archivedConflictCount
  };
}

import { eventLogs } from "../../../db/schema";
import { db } from "@/server/db/client";
import { createServerId } from "@/server/ids";
import type {
  SafeEventMetadata,
  SafeEventMetadataValue
} from "@/types/event-log";

const blockedMetadataKeys = [
  "catalog",
  "content",
  "description",
  "dimensions",
  "material",
  "materials",
  "product",
  "raw",
  "title"
];

const allowedMetadataKeys = new Set([
  "audit_id",
  "audit_marked_stale_count",
  "audit_status",
  "blocking_count",
  "changed_field_count",
  "created_product_count",
  "deleted_file",
  "export_id",
  "export_type",
  "finding_count",
  "import_id",
  "invalid_rows",
  "mapped_field_count",
  "new_status",
  "previous_status",
  "product_count",
  "product_id",
  "corrected_fields_count",
  "row_count",
  "row_id",
  "score",
  "selected_product_count",
  "skipped_row_count",
  "skipped_product_count",
  "source_type",
  "status",
  "total_rows",
  "valid_rows",
  "validation_status",
  "warning_rows"
]);

type LogEventInput = {
  workspaceId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

function normalizeMetadataValue(value: unknown): SafeEventMetadataValue | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 160 ? "[redacted:long-string]" : value;
  }

  return "[redacted:unsupported-value]";
}

export function sanitizeEventMetadata(
  metadata: Record<string, unknown> = {}
): SafeEventMetadata {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      const isAllowed = allowedMetadataKeys.has(normalizedKey);
      const isBlocked = blockedMetadataKeys.some((blockedKey) =>
        normalizedKey.includes(blockedKey)
      );

      return [
        key,
        isBlocked && !isAllowed
          ? "[redacted:sensitive-key]"
          : normalizeMetadataValue(value)
      ];
    })
  );
}

export function logEvent(input: LogEventInput): void {
  db.insert(eventLogs)
    .values({
      id: createServerId("evt"),
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: sanitizeEventMetadata(input.metadata)
    })
    .run();
}

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

import type {
  AiSuggestionData,
  AiSuggestionStatus,
  AiSuggestionType,
  AiUsageLogMetadata,
  AiUsageStatus
} from "../src/types/ai";
import type {
  AuditFieldKey,
  AuditFindingSeverity,
  AuditFindingType,
  ProductAuditStatus
} from "../src/types/audit";
import type { SafeEventMetadata } from "../src/types/event-log";
import type {
  BillingEventStatus,
  BillingInterval,
  BillingInvoiceStatus,
  BillingMetadata,
  BillingProviderKey,
  BillingSubscriptionStatus
} from "../src/types/billing";
import type {
  EntitlementSource,
  EntitlementStatus,
  PlanKey,
  WorkspaceEntitlementMetadata
} from "../src/types/entitlement";
import type {
  ColumnMapping,
  ImportRowStatus,
  ImportStatus,
  ImportSourceType,
  RawImportRow
} from "../src/types/import";
import type {
  CatalogExportScope,
  CatalogExportStatus,
  CatalogExportType
} from "../src/types/export";
import type { ProductDraftData, ProductStatus } from "../src/types/product";
import type {
  DataOwnershipMode,
  StorageObjectMetadata,
  StorageObjectType,
  StorageProviderKind
} from "../src/types/storage";
import type { WorkspaceRole } from "../src/types/workspace";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    provider: text("provider"),
    providerAccountId: text("provider_account_id"),
    passwordHash: text("password_hash"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_provider_account_unique").on(
      table.provider,
      table.providerAccountId
    )
  ]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId)
  ]
);

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    supportAccessEnabled: integer("support_access_enabled", {
      mode: "boolean"
    })
      .notNull()
      .default(false),
    supportAccessExpiresAt: text("support_access_expires_at"),
    ...timestamps
  },
  (table) => [index("workspaces_owner_user_id_idx").on(table.ownerUserId)]
);

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_unique").on(
      table.workspaceId,
      table.userId
    ),
    index("workspace_members_user_id_idx").on(table.userId),
    check(
      "workspace_members_role_check",
      sql`${table.role} in ('owner', 'admin', 'editor', 'viewer')`
    )
  ]
);

export const workspaceEntitlements = sqliteTable(
  "workspace_entitlements",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planKey: text("plan_key").$type<PlanKey>().notNull(),
    status: text("status").$type<EntitlementStatus>().notNull(),
    source: text("source").$type<EntitlementSource>().notNull(),
    currentPeriodStart: text("current_period_start"),
    currentPeriodEnd: text("current_period_end"),
    canceledAt: text("canceled_at"),
    suspendedAt: text("suspended_at"),
    metadata: text("metadata", { mode: "json" }).$type<
      WorkspaceEntitlementMetadata
    >(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("workspace_entitlements_workspace_unique").on(
      table.workspaceId
    ),
    check(
      "workspace_entitlements_plan_key_check",
      sql`${table.planKey} in ('demo', 'starter', 'studio', 'pro', 'business')`
    ),
    check(
      "workspace_entitlements_status_check",
      sql`${table.status} in ('demo', 'trialing', 'active', 'pending_payment', 'overdue', 'canceled', 'expired', 'suspended')`
    ),
    check(
      "workspace_entitlements_source_check",
      sql`${table.source} in ('system', 'manual', 'beta', 'billing_provider')`
    )
  ]
);

export const storageObjects = sqliteTable(
  "storage_objects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerKind: text("provider_kind").$type<StorageProviderKind>().notNull(),
    ownershipMode: text("ownership_mode").$type<DataOwnershipMode>().notNull(),
    objectType: text("object_type").$type<StorageObjectType>().notNull(),
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    hashSha256: text("hash_sha256"),
    metadata: text("metadata", { mode: "json" }).$type<
      StorageObjectMetadata
    >(),
    deletedAt: text("deleted_at"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("storage_objects_workspace_provider_key_unique").on(
      table.workspaceId,
      table.providerKind,
      table.storageKey
    ),
    index("storage_objects_workspace_type_idx").on(
      table.workspaceId,
      table.objectType
    ),
    check(
      "storage_objects_provider_kind_check",
      sql`${table.providerKind} in ('local', 'user_cloud_placeholder', 'self_hosted_placeholder', 'fichr_managed_placeholder')`
    ),
    check(
      "storage_objects_ownership_mode_check",
      sql`${table.ownershipMode} in ('local_device', 'self_hosted', 'user_cloud', 'fichr_managed_optional')`
    ),
    check(
      "storage_objects_object_type_check",
      sql`${table.objectType} in ('import_source', 'product_image', 'export_file', 'generated_document', 'future_attachment')`
    )
  ]
);

export const billingCustomers = sqliteTable(
  "billing_customers",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").$type<BillingProviderKey>().notNull(),
    providerCustomerId: text("provider_customer_id"),
    email: text("email").notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("billing_customers_workspace_provider_unique").on(
      table.workspaceId,
      table.provider
    ),
    check(
      "billing_customers_provider_check",
      sql`${table.provider} in ('mollie', 'manual', 'future_provider')`
    )
  ]
);

export const billingSubscriptions = sqliteTable(
  "billing_subscriptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").$type<BillingProviderKey>().notNull(),
    providerSubscriptionId: text("provider_subscription_id"),
    planKey: text("plan_key").$type<PlanKey>().notNull(),
    status: text("status").$type<BillingSubscriptionStatus>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    interval: text("interval").$type<BillingInterval>().notNull(),
    currentPeriodStart: text("current_period_start"),
    currentPeriodEnd: text("current_period_end"),
    canceledAt: text("canceled_at"),
    metadata: text("metadata", { mode: "json" }).$type<BillingMetadata>(),
    ...timestamps
  },
  (table) => [
    index("billing_subscriptions_workspace_idx").on(table.workspaceId),
    index("billing_subscriptions_provider_subscription_idx").on(
      table.provider,
      table.providerSubscriptionId
    ),
    check(
      "billing_subscriptions_provider_check",
      sql`${table.provider} in ('mollie', 'manual', 'future_provider')`
    ),
    check(
      "billing_subscriptions_plan_key_check",
      sql`${table.planKey} in ('demo', 'starter', 'studio', 'pro', 'business')`
    ),
    check(
      "billing_subscriptions_status_check",
      sql`${table.status} in ('pending', 'active', 'trialing', 'past_due', 'canceled', 'expired', 'suspended')`
    ),
    check(
      "billing_subscriptions_interval_check",
      sql`${table.interval} in ('month', 'year')`
    )
  ]
);

export const billingInvoices = sqliteTable(
  "billing_invoices",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(
      () => billingSubscriptions.id,
      { onDelete: "set null" }
    ),
    invoiceNumber: text("invoice_number").notNull(),
    provider: text("provider").$type<BillingProviderKey>().notNull(),
    providerPaymentId: text("provider_payment_id"),
    providerInvoiceId: text("provider_invoice_id"),
    status: text("status").$type<BillingInvoiceStatus>().notNull(),
    planKey: text("plan_key").$type<PlanKey>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    interval: text("interval").$type<BillingInterval>().notNull(),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    issuedAt: text("issued_at"),
    paidAt: text("paid_at"),
    dueAt: text("due_at"),
    metadata: text("metadata", { mode: "json" }).$type<BillingMetadata>(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("billing_invoices_number_unique").on(table.invoiceNumber),
    index("billing_invoices_workspace_idx").on(table.workspaceId),
    uniqueIndex("billing_invoices_provider_payment_unique").on(
      table.provider,
      table.providerPaymentId
    ),
    check(
      "billing_invoices_provider_check",
      sql`${table.provider} in ('mollie', 'manual', 'future_provider')`
    ),
    check(
      "billing_invoices_status_check",
      sql`${table.status} in ('draft', 'pending', 'paid', 'failed', 'overdue', 'canceled', 'refunded')`
    ),
    check(
      "billing_invoices_plan_key_check",
      sql`${table.planKey} in ('demo', 'starter', 'studio', 'pro', 'business')`
    ),
    check(
      "billing_invoices_interval_check",
      sql`${table.interval} in ('month', 'year')`
    )
  ]
);

export const billingEvents = sqliteTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").$type<BillingProviderKey>().notNull(),
    eventType: text("event_type").notNull(),
    providerEventId: text("provider_event_id"),
    providerObjectId: text("provider_object_id"),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null"
    }),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    processedAt: text("processed_at"),
    processingStatus: text("processing_status")
      .$type<BillingEventStatus>()
      .notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<BillingMetadata>(),
    errorMessage: text("error_message"),
  },
  (table) => [
    uniqueIndex("billing_events_provider_payload_unique").on(
      table.provider,
      table.payloadHash
    ),
    index("billing_events_workspace_idx").on(table.workspaceId),
    check(
      "billing_events_provider_check",
      sql`${table.provider} in ('mollie', 'manual', 'future_provider')`
    ),
    check(
      "billing_events_status_check",
      sql`${table.processingStatus} in ('pending', 'processed', 'ignored', 'failed')`
    )
  ]
);

export const eventLogs = sqliteTable(
  "event_logs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: text("metadata", { mode: "json" })
      .$type<SafeEventMetadata>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("event_logs_workspace_id_idx").on(table.workspaceId),
    index("event_logs_actor_user_id_idx").on(table.actorUserId),
    index("event_logs_entity_idx").on(table.entityType, table.entityId)
  ]
);

export const imports = sqliteTable(
  "imports",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => users.id, {
      onDelete: "set null"
    }),
    sourceType: text("source_type").$type<ImportSourceType>().notNull(),
    status: text("status").$type<ImportStatus>().notNull(),
    originalFilename: text("original_filename").notNull(),
    storagePath: text("storage_path").notNull(),
    fileSize: integer("file_size").notNull(),
    columnMapping: text("column_mapping", { mode: "json" }).$type<
      ColumnMapping
    >(),
    detectedColumns: text("detected_columns", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    rowCount: integer("row_count").notNull().default(0),
    errorMessage: text("error_message"),
    ...timestamps
  },
  (table) => [
    index("imports_workspace_id_idx").on(table.workspaceId),
    index("imports_uploaded_by_idx").on(table.uploadedBy),
    check("imports_source_type_check", sql`${table.sourceType} in ('csv')`),
    check(
      "imports_status_check",
      sql`${table.status} in ('uploaded', 'parsed', 'mapped', 'processed', 'failed')`
    )
  ]
);

export const importRows = sqliteTable(
  "import_rows",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    importId: text("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    rawData: text("raw_data", { mode: "json" }).$type<RawImportRow>().notNull(),
    correctedData: text("corrected_data", { mode: "json" }).$type<RawImportRow>(),
    status: text("status").$type<ImportRowStatus>().notNull(),
    errorMessage: text("error_message"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("import_rows_import_row_index_unique").on(
      table.importId,
      table.rowIndex
    ),
    index("import_rows_workspace_id_idx").on(table.workspaceId),
    check(
      "import_rows_status_check",
      sql`${table.status} in ('pending', 'ready', 'imported', 'skipped', 'error')`
    )
  ]
);

export const csvMappingPresets = sqliteTable(
  "csv_mapping_presets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    columnSignature: text("column_signature").notNull(),
    columns: text("columns", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    mapping: text("mapping", { mode: "json" })
      .$type<ColumnMapping>()
      .notNull()
      .default(sql`'{}'`),
    usageCount: integer("usage_count").notNull().default(1),
    lastUsedAt: text("last_used_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    ...timestamps
  },
  (table) => [
    uniqueIndex("csv_mapping_presets_workspace_signature_unique").on(
      table.workspaceId,
      table.columnSignature
    ),
    index("csv_mapping_presets_workspace_id_idx").on(table.workspaceId),
    index("csv_mapping_presets_last_used_at_idx").on(table.lastUsedAt)
  ]
);

export const spaces = sqliteTable(
  "spaces",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    deletedAt: text("deleted_at"),
    ...timestamps
  },
  (table) => [
    index("spaces_workspace_id_idx").on(table.workspaceId),
    uniqueIndex("spaces_workspace_name_unique").on(
      table.workspaceId,
      table.name
    )
  ]
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    importId: text("import_id").references(() => imports.id, {
      onDelete: "set null"
    }),
    importRowId: text("import_row_id").references(() => importRows.id, {
      onDelete: "set null"
    }),
    spaceId: text("space_id").references(() => spaces.id, {
      onDelete: "set null"
    }),
    status: text("status").$type<ProductStatus>().notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    category: text("category"),
    description: text("description"),
    materials: text("materials"),
    dimensions: text("dimensions"),
    origin: text("origin"),
    currentPrice: real("current_price"),
    desiredPrice: real("desired_price"),
    costPrice: real("cost_price"),
    targetMargin: real("target_margin"),
    sku: text("sku"),
    imageUrl: text("image_url"),
    clientNotes: text("client_notes"),
    draftData: text("draft_data", { mode: "json" })
      .$type<ProductDraftData>()
      .notNull(),
    rawData: text("raw_data", { mode: "json" }).$type<RawImportRow>().notNull(),
    validatedData: text("validated_data", { mode: "json" }).$type<
      ProductDraftData
    >(),
    deletedAt: text("deleted_at"),
    deletedReason: text("deleted_reason"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("products_import_row_id_unique").on(table.importRowId),
    index("products_workspace_id_idx").on(table.workspaceId),
    index("products_import_id_idx").on(table.importId),
    index("products_space_id_idx").on(table.spaceId),
    index("products_workspace_deleted_at_idx").on(
      table.workspaceId,
      table.deletedAt
    ),
    check(
      "products_status_check",
      sql`${table.status} in ('draft', 'needs_info', 'needs_review', 'validated')`
    )
  ]
);

export const aiSuggestions = sqliteTable(
  "ai_suggestions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, {
      onDelete: "cascade"
    }),
    type: text("type").$type<AiSuggestionType>().notNull(),
    status: text("status").$type<AiSuggestionStatus>().notNull(),
    inputHash: text("input_hash"),
    suggestionData: text("suggestion_data", { mode: "json" })
      .$type<AiSuggestionData>()
      .notNull()
      .default(sql`'{}'`),
    warnings: text("warnings", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    ...timestamps
  },
  (table) => [
    index("ai_suggestions_workspace_id_idx").on(table.workspaceId),
    index("ai_suggestions_product_id_idx").on(table.productId),
    check(
      "ai_suggestions_type_check",
      sql`${table.type} in ('product_suggestion', 'missing_fields_review', 'description_rewrite', 'pricing_consistency_review')`
    ),
    check(
      "ai_suggestions_status_check",
      sql`${table.status} in ('proposed', 'dismissed', 'failed')`
    )
  ]
);

export const aiUsageLogs = sqliteTable(
  "ai_usage_logs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    action: text("action").notNull(),
    status: text("status").$type<AiUsageStatus>().notNull(),
    metadata: text("metadata", { mode: "json" })
      .$type<AiUsageLogMetadata>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("ai_usage_logs_workspace_id_idx").on(table.workspaceId),
    check(
      "ai_usage_logs_status_check",
      sql`${table.status} in ('disabled', 'complete', 'failed')`
    )
  ]
);

export const catalogExports = sqliteTable(
  "exports",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null"
    }),
    exportType: text("export_type").$type<CatalogExportType>().notNull(),
    exportScope: text("export_scope")
      .$type<CatalogExportScope>()
      .notNull()
      .default("catalog"),
    exportCode: text("export_code"),
    dataHash: text("data_hash"),
    fileHash: text("file_hash"),
    productIdsSnapshot: text("product_ids_snapshot", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    filename: text("filename"),
    status: text("status").$type<CatalogExportStatus>().notNull(),
    storagePath: text("storage_path"),
    productCount: integer("product_count").notNull().default(0),
    deletedAt: text("deleted_at"),
    ...timestamps
  },
  (table) => [
    index("exports_workspace_id_idx").on(table.workspaceId),
    index("exports_created_by_idx").on(table.createdBy),
    uniqueIndex("exports_export_code_unique").on(table.exportCode),
    check(
      "exports_export_type_check",
      sql`${table.exportType} in ('text', 'csv', 'pdf')`
    ),
    check(
      "exports_export_scope_check",
      sql`${table.exportScope} in ('product', 'selection', 'catalog')`
    ),
    check(
      "exports_status_check",
      sql`${table.status} in ('pending', 'complete', 'failed', 'deleted')`
    )
  ]
);

export const productAudits = sqliteTable(
  "product_audits",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    status: text("status").$type<ProductAuditStatus>().notNull(),
    score: integer("score").notNull(),
    ...timestamps
  },
  (table) => [
    index("product_audits_workspace_id_idx").on(table.workspaceId),
    index("product_audits_product_id_idx").on(table.productId),
    check(
      "product_audits_status_check",
      sql`${table.status} in ('current', 'stale')`
    )
  ]
);

export const auditFindings = sqliteTable(
  "audit_findings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    auditId: text("audit_id")
      .notNull()
      .references(() => productAudits.id, { onDelete: "cascade" }),
    severity: text("severity").$type<AuditFindingSeverity>().notNull(),
    type: text("type").$type<AuditFindingType>().notNull(),
    fieldKey: text("field_key").$type<AuditFieldKey>().notNull(),
    message: text("message").notNull(),
    recommendation: text("recommendation").notNull(),
    requiresClientDecision: integer("requires_client_decision", {
      mode: "boolean"
    })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("audit_findings_workspace_id_idx").on(table.workspaceId),
    index("audit_findings_product_id_idx").on(table.productId),
    index("audit_findings_audit_id_idx").on(table.auditId),
    check(
      "audit_findings_severity_check",
      sql`${table.severity} in ('info', 'warning', 'blocking')`
    ),
    check(
      "audit_findings_type_check",
      sql`${table.type} in ('missing', 'recommended_missing', 'too_long', 'misplaced', 'inconsistent', 'price_risk', 'technical_required')`
    )
  ]
);

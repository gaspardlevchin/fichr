PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_by` text,
	`export_type` text NOT NULL,
	`status` text NOT NULL,
	`storage_path` text,
	`product_count` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "exports_export_type_check" CHECK("__new_exports"."export_type" in ('text', 'csv', 'pdf')),
	CONSTRAINT "exports_status_check" CHECK("__new_exports"."status" in ('pending', 'complete', 'failed', 'deleted'))
);
--> statement-breakpoint
INSERT INTO `__new_exports`("id", "workspace_id", "created_by", "export_type", "status", "storage_path", "product_count", "deleted_at", "created_at", "updated_at") SELECT "id", "workspace_id", "created_by", "export_type", "status", "storage_path", "product_count", "deleted_at", "created_at", "updated_at" FROM `exports`;--> statement-breakpoint
DROP TABLE `exports`;--> statement-breakpoint
ALTER TABLE `__new_exports` RENAME TO `exports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `exports_workspace_id_idx` ON `exports` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `exports_created_by_idx` ON `exports` (`created_by`);
CREATE TABLE `exports` (
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
	CONSTRAINT "exports_export_type_check" CHECK("exports"."export_type" in ('text', 'csv')),
	CONSTRAINT "exports_status_check" CHECK("exports"."status" in ('pending', 'complete', 'failed', 'deleted'))
);
--> statement-breakpoint
CREATE INDEX `exports_workspace_id_idx` ON `exports` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `exports_created_by_idx` ON `exports` (`created_by`);
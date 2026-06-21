CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`import_id` text,
	`import_row_id` text,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`category` text,
	`description` text,
	`materials` text,
	`dimensions` text,
	`origin` text,
	`current_price` real,
	`desired_price` real,
	`cost_price` real,
	`target_margin` real,
	`sku` text,
	`image_url` text,
	`client_notes` text,
	`draft_data` text NOT NULL,
	`raw_data` text NOT NULL,
	`validated_data` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_row_id`) REFERENCES `import_rows`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "products_status_check" CHECK("products"."status" in ('draft', 'needs_info', 'needs_review', 'validated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_import_row_id_unique` ON `products` (`import_row_id`);--> statement-breakpoint
CREATE INDEX `products_workspace_id_idx` ON `products` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `products_import_id_idx` ON `products` (`import_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`import_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`raw_data` text NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_rows_status_check" CHECK("__new_import_rows"."status" in ('pending', 'ready', 'imported', 'skipped', 'error'))
);
--> statement-breakpoint
INSERT INTO `__new_import_rows`("id", "workspace_id", "import_id", "row_index", "raw_data", "status", "error_message", "created_at", "updated_at") SELECT "id", "workspace_id", "import_id", "row_index", "raw_data", "status", "error_message", "created_at", "updated_at" FROM `import_rows`;--> statement-breakpoint
DROP TABLE `import_rows`;--> statement-breakpoint
ALTER TABLE `__new_import_rows` RENAME TO `import_rows`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `import_rows_import_row_index_unique` ON `import_rows` (`import_id`,`row_index`);--> statement-breakpoint
CREATE INDEX `import_rows_workspace_id_idx` ON `import_rows` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `__new_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`uploaded_by` text,
	`source_type` text NOT NULL,
	`status` text NOT NULL,
	`original_filename` text NOT NULL,
	`storage_path` text NOT NULL,
	`file_size` integer NOT NULL,
	`column_mapping` text,
	`detected_columns` text DEFAULT '[]' NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "imports_source_type_check" CHECK("__new_imports"."source_type" in ('csv')),
	CONSTRAINT "imports_status_check" CHECK("__new_imports"."status" in ('uploaded', 'parsed', 'mapped', 'processed', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_imports`("id", "workspace_id", "uploaded_by", "source_type", "status", "original_filename", "storage_path", "file_size", "column_mapping", "detected_columns", "row_count", "error_message", "created_at", "updated_at") SELECT "id", "workspace_id", "uploaded_by", "source_type", "status", "original_filename", "storage_path", "file_size", "column_mapping", "detected_columns", "row_count", "error_message", "created_at", "updated_at" FROM `imports`;--> statement-breakpoint
DROP TABLE `imports`;--> statement-breakpoint
ALTER TABLE `__new_imports` RENAME TO `imports`;--> statement-breakpoint
CREATE INDEX `imports_workspace_id_idx` ON `imports` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `imports_uploaded_by_idx` ON `imports` (`uploaded_by`);
CREATE TABLE `import_rows` (
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
	CONSTRAINT "import_rows_status_check" CHECK("import_rows"."status" in ('pending', 'ready', 'skipped', 'error'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_rows_import_row_index_unique` ON `import_rows` (`import_id`,`row_index`);--> statement-breakpoint
CREATE INDEX `import_rows_workspace_id_idx` ON `import_rows` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `imports` (
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
	CONSTRAINT "imports_source_type_check" CHECK("imports"."source_type" in ('csv')),
	CONSTRAINT "imports_status_check" CHECK("imports"."status" in ('uploaded', 'parsed', 'mapped', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `imports_workspace_id_idx` ON `imports` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `imports_uploaded_by_idx` ON `imports` (`uploaded_by`);
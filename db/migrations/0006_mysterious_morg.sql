CREATE TABLE `csv_mapping_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`column_signature` text NOT NULL,
	`columns` text DEFAULT '[]' NOT NULL,
	`mapping` text DEFAULT '{}' NOT NULL,
	`usage_count` integer DEFAULT 1 NOT NULL,
	`last_used_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `csv_mapping_presets_workspace_signature_unique` ON `csv_mapping_presets` (`workspace_id`,`column_signature`);--> statement-breakpoint
CREATE INDEX `csv_mapping_presets_workspace_id_idx` ON `csv_mapping_presets` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `csv_mapping_presets_last_used_at_idx` ON `csv_mapping_presets` (`last_used_at`);
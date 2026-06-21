CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spaces_workspace_id_idx` ON `spaces` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_workspace_name_unique` ON `spaces` (`workspace_id`,`name`);--> statement-breakpoint
ALTER TABLE `products` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
ALTER TABLE `products` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `products` ADD `deleted_reason` text;--> statement-breakpoint
CREATE INDEX `products_space_id_idx` ON `products` (`space_id`);--> statement-breakpoint
CREATE INDEX `products_workspace_deleted_at_idx` ON `products` (`workspace_id`,`deleted_at`);
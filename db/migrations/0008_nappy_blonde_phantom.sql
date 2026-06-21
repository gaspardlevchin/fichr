CREATE TABLE `ai_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`input_hash` text,
	`suggestion_data` text DEFAULT '{}' NOT NULL,
	`warnings` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_suggestions_type_check" CHECK("ai_suggestions"."type" in ('product_improvement')),
	CONSTRAINT "ai_suggestions_status_check" CHECK("ai_suggestions"."status" in ('proposed', 'applied', 'dismissed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `ai_suggestions_workspace_id_idx` ON `ai_suggestions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `ai_suggestions_product_id_idx` ON `ai_suggestions` (`product_id`);--> statement-breakpoint
CREATE TABLE `ai_usage_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_usage_logs_status_check" CHECK("ai_usage_logs"."status" in ('disabled', 'complete', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `ai_usage_logs_workspace_id_idx` ON `ai_usage_logs` (`workspace_id`);
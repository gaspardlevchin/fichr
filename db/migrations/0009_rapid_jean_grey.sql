PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_suggestions` (
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
	CONSTRAINT "ai_suggestions_type_check" CHECK("__new_ai_suggestions"."type" in ('product_suggestion', 'missing_fields_review', 'description_rewrite', 'pricing_consistency_review')),
	CONSTRAINT "ai_suggestions_status_check" CHECK("__new_ai_suggestions"."status" in ('proposed', 'dismissed', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_ai_suggestions`("id", "workspace_id", "product_id", "type", "status", "input_hash", "suggestion_data", "warnings", "created_at", "updated_at") SELECT "id", "workspace_id", "product_id", "type", "status", "input_hash", "suggestion_data", "warnings", "created_at", "updated_at" FROM `ai_suggestions`;--> statement-breakpoint
DROP TABLE `ai_suggestions`;--> statement-breakpoint
ALTER TABLE `__new_ai_suggestions` RENAME TO `ai_suggestions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ai_suggestions_workspace_id_idx` ON `ai_suggestions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `ai_suggestions_product_id_idx` ON `ai_suggestions` (`product_id`);
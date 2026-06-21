CREATE TABLE `audit_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`audit_id` text NOT NULL,
	`severity` text NOT NULL,
	`type` text NOT NULL,
	`field_key` text NOT NULL,
	`message` text NOT NULL,
	`recommendation` text NOT NULL,
	`requires_client_decision` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`audit_id`) REFERENCES `product_audits`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "audit_findings_severity_check" CHECK("audit_findings"."severity" in ('info', 'warning', 'blocking')),
	CONSTRAINT "audit_findings_type_check" CHECK("audit_findings"."type" in ('missing', 'recommended_missing', 'too_long', 'misplaced', 'inconsistent', 'price_risk', 'technical_required'))
);
--> statement-breakpoint
CREATE INDEX `audit_findings_workspace_id_idx` ON `audit_findings` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `audit_findings_product_id_idx` ON `audit_findings` (`product_id`);--> statement-breakpoint
CREATE INDEX `audit_findings_audit_id_idx` ON `audit_findings` (`audit_id`);--> statement-breakpoint
CREATE TABLE `product_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`status` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "product_audits_status_check" CHECK("product_audits"."status" in ('current', 'stale'))
);
--> statement-breakpoint
CREATE INDEX `product_audits_workspace_id_idx` ON `product_audits` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `product_audits_product_id_idx` ON `product_audits` (`product_id`);
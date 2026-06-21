CREATE TABLE `billing_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_customer_id` text,
	`email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "billing_customers_provider_check" CHECK("billing_customers"."provider" in ('mollie', 'manual', 'future_provider'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customers_workspace_provider_unique` ON `billing_customers` (`workspace_id`,`provider`);--> statement-breakpoint
CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`provider_event_id` text,
	`provider_object_id` text,
	`workspace_id` text,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text,
	`processing_status` text NOT NULL,
	`payload_hash` text NOT NULL,
	`payload_json` text,
	`error_message` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "billing_events_provider_check" CHECK("billing_events"."provider" in ('mollie', 'manual', 'future_provider')),
	CONSTRAINT "billing_events_status_check" CHECK("billing_events"."processing_status" in ('pending', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_events_provider_payload_unique` ON `billing_events` (`provider`,`payload_hash`);--> statement-breakpoint
CREATE INDEX `billing_events_workspace_idx` ON `billing_events` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `billing_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`subscription_id` text,
	`invoice_number` text NOT NULL,
	`provider` text NOT NULL,
	`provider_payment_id` text,
	`provider_invoice_id` text,
	`status` text NOT NULL,
	`plan_key` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`interval` text NOT NULL,
	`period_start` text,
	`period_end` text,
	`issued_at` text,
	`paid_at` text,
	`due_at` text,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `billing_subscriptions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "billing_invoices_provider_check" CHECK("billing_invoices"."provider" in ('mollie', 'manual', 'future_provider')),
	CONSTRAINT "billing_invoices_status_check" CHECK("billing_invoices"."status" in ('draft', 'pending', 'paid', 'failed', 'overdue', 'canceled', 'refunded')),
	CONSTRAINT "billing_invoices_plan_key_check" CHECK("billing_invoices"."plan_key" in ('demo', 'starter', 'studio', 'pro', 'business')),
	CONSTRAINT "billing_invoices_interval_check" CHECK("billing_invoices"."interval" in ('month', 'year'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_invoices_number_unique` ON `billing_invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `billing_invoices_workspace_idx` ON `billing_invoices` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_invoices_provider_payment_unique` ON `billing_invoices` (`provider`,`provider_payment_id`);--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subscription_id` text,
	`plan_key` text NOT NULL,
	`status` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`interval` text NOT NULL,
	`current_period_start` text,
	`current_period_end` text,
	`canceled_at` text,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "billing_subscriptions_provider_check" CHECK("billing_subscriptions"."provider" in ('mollie', 'manual', 'future_provider')),
	CONSTRAINT "billing_subscriptions_plan_key_check" CHECK("billing_subscriptions"."plan_key" in ('demo', 'starter', 'studio', 'pro', 'business')),
	CONSTRAINT "billing_subscriptions_status_check" CHECK("billing_subscriptions"."status" in ('pending', 'active', 'trialing', 'past_due', 'canceled', 'expired', 'suspended')),
	CONSTRAINT "billing_subscriptions_interval_check" CHECK("billing_subscriptions"."interval" in ('month', 'year'))
);
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_workspace_idx` ON `billing_subscriptions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `billing_subscriptions_provider_subscription_idx` ON `billing_subscriptions` (`provider`,`provider_subscription_id`);--> statement-breakpoint
CREATE TABLE `workspace_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`plan_key` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`current_period_start` text,
	`current_period_end` text,
	`canceled_at` text,
	`suspended_at` text,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_entitlements_plan_key_check" CHECK("workspace_entitlements"."plan_key" in ('demo', 'starter', 'studio', 'pro', 'business')),
	CONSTRAINT "workspace_entitlements_status_check" CHECK("workspace_entitlements"."status" in ('demo', 'trialing', 'active', 'pending_payment', 'overdue', 'canceled', 'expired', 'suspended')),
	CONSTRAINT "workspace_entitlements_source_check" CHECK("workspace_entitlements"."source" in ('system', 'manual', 'beta', 'billing_provider'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_entitlements_workspace_unique` ON `workspace_entitlements` (`workspace_id`);
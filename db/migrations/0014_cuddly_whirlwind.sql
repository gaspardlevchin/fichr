CREATE TABLE `storage_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider_kind` text NOT NULL,
	`ownership_mode` text NOT NULL,
	`object_type` text NOT NULL,
	`storage_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer,
	`hash_sha256` text,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "storage_objects_provider_kind_check" CHECK("storage_objects"."provider_kind" in ('local', 'user_cloud_placeholder', 'self_hosted_placeholder', 'fichr_managed_placeholder')),
	CONSTRAINT "storage_objects_ownership_mode_check" CHECK("storage_objects"."ownership_mode" in ('local_device', 'self_hosted', 'user_cloud', 'fichr_managed_optional')),
	CONSTRAINT "storage_objects_object_type_check" CHECK("storage_objects"."object_type" in ('import_source', 'product_image', 'export_file', 'generated_document', 'future_attachment'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_objects_workspace_provider_key_unique` ON `storage_objects` (`workspace_id`,`provider_kind`,`storage_key`);--> statement-breakpoint
CREATE INDEX `storage_objects_workspace_type_idx` ON `storage_objects` (`workspace_id`,`object_type`);
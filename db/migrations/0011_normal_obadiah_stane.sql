ALTER TABLE `users` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `users` ADD `provider_account_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_provider_account_unique` ON `users` (`provider`,`provider_account_id`);
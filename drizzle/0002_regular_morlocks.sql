CREATE TABLE `magic_link_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `magic_link_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `magic_link_tokens_token_unique` UNIQUE(`token`),
	CONSTRAINT `mlt_token_idx` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `households` MODIFY COLUMN `kioskPermissions` json;--> statement-breakpoint
ALTER TABLE `push_subscriptions` MODIFY COLUMN `prefs` json NOT NULL;--> statement-breakpoint
CREATE INDEX `mlt_email_idx` ON `magic_link_tokens` (`email`);
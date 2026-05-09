CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`actorUserId` int,
	`actorKind` enum('user','kiosk') NOT NULL DEFAULT 'user',
	`action` varchar(48) NOT NULL,
	`itemId` int,
	`summary` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`nickname` varchar(60),
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `household_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `hm_household_user_uniq` UNIQUE(`householdId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`kioskPin` varchar(8),
	`kioskPermissions` json DEFAULT ('{"view":true,"add":true,"check":true,"edit":false,"delete":false}'),
	`latitude` varchar(16),
	`longitude` varchar(16),
	`lowStockThreshold` int NOT NULL DEFAULT 1,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `households_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`code` varchar(16) NOT NULL,
	`email` varchar(320),
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`invitedBy` int NOT NULL,
	`expiresAt` timestamp,
	`consumedBy` int,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `invites_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `item_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`householdId` int NOT NULL,
	`storeSlug` varchar(32) NOT NULL,
	`priceCents` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unit` varchar(24) NOT NULL DEFAULT 'ea',
	`recordedBy` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_prices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`kind` enum('shopping','pantry','staple') NOT NULL,
	`name` varchar(200) NOT NULL,
	`category` enum('produce','dairy','meat','seafood','bakery','pantry','frozen','beverages','snacks','household','personal_care','baby','pet','other') NOT NULL DEFAULT 'other',
	`quantity` int NOT NULL DEFAULT 1,
	`unit` varchar(24) NOT NULL DEFAULT 'ea',
	`note` text,
	`barcode` varchar(32),
	`photoKey` varchar(256),
	`expiresAt` bigint,
	`lowStockThreshold` int,
	`checkedAt` bigint,
	`checkedBy` int,
	`deletedAt` bigint,
	`deletedBy` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`householdId` int NOT NULL,
	`endpoint` varchar(768) NOT NULL,
	`p256dh` varchar(256) NOT NULL,
	`authKey` varchar(256) NOT NULL,
	`prefs` json NOT NULL DEFAULT ('{"itemAdded":true,"itemChecked":true,"expiringSoon":true,"expired":true}'),
	`deviceLabel` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `audit_hh_created_idx` ON `audit_log` (`householdId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `hm_user_idx` ON `household_members` (`userId`);--> statement-breakpoint
CREATE INDEX `households_createdBy_idx` ON `households` (`createdBy`);--> statement-breakpoint
CREATE INDEX `invites_household_idx` ON `invites` (`householdId`);--> statement-breakpoint
CREATE INDEX `prices_item_idx` ON `item_prices` (`itemId`);--> statement-breakpoint
CREATE INDEX `prices_hh_store_idx` ON `item_prices` (`householdId`,`storeSlug`);--> statement-breakpoint
CREATE INDEX `items_hh_kind_idx` ON `items` (`householdId`,`kind`);--> statement-breakpoint
CREATE INDEX `items_deleted_idx` ON `items` (`deletedAt`);--> statement-breakpoint
CREATE INDEX `items_barcode_idx` ON `items` (`barcode`);--> statement-breakpoint
CREATE INDEX `push_user_idx` ON `push_subscriptions` (`userId`);--> statement-breakpoint
CREATE INDEX `push_endpoint_idx` ON `push_subscriptions` (`endpoint`);
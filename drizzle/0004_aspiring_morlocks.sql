ALTER TABLE `items` ADD `storeSlug` varchar(32);--> statement-breakpoint
CREATE INDEX `items_hh_kind_store_idx` ON `items` (`householdId`,`kind`,`storeSlug`);
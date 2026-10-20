CREATE TABLE `subscription_setup` (
	`id` integer PRIMARY KEY NOT NULL,
	CONSTRAINT "subscription_setup_singleton" CHECK("subscription_setup"."id" = 1)
);
--> statement-breakpoint
UPDATE `senders` SET `id` = 'host' WHERE `id` = 'root';--> statement-breakpoint
UPDATE `subscriptions` SET `sender` = 'host' WHERE `sender` = 'root';

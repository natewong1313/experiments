CREATE TABLE `host` (
	`id` integer PRIMARY KEY NOT NULL,
	`server_seq` integer NOT NULL,
	CONSTRAINT "host_singleton" CHECK("host"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`default_chat_id` text NOT NULL,
	`summary` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_defaultChatId_unique` ON `sessions` (`default_chat_id`);
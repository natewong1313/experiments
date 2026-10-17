CREATE TABLE `root` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	CONSTRAINT "root_singleton" CHECK("root"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`default_chat` text NOT NULL,
	`summary` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriber_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`router` text NOT NULL,
	`channel` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriber_channels_router_channel` ON `subscriber_channels` (`router`,`channel`);--> statement-breakpoint
CREATE TABLE `subscriber_routers` (
	`router` text PRIMARY KEY NOT NULL,
	`delivered_revision` integer NOT NULL
);

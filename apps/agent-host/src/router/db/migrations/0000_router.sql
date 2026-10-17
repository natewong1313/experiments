CREATE TABLE `connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`server_seq` integer NOT NULL,
	CONSTRAINT "connection_singleton" CHECK("connection"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `senders` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`channel` text PRIMARY KEY NOT NULL,
	`sender` text NOT NULL,
	`revision` integer NOT NULL
);

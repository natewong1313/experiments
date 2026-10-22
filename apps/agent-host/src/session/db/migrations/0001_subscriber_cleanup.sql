CREATE TABLE `closed_routers` (
	`router` text PRIMARY KEY NOT NULL,
	`closed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `closed_routers_closed_at` ON `closed_routers` (`closed_at`);--> statement-breakpoint
CREATE TABLE `subscriber_check` (
	`id` integer PRIMARY KEY NOT NULL,
	CONSTRAINT "subscriber_check_singleton" CHECK("subscriber_check"."id" = 1)
);

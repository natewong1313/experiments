CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`acp_session_id` text,
	`cwd` text NOT NULL,
	`created_at` text NOT NULL,
	`session_state` text NOT NULL,
	`chat_state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`synced_revision` integer DEFAULT 0 NOT NULL,
	`creation_attempts` integer DEFAULT 0 NOT NULL,
	`disposing` integer DEFAULT false NOT NULL
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

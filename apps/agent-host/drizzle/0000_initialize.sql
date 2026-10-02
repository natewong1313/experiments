CREATE TABLE `actions` (
	`seq` integer PRIMARY KEY NOT NULL,
	`envelope` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dispatches` (
	`client_id` text NOT NULL,
	`client_seq` integer NOT NULL,
	`frame` text NOT NULL,
	`envelope` text NOT NULL,
	PRIMARY KEY(`client_id`, `client_seq`)
);
--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`scope` text NOT NULL,
	`id` text NOT NULL,
	`chunk` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`scope`, `id`, `chunk`)
);
--> statement-breakpoint
CREATE TABLE `host` (
	`id` integer PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`root` text NOT NULL,
	`replay_floor` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`uri` text PRIMARY KEY NOT NULL,
	`chat_uri` text NOT NULL,
	`container` text NOT NULL,
	`acp_session` text,
	`created_at` text NOT NULL,
	`modified_at` text NOT NULL,
	`session` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_chat_uri_unique` ON `sessions` (`chat_uri`);--> statement-breakpoint
CREATE TABLE `turns` (
	`chat_uri` text NOT NULL,
	`turn_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`chat_uri`, `turn_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turns_chat_uri_ordinal_unique` ON `turns` (`chat_uri`,`ordinal`);
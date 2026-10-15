CREATE TABLE `host_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_id` text NOT NULL,
	`update` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`retry_at` integer,
	`error` text
);

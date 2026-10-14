CREATE TABLE `__new_host` (
	`server_seq` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_host`("server_seq") SELECT "server_seq" FROM `host`;--> statement-breakpoint
INSERT INTO `__new_host`("server_seq") SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM `__new_host`);--> statement-breakpoint
DROP TABLE `host`;--> statement-breakpoint
ALTER TABLE `__new_host` RENAME TO `host`;

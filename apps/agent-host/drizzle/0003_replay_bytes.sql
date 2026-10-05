ALTER TABLE `actions` ADD `bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `host` ADD `replay_bytes` integer DEFAULT 0 NOT NULL;
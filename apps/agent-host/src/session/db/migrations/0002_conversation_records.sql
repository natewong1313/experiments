CREATE TABLE `chats` (
	`resource` text PRIMARY KEY NOT NULL,
	`summary` text NOT NULL,
	`metadata` text NOT NULL,
	`active_turn` integer,
	`window_id` text,
	`window_start` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `response_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`turn` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`target_id` text,
	`pending` integer NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`turn`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `response_parts_turn_position` ON `response_parts` (`turn`,`position`);--> statement-breakpoint
CREATE INDEX `response_parts_turn_target` ON `response_parts` (`turn`,`target_id`,`position`);--> statement-breakpoint
CREATE INDEX `response_parts_turn_pending` ON `response_parts` (`turn`,`pending`,`position`);--> statement-breakpoint
CREATE TABLE `text_segments` (
	`part` integer NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`bytes` integer NOT NULL,
	PRIMARY KEY(`part`, `position`),
	FOREIGN KEY (`part`) REFERENCES `response_parts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat` text NOT NULL,
	`turn_id` text NOT NULL,
	`position` integer NOT NULL,
	`state` text NOT NULL,
	`started_at` text,
	`duration` integer,
	`message` text NOT NULL,
	`usage` text,
	FOREIGN KEY (`chat`) REFERENCES `chats`(`resource`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turns_chat_turn_id` ON `turns` (`chat`,`turn_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `turns_chat_position` ON `turns` (`chat`,`position`);--> statement-breakpoint
ALTER TABLE `session` DROP COLUMN `chat_state`;
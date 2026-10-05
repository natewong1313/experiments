CREATE TABLE `chats` (
	`uri` text PRIMARY KEY NOT NULL,
	`metadata` text NOT NULL,
	`active_turn` text,
	`content_bytes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_pieces` (
	`uri` text NOT NULL,
	`piece` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`uri`, `piece`)
);
--> statement-breakpoint
CREATE TABLE `contents` (
	`uri` text PRIMARY KEY NOT NULL,
	`chat_uri` text NOT NULL,
	`content_type` text NOT NULL,
	`encoding` text NOT NULL,
	`bytes` integer NOT NULL,
	`retired_seq` integer
);
--> statement-breakpoint
CREATE INDEX `contents_retired` ON `contents` (`retired_seq`);--> statement-breakpoint
CREATE TABLE `reply_parts` (
	`chat_uri` text NOT NULL,
	`turn_id` text NOT NULL,
	`position` integer NOT NULL,
	`identity` text,
	`kind` text NOT NULL,
	`status` text,
	`metadata` text NOT NULL,
	`bytes` integer NOT NULL,
	`pieces` integer NOT NULL,
	PRIMARY KEY(`chat_uri`, `turn_id`, `position`)
);
--> statement-breakpoint
CREATE INDEX `reply_parts_identity` ON `reply_parts` (`chat_uri`,`turn_id`,`identity`,`position`);--> statement-breakpoint
CREATE INDEX `reply_parts_status` ON `reply_parts` (`chat_uri`,`turn_id`,`kind`,`status`);--> statement-breakpoint
CREATE TABLE `text_pieces` (
	`chat_uri` text NOT NULL,
	`turn_id` text NOT NULL,
	`position` integer NOT NULL,
	`piece` integer NOT NULL,
	`text` text NOT NULL,
	PRIMARY KEY(`chat_uri`, `turn_id`, `position`, `piece`)
);
--> statement-breakpoint
CREATE TABLE `turn_records` (
	`chat_uri` text NOT NULL,
	`turn_id` text NOT NULL,
	`metadata` text NOT NULL,
	`bytes` integer NOT NULL,
	`part_count` integer NOT NULL,
	`blocking_count` integer NOT NULL,
	`input_count` integer NOT NULL,
	PRIMARY KEY(`chat_uri`, `turn_id`)
);

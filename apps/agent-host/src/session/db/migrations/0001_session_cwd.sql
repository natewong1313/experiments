CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`acp_session_id` text,
	`cwd` text NOT NULL,
	`created_at` text NOT NULL,
	`session_state` text NOT NULL,
	`chat_state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_session` (`id`, `host_id`, `acp_session_id`, `cwd`, `created_at`, `session_state`, `chat_state`, `revision`)
SELECT `id`, `host_id`, `acp_session_id`, coalesce(substr(json_extract(`summary`, '$.workingDirectories[0]'), 8), '/'), json_extract(`summary`, '$.createdAt'), `session_state`, `chat_state`, `revision` FROM `session`;
--> statement-breakpoint
DROP TABLE `session`;
--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;

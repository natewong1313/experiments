CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`acp_session_id` text,
	`session_state` text NOT NULL,
	`chat_state` text NOT NULL,
	`summary` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);

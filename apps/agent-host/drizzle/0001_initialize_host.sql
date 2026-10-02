INSERT INTO `host` (`id`, `seq`, `root`, `replay_floor`)
VALUES (1, 0, '{"agents":[],"activeSessions":0}', 0)
ON CONFLICT (`id`) DO NOTHING;

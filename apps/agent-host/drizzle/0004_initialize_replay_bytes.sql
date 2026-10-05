UPDATE actions SET bytes = LENGTH(CAST(envelope AS BLOB));
--> statement-breakpoint
DELETE FROM actions WHERE seq < (SELECT MIN(seq) FROM (SELECT seq, SUM(bytes) OVER (ORDER BY seq DESC) AS retained_bytes FROM actions) WHERE retained_bytes <= 2097152);
--> statement-breakpoint
UPDATE host SET replay_bytes = (SELECT COALESCE(SUM(bytes), 0) FROM actions);

CREATE TABLE voice_trials (id TEXT PRIMARY KEY NOT NULL, client TEXT NOT NULL, day TEXT NOT NULL, started_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE INDEX voice_trials_day ON voice_trials (day);
--> statement-breakpoint
CREATE INDEX voice_trials_client_day ON voice_trials (client, day);

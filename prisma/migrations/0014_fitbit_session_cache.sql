-- Cache Fitbit/Google Health exercise sessions in Postgres so /health and
-- the detection list render instantly from Supabase instead of round-tripping
-- to Google on every page load. Refreshes are explicit (button) or stale-driven
-- (lastSyncedAt > 1h).

ALTER TABLE "HealthAccount"
  ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "FitbitExerciseSession" (
  "id"                TEXT PRIMARY KEY,
  "userId"            TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "externalId"        TEXT NOT NULL,
  "startTime"         TIMESTAMP(3) NOT NULL,
  "endTime"           TIMESTAMP(3) NOT NULL,
  "displayName"       TEXT NOT NULL,
  "exerciseType"      TEXT,
  "durationSec"       INTEGER NOT NULL DEFAULT 0,
  "calories"          INTEGER,
  "steps"             INTEGER,
  "avgHR"             INTEGER,
  "importedWorkoutId" TEXT,
  "fetchedAt"         TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "FitbitExerciseSession_userId_externalId_key"
  ON "FitbitExerciseSession" ("userId", "externalId");

CREATE INDEX IF NOT EXISTS "FitbitExerciseSession_userId_startTime_idx"
  ON "FitbitExerciseSession" ("userId", "startTime");

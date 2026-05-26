-- Per-workout heart-rate samples synced from Google Health,
-- plus the start/end timestamps that define the sync window.

ALTER TABLE "Workout"
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endedAt"   TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "WorkoutHeartRateSample" (
  "id"        TEXT PRIMARY KEY,
  "workoutId" TEXT NOT NULL REFERENCES "Workout"("id") ON DELETE CASCADE,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "bpm"       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "WorkoutHeartRateSample_workoutId_timestamp_idx"
  ON "WorkoutHeartRateSample" ("workoutId", "timestamp");

-- Extra per-session metrics pulled from the matched Fitbit/Google Health
-- exercise session and copied onto the workout row at sync time.
--   steps          — total steps recorded during the session (mostly cardio)
--   activeZoneMin  — Fitbit's HR-zone-weighted intensity score
-- FitbitExerciseSession also gets activeZoneMin and distanceMm so the cache
-- can hand these to sync-hr without re-fetching Google Health.

ALTER TABLE "Workout"
  ADD COLUMN IF NOT EXISTS "steps" INTEGER,
  ADD COLUMN IF NOT EXISTS "activeZoneMin" INTEGER;

ALTER TABLE "FitbitExerciseSession"
  ADD COLUMN IF NOT EXISTS "activeZoneMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "distanceMm" INTEGER;

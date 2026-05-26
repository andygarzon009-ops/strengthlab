-- Coach-prescribed warmup routine attached to each workout.
-- Shape: { "items": [{ "kind": "...", "name": "...", "durationSec": N | "reps": N, "instructions": "..." }] }
-- Stored as jsonb so we can query/index later if we ever need to.

ALTER TABLE "Workout"
  ADD COLUMN IF NOT EXISTS "warmup" JSONB;

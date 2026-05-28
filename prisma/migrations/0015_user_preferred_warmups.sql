-- Per-user warmup preferences, keyed by strength split.
-- Shape: { "PUSH": [{ "kind": "...", "name": "...", "durationSec": N | "reps": N, "instructions": "..." }], "PULL": [...], ... }
-- The AI coach reads this when prescribing a session whose split matches a key
-- and injects the athlete's preferred warm-up instead of inventing one.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "preferredWarmups" JSONB;

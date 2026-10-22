-- Between-set heart-rate recovery (lib/hrRecovery.ts): median bpm drop 60 s
-- into rest after a hard set, and how many clean rests it's measured from.
-- Computed when a workout's HR syncs; null when there weren't enough rests.
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "hrRecoveryBpm" INTEGER;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "hrRecoveryRests" INTEGER;

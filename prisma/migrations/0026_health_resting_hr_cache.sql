-- Persist last-known resting HR on the health account so the feed can read it
-- instantly instead of waiting on a live Google Health call. Additive + idempotent.

ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "restingHr" INTEGER;
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "restingDelta" INTEGER;
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "restingSource" TEXT;
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "restingHrAt" TIMESTAMP(3);

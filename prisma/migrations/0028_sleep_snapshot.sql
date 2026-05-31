-- Last night's sleep snapshot on the health account (recovery Phase 2).
-- Additive + idempotent.

ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "sleepSummary" JSONB;
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "sleepNightKey" TEXT;

-- Recovery snapshot fields on the health account (HRV + RHR based; sleep later).
-- Additive + idempotent.

ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "restingBaselineHr" INTEGER;
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "recoveryScore" INTEGER;
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "recoveryBand" TEXT;
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "hrvMs" DOUBLE PRECISION;
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "hrvBaselineMs" DOUBLE PRECISION;
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "recoveryAt" TIMESTAMP(3);

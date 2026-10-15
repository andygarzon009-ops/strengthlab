-- Readiness breakdown: the per-factor contributions behind recoveryScore
-- (sleep, HRV, resting HR, plus skin-temp / breathing / training-load
-- deductions). JSON so new factors don't need another migration.
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "readinessFactors" JSONB;

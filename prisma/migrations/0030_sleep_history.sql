-- 30-night sleep history for the weekly/monthly sleep chart. Additive.
ALTER TABLE "HealthAccount" ADD COLUMN IF NOT EXISTS "sleepHistory" JSONB;

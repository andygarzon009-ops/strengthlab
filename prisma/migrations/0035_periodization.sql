-- Block periodization config for the AI coach: the athlete's declared cycle
-- (block order + length), when it started, and the deload cadence. Stored as
-- JSON so the block list stays free-form; shape is PeriodizationConfig in
-- lib/periodization.ts.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "periodization" JSONB;

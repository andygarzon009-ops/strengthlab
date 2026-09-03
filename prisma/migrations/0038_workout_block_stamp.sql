-- Stamp each logged session with where it sat in the training cycle.
--
-- The block/week used to exist only as a computation off the athlete's start
-- date, which meant (a) history couldn't say which block a session belonged to
-- and (b) editing the cycle silently rewrote the past. These columns freeze it
-- at log time. Nullable and backfill-free: sessions logged before this, and
-- sessions logged with no cycle configured, simply carry no block.
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "blockName" TEXT;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "blockWeek" INTEGER;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "blockWeeks" INTEGER;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "blockCycleWeek" INTEGER;

-- Per-user daily activity ring goals used by the stats-page Activity card.
-- Move = kcal target; Exercise = active-minute target. Sessions count
-- against trainingDays / 7 implicitly elsewhere, so no column for it.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "moveGoalKcal" INTEGER,
  ADD COLUMN IF NOT EXISTS "exerciseGoalMin" INTEGER;

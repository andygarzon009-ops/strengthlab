-- The coach's one-or-two-sentence take on a logged session, for the Today
-- card once it's done. Written on first ask (lib/workoutSummary.ts) and
-- cleared when the workout is edited so it never describes old sets.
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "coachSummary" TEXT;

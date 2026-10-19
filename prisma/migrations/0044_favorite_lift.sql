-- The lift an athlete picks to show off on their crew profile. Stored as the
-- exercise name (matched through normalizeExerciseName, like Top lifts), so
-- duplicate exercise rows for the same movement all count toward it.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "favoriteLift" TEXT;

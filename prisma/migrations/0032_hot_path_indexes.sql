-- Hot-path indexes. Additive + idempotent. These foreign keys and the
-- (userId, date) access pattern back the feed, crew, profile, workout-detail
-- and challenge queries — none of them were indexed, so Postgres was doing
-- sequential scans that get slower as the data grows.

-- Workout: filtered by userId + date window, ordered by date, everywhere.
CREATE INDEX IF NOT EXISTS "Workout_userId_date_idx"
    ON "Workout" ("userId", "date");

-- WorkoutExercise: loaded via `include: { exercises }` (WHERE workoutId IN ...)
-- and joined by exerciseId on the strength pages.
CREATE INDEX IF NOT EXISTS "WorkoutExercise_workoutId_idx"
    ON "WorkoutExercise" ("workoutId");
CREATE INDEX IF NOT EXISTS "WorkoutExercise_exerciseId_idx"
    ON "WorkoutExercise" ("exerciseId");

-- Set: loaded via `include: { sets }` (WHERE workoutExerciseId IN ...).
CREATE INDEX IF NOT EXISTS "Set_workoutExerciseId_idx"
    ON "Set" ("workoutExerciseId");

-- PersonalRecord: crew highlights filter userId + date; workout detail filters
-- workoutId.
CREATE INDEX IF NOT EXISTS "PersonalRecord_userId_date_idx"
    ON "PersonalRecord" ("userId", "date");
CREATE INDEX IF NOT EXISTS "PersonalRecord_workoutId_idx"
    ON "PersonalRecord" ("workoutId");

-- Comment: loaded via `include: { comments }` (WHERE workoutId IN ...).
CREATE INDEX IF NOT EXISTS "Comment_workoutId_idx"
    ON "Comment" ("workoutId");

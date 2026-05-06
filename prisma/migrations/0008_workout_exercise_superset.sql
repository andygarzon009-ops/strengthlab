-- Add a nullable supersetGroup tag to WorkoutExercise so exercises in a
-- session can be paired into supersets. Two exercises sharing the same
-- non-null value are treated as one superset; null means standalone.
ALTER TABLE "WorkoutExercise"
  ADD COLUMN "supersetGroup" TEXT;

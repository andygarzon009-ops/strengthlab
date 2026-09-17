-- Freeze the lifts an invite was sent about.
--
-- The joiner's "use their plan" was reading the caller's live WorkoutDraft, so
-- a joiner arriving after the caller had saved and cleared it got nothing —
-- the invite named "Weighted Pull-Up, Lat Pulldown" and the log opened empty.
-- An invite names a workout, so the workout has to outlive the draft that
-- named it.
ALTER TABLE "TrainingSession" ADD COLUMN IF NOT EXISTS "plan" JSONB;

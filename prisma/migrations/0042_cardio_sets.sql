-- Cardio and conditioning as exercise cards inside a lifting session.
--
-- A cardio row is a Set of type CARDIO whose numbers (time, km, level,
-- floors, rounds, work/rest...) live in this JSON column. weight/reps stay
-- NULL on those rows, so every existing strength stat keeps ignoring them.
ALTER TABLE "Set" ADD COLUMN IF NOT EXISTS "metrics" JSONB;

-- Battle ropes were filed under Shoulders; they're conditioning.
UPDATE "Exercise"
SET "muscleGroup" = 'Conditioning', "splits" = 'CARDIO'
WHERE "ownerId" IS NULL AND lower("name") = 'battle ropes';

-- Seed the built-in cardio / conditioning exercises now, rather than waiting
-- for someone to visit the page that runs the default sync — the logger's
-- picker reads straight from this table.
INSERT INTO "Exercise" ("id", "name", "muscleGroup", "splits", "isCustom", "ownerId")
SELECT 'cardio_' || substr(md5(v.name), 1, 20), v.name, v.grp, 'CARDIO', false, NULL
FROM (VALUES
  ('Stair Climber', 'Cardio'),
  ('Treadmill Run', 'Cardio'),
  ('Treadmill Incline Walk', 'Cardio'),
  ('Stationary Bike', 'Cardio'),
  ('Spin Bike', 'Cardio'),
  ('Recumbent Bike', 'Cardio'),
  ('Air Bike', 'Cardio'),
  ('Rowing Machine', 'Cardio'),
  ('SkiErg', 'Cardio'),
  ('Elliptical', 'Cardio'),
  ('Arc Trainer', 'Cardio'),
  ('Jacob''s Ladder', 'Cardio'),
  ('VersaClimber', 'Cardio'),
  ('Outdoor Run', 'Cardio'),
  ('Outdoor Walk', 'Cardio'),
  ('Hike', 'Cardio'),
  ('Outdoor Cycling', 'Cardio'),
  ('Swimming', 'Cardio'),
  ('Jump Rope', 'Cardio'),
  ('HIIT Circuit', 'Conditioning'),
  ('Tabata', 'Conditioning'),
  ('EMOM', 'Conditioning'),
  ('AMRAP', 'Conditioning'),
  ('Circuit Training', 'Conditioning'),
  ('Battle Ropes', 'Conditioning'),
  ('Sprint Intervals', 'Conditioning'),
  ('Bike Sprints', 'Conditioning'),
  ('Rowing Intervals', 'Conditioning'),
  ('Boxing Rounds', 'Conditioning'),
  ('Kettlebell Circuit', 'Conditioning')
) AS v(name, grp)
WHERE NOT EXISTS (
  SELECT 1 FROM "Exercise" e
  WHERE e."ownerId" IS NULL AND lower(e."name") = lower(v.name)
);

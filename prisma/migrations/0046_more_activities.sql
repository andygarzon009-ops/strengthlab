-- More activities for the exercise picker: outdoor, water and snow,
-- sports and combat, mind and body, plus a flat treadmill walk. Data only —
-- logged as cardio cards (time / distance / calories), like the hike.
INSERT INTO "Exercise" ("id", "name", "muscleGroup", "splits", "isCustom", "ownerId")
SELECT 'cardio_' || substr(md5(v.name), 1, 20), v.name, v.grp, 'CARDIO', false, NULL
FROM (VALUES
  ('Trail Run', 'Cardio'),
  ('Mountain Biking', 'Cardio'),
  ('Rucking', 'Cardio'),
  ('Open Water Swim', 'Cardio'),
  ('Kayaking', 'Cardio'),
  ('Stand-Up Paddleboarding', 'Cardio'),
  ('Downhill Skiing', 'Cardio'),
  ('Snowboarding', 'Cardio'),
  ('Cross-Country Skiing', 'Cardio'),
  ('Snowshoeing', 'Cardio'),
  ('Inline Skating', 'Cardio'),
  ('Ice Skating', 'Cardio'),
  ('Surfing', 'Cardio'),
  ('Rock Climbing', 'Cardio'),
  ('Golf', 'Cardio'),
  ('Basketball', 'Cardio'),
  ('Soccer', 'Cardio'),
  ('Tennis', 'Cardio'),
  ('Pickleball', 'Cardio'),
  ('Squash', 'Cardio'),
  ('Badminton', 'Cardio'),
  ('Volleyball', 'Cardio'),
  ('Hockey', 'Cardio'),
  ('Flag Football', 'Cardio'),
  ('Baseball / Softball', 'Cardio'),
  ('Ultimate Frisbee', 'Cardio'),
  ('Brazilian Jiu-Jitsu', 'Cardio'),
  ('Muay Thai', 'Cardio'),
  ('Martial Arts', 'Cardio'),
  ('Wrestling', 'Cardio'),
  ('Yoga', 'Cardio'),
  ('Hot Yoga', 'Cardio'),
  ('Pilates', 'Cardio'),
  ('Barre', 'Cardio'),
  ('Stretching', 'Cardio'),
  ('Mobility Flow', 'Cardio'),
  ('Dance', 'Cardio'),
  ('Bouldering', 'Cardio'),
  ('Treadmill Walk', 'Cardio')
) AS v(name, grp)
WHERE NOT EXISTS (
  SELECT 1 FROM "Exercise" e
  WHERE e."ownerId" IS NULL AND lower(e."name") = lower(v.name)
);

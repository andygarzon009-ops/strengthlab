-- Repair Exercise.muscleGroup rows that were left mis-tagged by an old
-- seed (and any user-created customs with the wrong group). Each UPDATE
-- below is a name-pattern → correct muscleGroup mapping. We only touch
-- rows whose current value is wrong to keep the diff small and avoid
-- thrashing customs that were intentionally bucketed elsewhere.

-- Hamstrings: every "leg curl" variant (lying / seated / standing /
-- plate-loaded / machine / nordic) — these are pure hamstring lifts.
UPDATE "Exercise"
SET "muscleGroup" = 'Hamstrings'
WHERE name ILIKE '%leg curl%' AND "muscleGroup" IS DISTINCT FROM 'Hamstrings';
UPDATE "Exercise"
SET "muscleGroup" = 'Hamstrings'
WHERE name ILIKE 'nordic%' AND "muscleGroup" IS DISTINCT FROM 'Hamstrings';

-- Quads
UPDATE "Exercise"
SET "muscleGroup" = 'Quads'
WHERE name ILIKE '%leg extension%' AND "muscleGroup" IS DISTINCT FROM 'Quads';
UPDATE "Exercise"
SET "muscleGroup" = 'Quads'
WHERE (name ILIKE '%hack squat%' OR name ILIKE '%sissy squat%' OR name ILIKE '%pendulum squat%' OR name ILIKE '%v-squat%')
  AND "muscleGroup" IS DISTINCT FROM 'Quads';
UPDATE "Exercise"
SET "muscleGroup" = 'Quads'
WHERE name ILIKE '%leg press%' AND "muscleGroup" IS DISTINCT FROM 'Quads';

-- Glutes
UPDATE "Exercise"
SET "muscleGroup" = 'Glutes'
WHERE (name ILIKE '%hip thrust%' OR name ILIKE '%glute bridge%' OR name ILIKE '%glute kickback%' OR name ILIKE '%hip extension%' OR name ILIKE '%pull-through%')
  AND "muscleGroup" IS DISTINCT FROM 'Glutes';

-- Calves
UPDATE "Exercise"
SET "muscleGroup" = 'Calves'
WHERE (name ILIKE '%calf raise%' OR name ILIKE '%calf press%' OR name ILIKE 'standing calf%' OR name ILIKE 'seated calf%' OR name ILIKE 'donkey calf%')
  AND "muscleGroup" IS DISTINCT FROM 'Calves';

-- Triceps
UPDATE "Exercise"
SET "muscleGroup" = 'Triceps'
WHERE (name ILIKE '%tricep%' OR name ILIKE '%pushdown%' OR name ILIKE '%skullcrusher%' OR name ILIKE '%jm press%' OR name ILIKE '%close-grip bench%' OR name ILIKE '%close grip bench%' OR name ILIKE '%tate press%')
  AND "muscleGroup" IS DISTINCT FROM 'Triceps';

-- Biceps (but NOT leg curls or wrist curls — those have their own rules
-- above and below). Match curl-pattern lifts that aren't legs/forearms.
UPDATE "Exercise"
SET "muscleGroup" = 'Biceps'
WHERE name ILIKE '%curl%'
  AND name NOT ILIKE '%leg curl%'
  AND name NOT ILIKE '%wrist curl%'
  AND name NOT ILIKE '%nordic%'
  AND name NOT ILIKE '%jefferson%'
  AND "muscleGroup" IS DISTINCT FROM 'Biceps';

-- Forearms
UPDATE "Exercise"
SET "muscleGroup" = 'Forearms'
WHERE (name ILIKE '%wrist curl%' OR name ILIKE '%farmer carry%' OR name ILIKE '%plate pinch%')
  AND "muscleGroup" IS DISTINCT FROM 'Forearms';

-- Shoulders
UPDATE "Exercise"
SET "muscleGroup" = 'Shoulders'
WHERE (name ILIKE '%lateral raise%' OR name ILIKE '%front raise%' OR name ILIKE '%rear delt%' OR name ILIKE '%face pull%' OR name ILIKE '%reverse fly%' OR name ILIKE '%shoulder press%' OR name ILIKE '%overhead press%' OR name ILIKE '%arnold press%' OR name ILIKE '%military press%' OR name ILIKE '%push press%')
  AND "muscleGroup" IS DISTINCT FROM 'Shoulders';

-- Chest
UPDATE "Exercise"
SET "muscleGroup" = 'Chest'
WHERE (name ILIKE '%bench press%' OR name ILIKE '%chest press%' OR name ILIKE '%chest fly%' OR name ILIKE '%pec deck%' OR name ILIKE '%cable crossover%' OR name ILIKE '%dumbbell fly%' OR name ILIKE 'fly %' OR name ILIKE '%floor press%' OR name ILIKE '%push-up%' OR name ILIKE '%pushup%' OR name ILIKE '%dip%')
  AND name NOT ILIKE '%close-grip bench%'
  AND name NOT ILIKE '%close grip bench%'
  AND "muscleGroup" IS DISTINCT FROM 'Chest';

-- Back
UPDATE "Exercise"
SET "muscleGroup" = 'Back'
WHERE (name ILIKE '%pull-up%' OR name ILIKE '%pullup%' OR name ILIKE '%chin-up%' OR name ILIKE '%chinup%' OR name ILIKE '%pulldown%' OR name ILIKE '%lat pull%' OR name ILIKE '%pullover%' OR name ILIKE '%row%' OR name ILIKE '%shrug%')
  AND "muscleGroup" IS DISTINCT FROM 'Back';

-- Lower Back
UPDATE "Exercise"
SET "muscleGroup" = 'Lower Back'
WHERE (name ILIKE '%back extension%' OR name ILIKE '%hyperextension%' OR name ILIKE '%good morning%' OR name ILIKE '%reverse hyper%')
  AND name NOT ILIKE '%glute-focus%'
  AND name NOT ILIKE '%glute focused%'
  AND "muscleGroup" IS DISTINCT FROM 'Lower Back';

-- Hamstrings (deadlift family — matches the seed's primary tagging).
UPDATE "Exercise"
SET "muscleGroup" = 'Hamstrings'
WHERE (name ILIKE '%romanian deadlift%' OR name ILIKE '%rdl%' OR name ILIKE '%stiff-leg deadlift%' OR name ILIKE '%stiff leg deadlift%' OR name ILIKE '%jefferson curl%')
  AND "muscleGroup" IS DISTINCT FROM 'Hamstrings';

-- Core
UPDATE "Exercise"
SET "muscleGroup" = 'Core'
WHERE (name ILIKE '%plank%' OR name ILIKE '%crunch%' OR name ILIKE '%sit-up%' OR name ILIKE '%situp%' OR name ILIKE '%leg raise%' OR name ILIKE '%knee raise%' OR name ILIKE '%ab wheel%' OR name ILIKE '%dead bug%' OR name ILIKE '%v-up%' OR name ILIKE '%toes-to-bar%' OR name ILIKE '%l-sit%' OR name ILIKE '%dragon flag%' OR name ILIKE '%mountain climber%' OR name ILIKE '%hollow hold%' OR name ILIKE '%woodchop%' OR name ILIKE '%pallof%' OR name ILIKE '%russian twist%')
  AND "muscleGroup" IS DISTINCT FROM 'Core';

-- Indoor cardio machine settings: treadmill incline (%) + speed (km/h),
-- and a generic resistance/intensity level for bike / elliptical / stair.
-- All nullable — existing rows are untouched.
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "incline" DOUBLE PRECISION;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "speed" DOUBLE PRECISION;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "level" INTEGER;

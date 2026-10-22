-- Fuel settings beyond dietary restrictions: cooking time, skill, equipment,
-- meal prep, cuisines, proteins, spice and budget. Shape is MealPrefs in
-- lib/mealPrefs.ts. Read by recipe suggestions and the coach.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mealPrefs" JSONB;

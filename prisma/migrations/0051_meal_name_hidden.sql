-- Swiping a past meal away hides it from "Log a past meal" and Next meal's
-- pills. hiddenAt, not a flag: the meal comes back once it's eaten again
-- after this time. The food log itself is never touched. A row that only
-- hides a meal has an empty title.
ALTER TABLE "MealName" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);

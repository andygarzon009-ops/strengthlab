-- Rest days picked on the profile: weekday indexes, 0 = Monday … 6 = Sunday.
-- The feed's Today card shows a rest day on these instead of the next split.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "restDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

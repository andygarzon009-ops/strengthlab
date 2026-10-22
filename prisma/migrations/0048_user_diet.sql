-- Dietary restrictions from the profile: preset chips plus free-text notes
-- (foods avoided or disliked). Read by recipe suggestions and the coach.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dietRestrictions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dietNotes" TEXT;

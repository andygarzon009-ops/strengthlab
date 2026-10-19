-- StrengthLab's own food log: meals logged in-app (photo or description,
-- estimated by Gemini, confirmed by the athlete). Feeds the Fuel score
-- alongside anything Google Health reports. localDate is the athlete's civil
-- day, so a late dinner never lands on tomorrow in UTC.
CREATE TABLE IF NOT EXISTS "FoodLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "localDate" TEXT NOT NULL,
  "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meal" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "portion" TEXT,
  "kcal" DOUBLE PRECISION NOT NULL,
  "proteinG" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "carbsG" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fatG" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fiberG" DOUBLE PRECISION,
  "photoUrl" TEXT,
  "source" TEXT NOT NULL DEFAULT 'photo',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FoodLog_userId_localDate_idx" ON "FoodLog"("userId", "localDate");

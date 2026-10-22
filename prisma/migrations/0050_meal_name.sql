-- A name the athlete gave a past meal (a set of foods logged together), e.g.
-- "Usual breakfast" instead of "Fried egg toast +3". Keyed by the meal's
-- food signature (sorted lowercase food names joined by "|").
CREATE TABLE IF NOT EXISTS "MealName" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sig" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MealName_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MealName_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MealName_userId_sig_key" ON "MealName"("userId", "sig");

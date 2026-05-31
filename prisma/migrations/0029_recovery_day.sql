-- Daily recovery history for the 7-day trend. Additive + idempotent.

CREATE TABLE IF NOT EXISTS "RecoveryDay" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "dateKey"   TEXT NOT NULL,
    "score"     INTEGER NOT NULL,
    "band"      TEXT,
    "sleepMin"  INTEGER,
    "hrvMs"     DOUBLE PRECISION,
    "restingHr" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryDay_userId_dateKey_key"
    ON "RecoveryDay" ("userId", "dateKey");
CREATE INDEX IF NOT EXISTS "RecoveryDay_userId_dateKey_idx"
    ON "RecoveryDay" ("userId", "dateKey");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'RecoveryDay_userId_fkey'
    ) THEN
        ALTER TABLE "RecoveryDay"
            ADD CONSTRAINT "RecoveryDay_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

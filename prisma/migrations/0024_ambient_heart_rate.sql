-- Standalone ambient heart-rate samples ingested from the StrengthLab Android
-- app (Health Connect). Additive + idempotent — safe to run while the app is live.

CREATE TABLE IF NOT EXISTS "AmbientHeartRateSample" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "bpm"       INTEGER NOT NULL,
    "sourceApp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbientHeartRateSample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AmbientHeartRateSample_userId_timestamp_key"
    ON "AmbientHeartRateSample" ("userId", "timestamp");

CREATE INDEX IF NOT EXISTS "AmbientHeartRateSample_userId_timestamp_idx"
    ON "AmbientHeartRateSample" ("userId", "timestamp");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'AmbientHeartRateSample_userId_fkey'
    ) THEN
        ALTER TABLE "AmbientHeartRateSample"
            ADD CONSTRAINT "AmbientHeartRateSample_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

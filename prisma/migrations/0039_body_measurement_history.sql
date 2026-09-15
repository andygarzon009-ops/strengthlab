-- Dated history for tape measurements.
--
-- The User.* measurement columns hold only the latest values and are
-- overwritten on every profile save, so each update destroyed the reading
-- before it. Nothing could answer "is the waist coming down?", which is the
-- only question a measurement is taken to answer.
--
-- One row per save that changes something, carrying the full set of values
-- rather than a diff, so a comparison across any window is one subtraction.
-- Additive and idempotent; RLS is enabled automatically by the event trigger
-- from 0005.

CREATE TABLE IF NOT EXISTS "BodyMeasurement" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "takenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bodyweight" DOUBLE PRECISION,
    "height"     DOUBLE PRECISION,
    "neck"       DOUBLE PRECISION,
    "shoulders"  DOUBLE PRECISION,
    "chest"      DOUBLE PRECISION,
    "arm"        DOUBLE PRECISION,
    "forearm"    DOUBLE PRECISION,
    "waist"      DOUBLE PRECISION,
    "hips"       DOUBLE PRECISION,
    "thigh"      DOUBLE PRECISION,
    "calf"       DOUBLE PRECISION,
    "bodyFat"    DOUBLE PRECISION,

    CONSTRAINT "BodyMeasurement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BodyMeasurement_userId_takenAt_idx"
    ON "BodyMeasurement" ("userId", "takenAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BodyMeasurement_userId_fkey'
    ) THEN
        ALTER TABLE "BodyMeasurement"
            ADD CONSTRAINT "BodyMeasurement_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Seed one baseline row per athlete who already has measurements on file, so
-- the very next save produces a comparison instead of starting from nothing.
-- Dated User.updatedAt: it isn't when the tape was actually read, but it's the
-- last moment the values are known to have been true, and it's the only date
-- that exists. Guarded so re-running never double-seeds.
INSERT INTO "BodyMeasurement" (
    "id", "userId", "takenAt", "bodyweight", "height", "neck", "shoulders",
    "chest", "arm", "forearm", "waist", "hips", "thigh", "calf", "bodyFat"
)
SELECT
    'seed_' || u."id", u."id", u."updatedAt", u."bodyweight", u."height",
    u."neck", u."shoulders", u."chest", u."arm", u."forearm", u."waist",
    u."hips", u."thigh", u."calf", u."bodyFat"
FROM "User" u
WHERE COALESCE(
        u."neck", u."shoulders", u."chest", u."arm", u."forearm",
        u."waist", u."hips", u."thigh", u."calf", u."bodyFat"
      ) IS NOT NULL
  AND NOT EXISTS (
        SELECT 1 FROM "BodyMeasurement" m WHERE m."userId" = u."id"
      );

-- Joint sessions: two or more athletes training together, one log each.
--
-- Deliberately NOT a shared Workout row. Partners lift different loads, and
-- every per-athlete number in the app comes off that athlete's own Workout and
-- Set rows — PRs, volume, projections, block progression, fuel score. Sharing
-- one row would corrupt all of them. These tables link independent logs; what
-- syncs between the athletes is the plan and the presence, never the data.
--
-- Additive and idempotent. RLS is enabled automatically by the 0005 trigger.

CREATE TABLE IF NOT EXISTS "TrainingSession" (
    "id"          TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"     TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrainingSession_createdById_startedAt_idx"
    ON "TrainingSession" ("createdById", "startedAt");

CREATE TABLE IF NOT EXISTS "SessionMember" (
    "id"          TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'INVITED',
    "workoutId"   TEXT,
    "invitedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "SessionMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SessionMember_sessionId_userId_key"
    ON "SessionMember" ("sessionId", "userId");

CREATE INDEX IF NOT EXISTS "SessionMember_userId_status_idx"
    ON "SessionMember" ("userId", "status");

-- Which joint session a log belongs to. Null for a solo session, which is
-- nearly all of them. ON DELETE SET NULL: unlinking a session must never take
-- an athlete's logged workout with it.
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

CREATE INDEX IF NOT EXISTS "Workout_sessionId_idx" ON "Workout" ("sessionId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'TrainingSession_createdById_fkey'
    ) THEN
        ALTER TABLE "TrainingSession"
            ADD CONSTRAINT "TrainingSession_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'SessionMember_sessionId_fkey'
    ) THEN
        ALTER TABLE "SessionMember"
            ADD CONSTRAINT "SessionMember_sessionId_fkey"
            FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'SessionMember_userId_fkey'
    ) THEN
        ALTER TABLE "SessionMember"
            ADD CONSTRAINT "SessionMember_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Workout_sessionId_fkey'
    ) THEN
        ALTER TABLE "Workout"
            ADD CONSTRAINT "Workout_sessionId_fkey"
            FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

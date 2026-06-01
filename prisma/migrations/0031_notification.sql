-- Persistent in-app notifications (the inbox). Additive + idempotent.
-- Backs the /notifications page so an accepted crew request is recorded even
-- if the Web Push is missed or push was never enabled.

CREATE TABLE IF NOT EXISTS "Notification" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "actorId"   TEXT,
    "body"      TEXT NOT NULL,
    "url"       TEXT,
    "read"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx"
    ON "Notification" ("userId", "read");

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
    ON "Notification" ("userId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Notification_userId_fkey'
    ) THEN
        ALTER TABLE "Notification"
            ADD CONSTRAINT "Notification_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Notification_actorId_fkey'
    ) THEN
        ALTER TABLE "Notification"
            ADD CONSTRAINT "Notification_actorId_fkey"
            FOREIGN KEY ("actorId") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Per-user opt-out for the inactivity nudge, plus the timestamp that rate
-- limits it to one a week. Defaults to TRUE so it's on for everyone including
-- existing rows, matching notifyFriendWorkouts. Additive + idempotent.

ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "notifyInactivity" BOOLEAN NOT NULL DEFAULT true;

-- Nullable: a user who has never been nudged has no timestamp, and the
-- eligibility check treats NULL as "never", not as "just now".
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "lastNudgedAt" TIMESTAMP(3);

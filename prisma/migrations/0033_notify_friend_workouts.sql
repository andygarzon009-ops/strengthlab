-- Per-user preference: get notified when a crew friend logs a workout.
-- Defaults to TRUE so it's automatically on for everyone (existing rows too),
-- with an opt-out toggle in the profile section. Additive + idempotent.

ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "notifyFriendWorkouts" BOOLEAN NOT NULL DEFAULT true;

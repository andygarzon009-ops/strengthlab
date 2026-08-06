-- End of the rest period an athlete is currently timing, if any.
--
-- A rest-end push is queued with QStash at the moment rest starts and
-- delivered by an HTTP callback later, which is what lets it reach a locked
-- phone. The callback carries the end time it was scheduled for and only
-- fires if it still matches this column, so a rest that was superseded
-- (another set logged mid-rest) or skipped can't announce itself over the
-- one actually running.
--
-- Nullable: NULL means no rest is being timed. Additive + idempotent.

ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "restEndsAt" TIMESTAMP(3);

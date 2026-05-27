-- Per-set timestamp captured when the user marks a set complete in the
-- logger. Used to overlay set markers on the workout's heart-rate chart and
-- to correlate effort spikes with specific lifts.

ALTER TABLE "Set"
  ADD COLUMN IF NOT EXISTS "loggedAt" TIMESTAMP(3);

-- Add per-user timezone for accurate "today" math in the AI coach.
-- Captured silently from the browser's Intl API; nullable while the
-- column backfills.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT;

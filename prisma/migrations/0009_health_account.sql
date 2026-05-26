-- Google Health API OAuth tokens per user.
-- Google's Health API proxies Fitbit data, so this single account covers both.
-- Tokens are sensitive; the auto-enable-rls event trigger (0005) will lock
-- this table down by default, and our app reads it via the server-side
-- Prisma client only.

CREATE TABLE IF NOT EXISTS "HealthAccount" (
  "id"           TEXT PRIMARY KEY,
  "userId"       TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "provider"     TEXT NOT NULL DEFAULT 'google_health',
  "accessToken"  TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "scope"        TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

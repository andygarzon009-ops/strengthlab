#!/bin/bash
# Run after setting TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your environment
# Usage: TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... bash scripts/migrate-turso.sh

if [ -z "$TURSO_DATABASE_URL" ] || [ -z "$TURSO_AUTH_TOKEN" ]; then
  echo "❌ Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first"
  exit 1
fi

echo "Running migrations against Turso cloud database..."
npx prisma migrate deploy
echo "✅ Done"

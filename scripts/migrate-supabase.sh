#!/bin/bash
# Run this once after setting DATABASE_URL in your .env file
# to create all tables in your Supabase database.
#
# Usage:
#   1. Paste your Supabase DATABASE_URL into .env
#   2. Run: bash scripts/migrate-supabase.sh

echo "Applying StrengthLab schema to Supabase..."
psql "$DATABASE_URL" -f prisma/migrations/0001_init.sql
echo "✅ All tables created."

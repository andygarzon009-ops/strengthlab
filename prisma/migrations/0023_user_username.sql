-- Unique handle for in-app friend search. Nullable so existing users keep
-- working until they set one; the unique index ignores NULLs in Postgres.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

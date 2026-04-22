import { PrismaClient } from "@/app/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  // Cloud: set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in env
  // Local dev: falls back to SQLite file
  const url =
    process.env.TURSO_DATABASE_URL ??
    `file:${path.join(process.cwd(), "prisma", "dev.db")}`;

  const authToken = process.env.TURSO_AUTH_TOKEN;

  const adapter = new PrismaLibSql(
    authToken ? { url, authToken } : { url }
  );

  return new PrismaClient({ adapter } as any);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

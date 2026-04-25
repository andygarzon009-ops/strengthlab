import "dotenv/config";
import { writeFileSync } from "fs";
import { prisma } from "../lib/db";

async function main() {
  const log: string[] = [];
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS exercise_builtin_name_key ON "Exercise" (name) WHERE "ownerId" IS NULL;`
    );
    log.push("builtin index OK");
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS exercise_owner_name_key ON "Exercise" ("ownerId", name) WHERE "ownerId" IS NOT NULL;`
    );
    log.push("owner index OK");
  } catch (e) {
    log.push("ERR: " + (e as Error).message + "\n" + (e as Error).stack);
  }
  writeFileSync("/tmp/idx.log", log.join("\n"));
  await prisma.$disconnect();
}
main().catch((e) => {
  writeFileSync("/tmp/idx.log", "FATAL: " + (e as Error).message);
  process.exit(1);
});

import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "../app/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-migration.mjs <path.sql>");
  process.exit(1);
}

const adapter = new PrismaPg(process.env.DATABASE_URL, { schema: "public" });
const prisma = new PrismaClient({ adapter });

const sql = fs.readFileSync(file, "utf8");
// Strip SQL comments, then split on `;`.
const cleaned = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const stmts = cleaned
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Applying ${stmts.length} statement(s) from ${file}`);

for (const s of stmts) {
  const preview = s.split("\n").find((l) => l.trim()) ?? "";
  try {
    await prisma.$executeRawUnsafe(s);
    console.log("OK:", preview.slice(0, 80));
  } catch (e) {
    console.log("ERR:", preview.slice(0, 80), "-", e.message.split("\n")[0]);
  }
}
await prisma.$disconnect();

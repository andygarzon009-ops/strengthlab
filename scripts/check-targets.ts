import "dotenv/config";
import { writeFileSync } from "fs";
import { prisma } from "../lib/db";

const NAMES = [
  "Adductor Machine (Pin)",
  "Glute-Focused Back Extension",
  "Standing Leg Curl",
  "Lat Pulldown",
  "Chest-Supported Row",
  "Cossack Squat",
  "Cable Kickback",
  "Smith Machine Bulgarian Split Squat",
  "Pull-Up",
];

async function main() {
  const r = await prisma.exercise.findMany({
    where: { name: { in: NAMES } },
    select: { id: true, name: true, isCustom: true },
  });
  const found = new Set(r.map((x) => x.name));
  const missing = NAMES.filter((n) => !found.has(n));
  writeFileSync(
    "/tmp/targets.json",
    JSON.stringify({ found: r, missing }, null, 2)
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import * as IdentityNS from "../lib/exerciseIdentity";

// tsx transpiles the lib module to CJS; named exports land under .default.
const Identity: typeof IdentityNS =
  (IdentityNS as unknown as { default?: typeof IdentityNS }).default ??
  IdentityNS;
const { canonicalExerciseKey, normalizeExerciseName } = Identity;

// Merge Exercise rows that resolve to the same lift identity once the
// implied-equipment alias table is applied — e.g. a coach-created custom
// "Flat Bench Press" folds into the built-in "Flat Barbell Bench Press", so
// history, PRs, goals and challenges roll back up onto one row.
//
// Safe by construction: rows cluster ONLY when they share a canonical key
// (an explicit alias synonym, or an identical normalized name). No fuzzy
// typo matching here. References are re-pointed before the redundant row is
// deleted, inside a transaction.
//
//   Dry run (default):  npx tsx scripts/merge-alias-duplicates.mts
//   Apply changes:      npx tsx scripts/merge-alias-duplicates.mts --apply

const APPLY = process.argv.includes("--apply");

const adapter = new PrismaPg(process.env.DATABASE_URL!, { schema: "public" });
const prisma = new PrismaClient({ adapter });

async function repointAndDelete(srcId: string, dstId: string) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workoutExercise.updateMany({
      where: { exerciseId: srcId },
      data: { exerciseId: dstId },
    });
    const pr = await tx.personalRecord.updateMany({
      where: { exerciseId: srcId },
      data: { exerciseId: dstId },
    });
    const go = await tx.goal.updateMany({
      where: { exerciseId: srcId },
      data: { exerciseId: dstId },
    });
    const ch = await tx.challenge.updateMany({
      where: { exerciseId: srcId },
      data: { exerciseId: dstId },
    });
    await tx.exercise.delete({ where: { id: srcId } });
    return { wo: wo.count, pr: pr.count, go: go.count, ch: ch.count };
  });
}

async function main() {
  const all = await prisma.exercise.findMany({
    select: { id: true, name: true, ownerId: true },
  });
  const refCount = new Map<string, number>();
  await Promise.all(
    all.map(async (e) => {
      refCount.set(
        e.id,
        await prisma.workoutExercise.count({ where: { exerciseId: e.id } })
      );
    })
  );

  // Cluster by canonical key.
  const clusters = new Map<string, typeof all>();
  for (const e of all) {
    const key = canonicalExerciseKey(e.name);
    if (!key) continue;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(e);
  }

  let merges = 0;
  for (const [key, rows] of clusters) {
    if (rows.length < 2) continue;

    // Only act on clusters the ALIAS table actually bridged — i.e. rows with
    // genuinely different normalized names ("barbellbenchpres" vs
    // "flatbarbellbenchpres"). Pure plural/hyphen variants share one
    // normalized form, are already treated as the same lift by
    // exerciseNamesMatch, and aren't splitting any stats — skip them so this
    // script only touches the real alias splits.
    const distinctNorms = new Set(rows.map((r) => normalizeExerciseName(r.name)));
    if (distinctNorms.size < 2) continue;

    // Keep target: prefer the built-in whose own normalized name IS the
    // canonical key (the real library row), else the most-referenced row.
    const canonicalBuiltIn = rows.find(
      (r) => r.ownerId === null && normalizeExerciseName(r.name) === key
    );
    const keep =
      canonicalBuiltIn ??
      [...rows].sort(
        (a, b) => (refCount.get(b.id) ?? 0) - (refCount.get(a.id) ?? 0)
      )[0];

    const sources = rows.filter((r) => r.id !== keep.id);
    console.log(
      `\n[${key}] keep "${keep.name}" (${keep.ownerId ? "custom" : "built-in"}, ${refCount.get(keep.id) ?? 0} logs)`
    );
    for (const src of sources) {
      console.log(
        `   ← merge "${src.name}" (${src.ownerId ? "custom" : "built-in"}, ${refCount.get(src.id) ?? 0} logs)`
      );
      if (APPLY) {
        const counts = await repointAndDelete(src.id, keep.id);
        console.log(`     repointed ${JSON.stringify(counts)}`);
      }
      merges++;
    }
  }

  console.log(
    `\n${APPLY ? "Applied" : "Dry run —"} ${merges} merge(s)${APPLY ? "." : " would happen. Re-run with --apply."}`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

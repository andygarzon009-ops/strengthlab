// Past sessions of "the same workout" with a recovery figure, for the
// comparison under a logged workout's HR chart and for the coach. Titles drift
// ("Pull Day Weighted Pull Up Focused" one week, something close the next) and
// one split can hold very different days (a heavy squat day and a glute day
// are both Legs), so sameness is the exercises: at least half of the lifts in
// common. Deloads only compare with deloads.
import { prisma } from "@/lib/db";
import { isDeloadSession } from "@/lib/hrRecovery";

const MIN_OVERLAP = 0.5;
const KEEP = 6;

export type RecoveryPoint = { date: string; dropBpm: number };

function overlap(a: Set<string>, b: Set<string>): number {
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  const union = a.size + b.size - both;
  return union ? both / union : 0;
}

/// Up to six earlier matching sessions, oldest first.
export async function recoveryHistory(w: {
  id: string;
  userId: string;
  date: Date;
  title: string;
  isDeload: boolean;
  exerciseIds: string[];
}): Promise<RecoveryPoint[]> {
  const mine = new Set(w.exerciseIds);
  if (mine.size === 0) return [];
  const deload = isDeloadSession(w);
  const candidates = await prisma.workout.findMany({
    where: {
      userId: w.userId,
      type: "WEIGHT_TRAINING",
      id: { not: w.id },
      date: { lt: w.date },
      hrRecoveryBpm: { not: null },
    },
    orderBy: { date: "desc" },
    take: 60,
    select: {
      date: true,
      title: true,
      isDeload: true,
      hrRecoveryBpm: true,
      exercises: { select: { exerciseId: true } },
    },
  });
  const out: RecoveryPoint[] = [];
  for (const c of candidates) {
    if (isDeloadSession(c) !== deload) continue;
    if (overlap(mine, new Set(c.exercises.map((e) => e.exerciseId))) < MIN_OVERLAP) continue;
    out.push({ date: c.date.toISOString(), dropBpm: c.hrRecoveryBpm! });
    if (out.length === KEEP) break;
  }
  return out.reverse();
}

import "server-only";
import { prisma } from "@/lib/db";
import {
  MEASUREMENT_KEYS,
  type CheckIn,
  type MeasurementKey,
} from "@/lib/bodyMeasurements";

export type BodyHistory = {
  sex: string | null;
  phase: string | null;
  /// Oldest first.
  history: CheckIn[];
};

/// Every tape reading an athlete has, oldest first, plus what the pages need
/// to judge them. An athlete who filled the profile form before history rows
/// existed gets that one reading back as their baseline, dated to the last
/// profile edit — better than a body page that claims they've never measured.
export async function loadBodyHistory(userId: string): Promise<BodyHistory> {
  const fields = Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, true])) as Record<
    MeasurementKey,
    true
  >;
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { sex: true, trainingPhase: true, updatedAt: true, ...fields },
    }),
    prisma.bodyMeasurement.findMany({
      where: { userId },
      orderBy: { takenAt: "asc" },
      select: { takenAt: true, ...fields },
    }),
  ]);

  const toCheckIn = (r: Record<string, unknown>, takenAt: Date): CheckIn => ({
    takenAt: takenAt.toISOString(),
    values: Object.fromEntries(
      MEASUREMENT_KEYS.map((k) => [k, typeof r[k] === "number" ? (r[k] as number) : null]),
    ),
  });

  let history = rows.map((r) => toCheckIn(r, r.takenAt));
  if (history.length === 0 && user) {
    const baseline = toCheckIn(user, user.updatedAt);
    if (Object.values(baseline.values).some((v) => v !== null)) history = [baseline];
  }

  return { sex: user?.sex ?? null, phase: user?.trainingPhase ?? null, history };
}

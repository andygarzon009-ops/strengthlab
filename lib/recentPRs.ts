/// Weight PRs from the last 48 hours, for the feed's PR card: the new number,
/// the record it beat, and the lift's top-set trend so the jump reads in
/// context.

import { cache } from "react";
import { prisma } from "@/lib/db";

const WINDOW_MS = 48 * 60 * 60 * 1000;
const TREND_DAYS = 56;

export type RecentPR = {
  id: string;
  exercise: string;
  value: number;
  reps: number | null;
  date: Date;
  /// "today" / "yesterday", decided here rather than while rendering.
  when: "today" | "yesterday";
  workoutId: string | null;
  previous: { value: number; reps: number | null } | null;
  /// Top working-set weight per session, oldest first (up to 8).
  trend: number[];
};

export const loadRecentPRs = cache(async (userId: string): Promise<RecentPR[]> => {
  const prs = await prisma.personalRecord.findMany({
    where: {
      userId,
      type: "WEIGHT",
      date: { gte: new Date(Date.now() - WINDOW_MS) },
    },
    include: { exercise: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 5,
  });
  if (prs.length === 0) return [];

  return Promise.all(
    prs.map(async (pr) => {
      const [previous, sets] = await Promise.all([
        prisma.personalRecord.findFirst({
          where: {
            userId,
            type: "WEIGHT",
            exerciseId: pr.exerciseId,
            date: { lt: pr.date },
            NOT: { id: pr.id },
          },
          orderBy: { date: "desc" },
          select: { value: true, reps: true },
        }),
        prisma.set.findMany({
          where: {
            type: "WORKING",
            weight: { gt: 0 },
            workoutExercise: {
              exerciseId: pr.exerciseId,
              workout: {
                userId,
                date: { gte: new Date(Date.now() - TREND_DAYS * 86_400_000) },
              },
            },
          },
          select: {
            weight: true,
            workoutExercise: {
              select: { workout: { select: { id: true, date: true } } },
            },
          },
        }),
      ]);

      // Heaviest working set per session, oldest first.
      const bySession = new Map<string, { date: Date; top: number }>();
      for (const s of sets) {
        const w = s.workoutExercise.workout;
        const cur = bySession.get(w.id);
        if (!cur || (s.weight ?? 0) > cur.top) {
          bySession.set(w.id, { date: w.date, top: s.weight ?? 0 });
        }
      }
      const trend = [...bySession.values()]
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(-8)
        .map((x) => x.top);

      return {
        id: pr.id,
        exercise: pr.exercise.name,
        value: pr.value,
        reps: pr.reps,
        date: pr.date,
        when:
          Date.now() - pr.date.getTime() < 20 * 3_600_000
            ? ("today" as const)
            : ("yesterday" as const),
        workoutId: pr.workoutId,
        previous,
        trend,
      };
    }),
  );
});

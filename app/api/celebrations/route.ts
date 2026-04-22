import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { differenceInCalendarDays, format, subDays } from "date-fns";

export async function GET() {
  const userId = await requireAuth();

  const [workouts, latestPR] = await Promise.all([
    prisma.workout.findMany({
      where: { userId },
      select: { date: true },
      orderBy: { date: "desc" },
      take: 365,
    }),
    prisma.personalRecord.findFirst({
      where: { userId, type: "WEIGHT" },
      include: { exercise: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const dates = [
    ...new Set(workouts.map((w) => format(new Date(w.date), "yyyy-MM-dd"))),
  ].sort();

  let streakDays = 0;
  if (dates.length > 0) {
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const last = dates[dates.length - 1];
    if (last === today || last === yesterday) {
      streakDays = 1;
      for (let i = dates.length - 2; i >= 0; i--) {
        const diff = differenceInCalendarDays(
          new Date(dates[i + 1]),
          new Date(dates[i])
        );
        if (diff === 1) streakDays++;
        else break;
      }
    }
  }

  const pr = latestPR
    ? {
        id: latestPR.id,
        weight: latestPR.value,
        reps: latestPR.reps ?? 1,
        exerciseName: latestPR.exercise.name,
        daysOld: differenceInCalendarDays(new Date(), new Date(latestPR.date)),
      }
    : null;

  return Response.json({ streakDays, pr });
}

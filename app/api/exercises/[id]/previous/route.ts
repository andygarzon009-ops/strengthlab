import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id: exerciseId } = await params;

  const lastWorkoutEx = await prisma.workoutExercise.findFirst({
    where: {
      exerciseId,
      workout: { userId },
    },
    orderBy: { workout: { date: "desc" } },
    include: {
      sets: { where: { type: "WORKING" }, orderBy: { setNumber: "asc" } },
      workout: { select: { date: true } },
    },
  });

  if (!lastWorkoutEx || lastWorkoutEx.sets.length === 0) {
    return Response.json(null);
  }

  const sets = lastWorkoutEx.sets;
  const lastSet = sets[sets.length - 1];
  // Top set = the heaviest working set of that session (the most weight
  // moved), tie-broken by reps so the harder set wins at equal load. For
  // bodyweight lifts (weight 0) this collapses to the highest-rep set.
  const topSet = sets.reduce((best, s) => {
    const bw = best.weight ?? 0;
    const sw = s.weight ?? 0;
    if (sw > bw) return s;
    if (sw === bw && (s.reps ?? 0) > (best.reps ?? 0)) return s;
    return best;
  }, sets[0]);
  const daysAgo = Math.floor(
    (Date.now() - new Date(lastWorkoutEx.workout.date).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return Response.json({
    // lastWeight/lastReps stay as the chronological last set (used to prefill
    // the new set inputs). topWeight/topReps drive the "Top:" hint shown on
    // the logger.
    lastWeight: lastSet.weight,
    lastReps: lastSet.reps,
    topWeight: topSet.weight,
    topReps: topSet.reps,
    allSets: sets.map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rir })),
    daysAgo,
  });
}

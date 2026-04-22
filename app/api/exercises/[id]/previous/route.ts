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
  const daysAgo = Math.floor(
    (Date.now() - new Date(lastWorkoutEx.workout.date).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return Response.json({
    lastWeight: lastSet.weight,
    lastReps: lastSet.reps,
    allSets: sets.map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rir })),
    daysAgo,
  });
}

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { similarExerciseIds } from "@/lib/exerciseIdentity";

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

  // Standing PRs for this lift.
  //
  // The topWeight/topReps figures above describe ONE session — the most recent
  // one — so beating them is not a PR. Anything that wants to say "record" has
  // to compare against the all-time bar, and it has to be the SAME bar the
  // save path uses, or the UI promises PRs the server then declines to write.
  //
  // So this mirrors detectPRs in lib/actions/workouts.ts deliberately: the
  // same sibling-id expansion, so a near-duplicate exercise row (a typo of a
  // canonical lift) shares one PR ladder, and the same orderBy on both PR
  // types. Any change to the comparison rules there belongs here too.
  const [exercise, allExercises] = await Promise.all([
    prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { name: true },
    }),
    prisma.exercise.findMany({ select: { id: true, name: true } }),
  ]);
  const siblingIds = Array.from(
    similarExerciseIds(exerciseId, exercise?.name ?? null, allExercises)
  );

  const [weightPR, repsPR] = await Promise.all([
    prisma.personalRecord.findFirst({
      where: { userId, exerciseId: { in: siblingIds }, type: "WEIGHT" },
      orderBy: { value: "desc" },
    }),
    // For REPS PRs, `reps` holds the rep count and `value` holds the weight
    // at which those reps were performed.
    prisma.personalRecord.findFirst({
      where: { userId, exerciseId: { in: siblingIds }, type: "REPS" },
      orderBy: [{ reps: "desc" }, { value: "desc" }],
    }),
  ]);

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
    // The all-time bar to beat, or null where no record stands yet. Each is
    // shaped the way its PR is judged: a WEIGHT PR needs the load plus the
    // reps that tie-break it at equal load; a REPS PR needs the rep count
    // plus the load those reps were done at. Callers must only apply these
    // to WORKING sets — supersets and drop sets never make PRs.
    prWeight: weightPR ? { value: weightPR.value, reps: weightPR.reps } : null,
    prReps: repsPR ? { reps: repsPR.reps, value: repsPR.value } : null,
  });
}

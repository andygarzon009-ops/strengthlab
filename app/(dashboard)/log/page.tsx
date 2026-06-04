import WorkoutForm, {
  type WorkoutFormInitial,
} from "@/components/WorkoutForm";
import WorkoutFormVoiceHydrator from "@/components/WorkoutFormVoiceHydrator";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";

export default async function LogWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ clone?: string; voice?: string }>;
}) {
  const userId = await requireAuth();
  const { clone, voice } = await searchParams;

  if (voice) {
    return <WorkoutFormVoiceHydrator />;
  }

  let initial: WorkoutFormInitial | undefined;
  if (clone) {
    // User must share a group with the workout owner to clone
    const source = await prisma.workout.findUnique({
      where: { id: clone },
      include: {
        exercises: {
          include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
          orderBy: { order: "asc" },
        },
      },
    });

    if (source) {
      // You can clone your own workout, or any workout from someone you follow
      // (your crew) — the same people whose workouts surface in your feed and
      // Crew Highlights. (The old group-membership check is dead.)
      const canSee =
        source.userId === userId ||
        (await prisma.follow.count({
          where: { followerId: userId, followingId: source.userId },
        })) > 0;

      if (canSee) {
        initial = {
          id: "",
          title: source.title,
          type: source.type,
          split: source.split,
          date: new Date().toISOString(),
          notes: "",
          feeling: "",
          isDeload: false,
          exercises: source.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            exerciseName: e.exercise.name,
            notes: "",
            supersetGroup: e.supersetGroup ?? null,
            sets: e.sets.map((s) => ({
              type: s.type as "WARMUP" | "WORKING" | "SUPERSET",
              setNumber: s.setNumber,
              weight: s.weight?.toString() ?? "",
              reps: s.reps?.toString() ?? "",
              rir: s.rir?.toString() ?? "",
              notes: "",
            })),
          })),
          duration: source.duration,
          distance: source.distance,
          pace: source.pace,
          avgHeartRate: source.avgHeartRate,
          maxHeartRate: source.maxHeartRate,
          rounds: source.rounds,
          elevation: source.elevation,
          incline: source.incline,
          speed: source.speed,
          level: source.level,
          rpe: source.rpe,
        };
      }
    }
  }

  return <WorkoutForm mode="create" initial={initial} />;
}

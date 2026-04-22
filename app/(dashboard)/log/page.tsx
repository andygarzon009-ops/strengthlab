import WorkoutForm, {
  type WorkoutFormInitial,
} from "@/components/WorkoutForm";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";

export default async function LogWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ clone?: string }>;
}) {
  const userId = await requireAuth();
  const { clone } = await searchParams;

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
      const canSee =
        source.userId === userId ||
        (await prisma.groupMember.count({
          where: {
            userId,
            group: {
              members: { some: { userId: source.userId } },
            },
          },
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
            sets: e.sets.map((s) => ({
              type: s.type as "WARMUP" | "WORKING",
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
          rpe: source.rpe,
        };
      }
    }
  }

  return <WorkoutForm mode="create" initial={initial} />;
}

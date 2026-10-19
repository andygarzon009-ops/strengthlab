import { CARDIO_SET_TYPE, fromCardioMetrics } from "@/lib/cardio";
import WorkoutForm, {
  type WorkoutFormInitial,
} from "@/components/WorkoutForm";
import WorkoutFormVoiceHydrator from "@/components/WorkoutFormVoiceHydrator";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { loadPhase } from "@/components/PhaseCard";
import { blockKindOf, prescribeSession, type PSet } from "@/lib/prescribe";

export default async function LogWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ clone?: string; next?: string; voice?: string }>;
}) {
  const userId = await requireAuth();
  const { clone, next, voice } = await searchParams;

  if (voice) {
    return <WorkoutFormVoiceHydrator />;
  }

  let initial: WorkoutFormInitial | undefined;
  if (next) {
    initial = await prescribedNext(userId, next);
  } else if (clone) {
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
            muscleGroup: e.exercise.muscleGroup,
            notes: "",
            supersetGroup: e.supersetGroup ?? null,
            sets: e.sets.map((s) => ({
              type: s.type as "WARMUP" | "WORKING" | "SUPERSET" | "DROP_SET" | "CARDIO",
              setNumber: s.setNumber,
              weight: s.weight?.toString() ?? "",
              reps: s.reps?.toString() ?? "",
              rir: s.rir?.toString() ?? "",
              cardio:
                s.type === CARDIO_SET_TYPE
                  ? { ...fromCardioMetrics(s.metrics), startedAt: undefined }
                  : undefined,
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

const toPSet = (s: {
  type: string;
  weight: number | null;
  reps: number | null;
  rir: number | null;
}): PSet => ({ type: s.type, weight: s.weight, reps: s.reps, rir: s.rir });

/// The feed's "Start <split> day": the athlete's last session of that split,
/// re-prescribed for today's block (lib/prescribe.ts) rather than copied.
async function prescribedNext(
  userId: string,
  templateId: string,
): Promise<WorkoutFormInitial | undefined> {
  const source = await prisma.workout.findFirst({
    where: { id: templateId, userId },
    include: {
      exercises: {
        include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!source) return undefined;

  const ids = [...new Set(source.exercises.map((e) => e.exerciseId))];
  const [phase, account, user, history] = await Promise.all([
    loadPhase(userId).catch(() => null),
    prisma.healthAccount.findUnique({
      where: { userId },
      select: { recoveryBand: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { bodyweight: true } }),
    // Each lift's LAST — it may have been trained since this split last ran.
    prisma.workoutExercise.findMany({
      where: {
        exerciseId: { in: ids },
        workout: { userId, date: { gte: source.date } },
      },
      include: {
        sets: { orderBy: { setNumber: "asc" } },
        workout: { select: { date: true } },
      },
      orderBy: { workout: { date: "desc" } },
    }),
  ]);
  const lastById = new Map<string, PSet[]>();
  for (const we of history) {
    if (lastById.has(we.exerciseId)) continue;
    if (!we.sets.some((s) => (s.reps ?? 0) > 0)) continue;
    lastById.set(we.exerciseId, we.sets.map(toPSet));
  }

  const deload = !!phase?.state.isDeloadWeek;
  const prescribed = prescribeSession(
    source.exercises.map((e) => ({
      name: e.exercise.name,
      last: lastById.get(e.exerciseId) ?? [],
      template: e.sets.map(toPSet),
      e,
    })),
    {
      block: phase
        ? {
            kind: blockKindOf(phase.state.blockName, deload),
            deloadPct: phase.config.deloadReductionPct ?? 40,
          }
        : null,
      lowRecovery: account?.recoveryBand === "low",
      bodyweight: user?.bodyweight ?? null,
    },
  );

  const str = (n: number | null) => (n == null ? "" : n.toString());
  return {
    id: "",
    title: source.title,
    type: source.type,
    split: source.split,
    date: new Date().toISOString(),
    notes: "",
    feeling: "",
    isDeload: deload,
    exercises: prescribed.map(({ e, sets }) => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exercise.name,
      muscleGroup: e.exercise.muscleGroup,
      notes: "",
      supersetGroup: e.supersetGroup ?? null,
      sets: sets.map((s, i) => {
        // Cardio rows pass through untouched, metrics and all.
        const orig = s.type === CARDIO_SET_TYPE ? e.sets[i] : undefined;
        return {
          type: s.type as "WARMUP" | "WORKING" | "SUPERSET" | "DROP_SET" | "CARDIO",
          setNumber: i + 1,
          weight: str(s.weight),
          reps: str(s.reps),
          rir: str(s.rir),
          cardio: orig
            ? { ...fromCardioMetrics(orig.metrics), startedAt: undefined }
            : undefined,
          notes: "",
        };
      }),
    })),
    duration: null,
    distance: null,
    pace: null,
    avgHeartRate: null,
    maxHeartRate: null,
    rounds: null,
    elevation: null,
    incline: null,
    speed: null,
    level: null,
    rpe: null,
  };
}

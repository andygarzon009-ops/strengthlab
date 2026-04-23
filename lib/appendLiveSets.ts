import { prisma } from "@/lib/db";
import { subHours } from "date-fns";
import type { LiveParsedExercise } from "@/lib/parseLiveLog";
import { detectAndSavePRs } from "@/lib/actions/workouts";

export type AppendedSetSummary = {
  exerciseName: string;
  sets: { weight: string; reps: string; type: "WARMUP" | "WORKING" }[];
};

export type AppendResult = {
  workoutId: string;
  created: boolean;
  summary: AppendedSetSummary[];
};

// Append chat-logged sets to the most recent in-progress workout (within the
// last 6 hours) or create a fresh one. Keeps the chat-log path out of the
// user's form-based sessions once more than a few hours have passed.
export async function appendLiveSets(
  userId: string,
  parsed: LiveParsedExercise[]
): Promise<AppendResult | null> {
  if (parsed.length === 0) return null;

  const windowStart = subHours(new Date(), 6);

  let workout = await prisma.workout.findFirst({
    where: { userId, date: { gte: windowStart } },
    orderBy: { date: "desc" },
    include: {
      exercises: {
        include: { sets: true },
        orderBy: { order: "asc" },
      },
    },
  });

  const created = !workout;

  if (!workout) {
    const fresh = await prisma.workout.create({
      data: {
        userId,
        title: "Live session",
        type: "WEIGHT_TRAINING",
        split: null,
        date: new Date(),
      },
    });
    workout = {
      ...fresh,
      exercises: [],
    };
  }

  const summary: AppendedSetSummary[] = [];

  for (const ex of parsed) {
    // Reuse an existing WorkoutExercise row for this lift if one exists in
    // this workout, so sets belong to the same block instead of forking.
    let woEx = workout.exercises.find((we) => we.exerciseId === ex.exerciseId);

    if (!woEx) {
      const created = await prisma.workoutExercise.create({
        data: {
          workoutId: workout.id,
          exerciseId: ex.exerciseId,
          order: workout.exercises.length,
        },
        include: { sets: true },
      });
      woEx = { ...created };
      workout.exercises.push(woEx);
    }

    const existingWorking = woEx.sets.filter((s) => s.type === "WORKING");
    const existingWarmup = woEx.sets.filter((s) => s.type === "WARMUP");
    let nextWorking = existingWorking.length;
    let nextWarmup = existingWarmup.length;

    const addedSummary: AppendedSetSummary = {
      exerciseName: ex.exerciseName,
      sets: [],
    };

    for (const s of ex.sets) {
      const setNumber = s.type === "WARMUP" ? ++nextWarmup : ++nextWorking;
      await prisma.set.create({
        data: {
          workoutExerciseId: woEx.id,
          type: s.type,
          setNumber,
          weight: s.weight ? parseFloat(s.weight) : null,
          reps: s.reps ? parseInt(s.reps) : null,
          rir: s.rir ? parseInt(s.rir) : null,
        },
      });
      addedSummary.sets.push({
        type: s.type,
        weight: s.weight,
        reps: s.reps,
      });
    }

    summary.push(addedSummary);
  }

  // Refresh exercises with their latest sets + exercise relation so PR
  // detection can evaluate everything we just wrote.
  const fresh = await prisma.workout.findUnique({
    where: { id: workout.id },
    include: {
      exercises: {
        include: { sets: true, exercise: true },
      },
    },
  });
  if (fresh) {
    await detectAndSavePRs(
      userId,
      fresh.id,
      fresh.exercises,
      fresh.date
    );
  }

  return { workoutId: workout.id, created, summary };
}

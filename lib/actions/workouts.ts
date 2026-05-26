"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { similarExerciseIds } from "@/lib/exerciseIdentity";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type SetInput = {
  type: string;
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
  rir?: number | null;
  notes?: string;
};

type ExerciseInput = {
  exerciseId: string;
  order: number;
  notes?: string;
  supersetGroup?: string | null;
  sets: SetInput[];
};

type WorkoutMetrics = {
  split?: string | null;
  duration?: number | null;
  distance?: number | null;
  pace?: string | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  rounds?: number | null;
  elevation?: number | null;
  calories?: number | null;
  rpe?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type CreateWorkoutInput = {
  title: string;
  type: string;
  date: string;
  notes?: string;
  feeling?: string;
  isDeload?: boolean;
  exercises: ExerciseInput[];
} & WorkoutMetrics;

export async function createWorkout(data: CreateWorkoutInput) {
  const userId = await requireAuth();

  const workout = await prisma.workout.create({
    data: {
      userId,
      title: data.title,
      type: data.type,
      split: data.split ?? null,
      date: new Date(data.date),
      notes: data.notes,
      feeling: data.feeling,
      isDeload: data.isDeload ?? false,
      duration: data.duration ?? null,
      distance: data.distance ?? null,
      pace: data.pace ?? null,
      avgHeartRate: data.avgHeartRate ?? null,
      maxHeartRate: data.maxHeartRate ?? null,
      rounds: data.rounds ?? null,
      elevation: data.elevation ?? null,
      calories: data.calories ?? null,
      rpe: data.rpe ?? null,
      startedAt: data.startedAt ? new Date(data.startedAt) : null,
      endedAt: data.endedAt ? new Date(data.endedAt) : null,
      exercises: {
        create: data.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          order: ex.order,
          notes: ex.notes,
          supersetGroup: ex.supersetGroup ?? null,
          sets: {
            create: ex.sets.map((s) => ({
              type: s.type,
              setNumber: s.setNumber,
              weight: s.weight,
              reps: s.reps,
              rir: s.rir,
              notes: s.notes,
            })),
          },
        })),
      },
    },
    include: {
      exercises: { include: { sets: true, exercise: true } },
    },
  });

  const prs = await detectAndSavePRs(
    userId,
    workout.id,
    workout.exercises,
    workout.date
  );

  // Auto-broadcast to every group the athlete is in as a chat message.
  // When the session produced one or more PRs, attach them to the post
  // so the crew sees a celebratory "🏆 PR" card instead of the plain
  // "just logged" line — turns logging into a social event.
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  if (memberships.length > 0) {
    const cardType = prs.length > 0 ? "WORKOUT_PR" : null;
    const cardData = prs.length > 0 ? { prs } : undefined;
    await prisma.groupPost.createMany({
      data: memberships.map((m) => ({
        groupId: m.groupId,
        userId,
        text: "",
        workoutId: workout.id,
        cardType,
        cardData,
      })),
    });
  }

  // Clear the server-side draft now that the workout is committed.
  // Failures here are non-fatal — the draft will get overwritten next
  // time the user opens the form.
  await prisma.workoutDraft
    .delete({ where: { userId } })
    .catch(() => undefined);

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/group");
  revalidatePath("/analytics");
  // Return the new workoutId so the client can navigate. We avoid the
  // server-side redirect() so a transient failure surfaces as a normal
  // catchable error and the client keeps the draft for retry.
  return { workoutId: workout.id };
}

export type DetectedPR = {
  exerciseId: string;
  exerciseName: string;
  type: "WEIGHT" | "REPS";
  value: number;
  reps: number | null;
};

export async function detectAndSavePRs(
  userId: string,
  workoutId: string,
  exercises: any[],
  workoutDate: Date
): Promise<DetectedPR[]> {
  const created: DetectedPR[] = [];
  // Pull the full exercise pool once so we can compare PRs across
  // near-duplicate exercise rows (e.g. a user's typo of a canonical lift).
  const allExercises = await prisma.exercise.findMany({
    select: { id: true, name: true },
  });

  for (const ex of exercises) {
    // PRs are tracked from straight WORKING sets only. SUPERSET sets are
    // intentionally lighter volume work (the partner lift pre-fatigues the
    // athlete and the goal is hypertrophy, not a max), so they'd contaminate
    // the PR ladder with non-max-effort weights. They still count toward
    // tonnage and weak-spot scoring.
    const workingSets = ex.sets.filter((s: any) => s.type === "WORKING");
    if (workingSets.length === 0) continue;

    const siblingIds = Array.from(
      similarExerciseIds(
        ex.exerciseId,
        ex.exercise?.name ?? null,
        allExercises
      )
    );

    // Identify the set with the heaviest weight, breaking ties on more
    // reps so 270×6 outranks 270×5 — adding a rep at the PR weight is
    // a real progression and should register as a WEIGHT PR.
    const heaviestSet = workingSets.reduce((best: any, s: any) => {
      const sw = s.weight ?? 0;
      const bw = best.weight ?? 0;
      if (sw > bw) return s;
      if (sw === bw && (s.reps ?? 0) > (best.reps ?? 0)) return s;
      return best;
    }, workingSets[0]);
    const maxWeight = heaviestSet.weight ?? 0;
    const weightAtMaxReps = heaviestSet.reps ?? null;

    // Identify the set with the most reps, breaking ties on heavier
    // weight — 25 lb × 8 reps outranks 0 lb × 8 reps as a rep PR.
    const highestRepSet = workingSets.reduce((best: any, s: any) => {
      const sr = s.reps ?? 0;
      const br = best.reps ?? 0;
      if (sr > br) return s;
      if (sr === br && (s.weight ?? 0) > (best.weight ?? 0)) return s;
      return best;
    }, workingSets[0]);
    const maxReps = highestRepSet.reps ?? 0;
    const weightAtMaxRepSet = highestRepSet.weight ?? 0;

    const [weightPR, repsPR] = await Promise.all([
      prisma.personalRecord.findFirst({
        where: { userId, exerciseId: { in: siblingIds }, type: "WEIGHT" },
        orderBy: { value: "desc" },
      }),
      // For REPS PRs, `reps` holds the rep count and `value` holds the
      // weight at which those reps were performed. Order by reps first,
      // then weight, so the prior PR is the strongest historical set.
      prisma.personalRecord.findFirst({
        where: { userId, exerciseId: { in: siblingIds }, type: "REPS" },
        orderBy: [{ reps: "desc" }, { value: "desc" }],
      }),
    ]);

    const prCreates: any[] = [];

    const exName = ex.exercise?.name ?? "";

    const beatsPriorWeight =
      !weightPR ||
      maxWeight > weightPR.value ||
      (maxWeight === weightPR.value &&
        (weightAtMaxReps ?? 0) > (weightPR.reps ?? 0));
    if (maxWeight > 0 && beatsPriorWeight) {
      prCreates.push({
        userId,
        exerciseId: ex.exerciseId,
        type: "WEIGHT",
        value: maxWeight,
        reps: weightAtMaxReps,
        workoutId,
        date: workoutDate,
      });
      created.push({
        exerciseId: ex.exerciseId,
        exerciseName: exName,
        type: "WEIGHT",
        value: maxWeight,
        reps: weightAtMaxReps,
      });
    }
    const beatsPriorReps =
      !repsPR ||
      maxReps > (repsPR.reps ?? 0) ||
      (maxReps === (repsPR.reps ?? 0) && weightAtMaxRepSet > repsPR.value);
    if (maxReps > 0 && beatsPriorReps) {
      prCreates.push({
        userId,
        exerciseId: ex.exerciseId,
        type: "REPS",
        value: weightAtMaxRepSet,
        reps: maxReps,
        workoutId,
        date: workoutDate,
      });
      created.push({
        exerciseId: ex.exerciseId,
        exerciseName: exName,
        type: "REPS",
        value: weightAtMaxRepSet,
        reps: maxReps,
      });
    }
    if (prCreates.length > 0) {
      await prisma.personalRecord.createMany({ data: prCreates });
    }
  }
  return created;
}

export async function updateWorkout(
  workoutId: string,
  data: CreateWorkoutInput
) {
  const userId = await requireAuth();

  const existing = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { userId: true },
  });
  if (!existing || existing.userId !== userId) {
    throw new Error("Not authorized");
  }

  await prisma.$transaction([
    prisma.personalRecord.deleteMany({ where: { workoutId, userId } }),
    prisma.workoutExercise.deleteMany({ where: { workoutId } }),
    // Wipe coach chat history — prior replies reference the old sets
    // verbatim and would otherwise leak back into future coaching.
    prisma.trainerMessage.deleteMany({ where: { userId } }),
    prisma.workout.update({
      where: { id: workoutId },
      data: {
        title: data.title,
        type: data.type,
        split: data.split ?? null,
        date: new Date(data.date),
        notes: data.notes,
        feeling: data.feeling,
        isDeload: data.isDeload ?? false,
        duration: data.duration ?? null,
        distance: data.distance ?? null,
        pace: data.pace ?? null,
        avgHeartRate: data.avgHeartRate ?? null,
        maxHeartRate: data.maxHeartRate ?? null,
        rounds: data.rounds ?? null,
        elevation: data.elevation ?? null,
        calories: data.calories ?? null,
        rpe: data.rpe ?? null,
        startedAt: data.startedAt ? new Date(data.startedAt) : null,
        endedAt: data.endedAt ? new Date(data.endedAt) : null,
        exercises: {
          create: data.exercises.map((ex) => ({
            exerciseId: ex.exerciseId,
            order: ex.order,
            notes: ex.notes,
            sets: {
              create: ex.sets.map((s) => ({
                type: s.type,
                setNumber: s.setNumber,
                weight: s.weight,
                reps: s.reps,
                rir: s.rir,
                notes: s.notes,
              })),
            },
          })),
        },
      },
    }),
  ]);

  const fresh = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { exercises: { include: { sets: true, exercise: true } } },
  });
  if (fresh)
    await detectAndSavePRs(userId, workoutId, fresh.exercises, fresh.date);

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/analytics");
  revalidatePath(`/workout/${workoutId}`);
  return { workoutId };
}

export async function deleteWorkout(workoutId: string) {
  const userId = await requireAuth();
  await prisma.$transaction([
    // Drop any PR rows that were set during this workout — otherwise their
    // dates keep pointing at a session that no longer exists.
    prisma.personalRecord.deleteMany({ where: { workoutId, userId } }),
    prisma.workout.deleteMany({ where: { id: workoutId, userId } }),
    prisma.trainerMessage.deleteMany({ where: { userId } }),
  ]);
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/analytics");
  redirect("/history");
}

export async function addReaction(workoutId: string, type: string) {
  const userId = await requireAuth();
  try {
    await prisma.reaction.create({ data: { workoutId, userId, type } });
  } catch {
    await prisma.reaction.delete({
      where: { workoutId_userId_type: { workoutId, userId, type } },
    });
  }
  revalidatePath("/");
}

export async function addComment(workoutId: string, text: string) {
  const userId = await requireAuth();
  if (!text.trim()) return;
  await prisma.comment.create({ data: { workoutId, userId, text } });
  revalidatePath("/");
  revalidatePath(`/workout/${workoutId}`);
}

export async function createGroup(name: string) {
  const userId = await requireAuth();
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const group = await prisma.group.create({
    data: {
      name,
      code,
      members: { create: { userId, role: "ADMIN" } },
    },
  });
  revalidatePath("/group");
  return group;
}

export async function joinGroup(code: string) {
  const userId = await requireAuth();
  const group = await prisma.group.findUnique({ where: { code } });
  if (!group) return { error: "Group not found" };

  const existing = await prisma.groupMember.findFirst({
    where: { groupId: group.id, userId },
  });
  if (existing) return { error: "Already a member" };

  await prisma.groupMember.create({ data: { groupId: group.id, userId } });
  revalidatePath("/group");
  return { success: true };
}

export async function renameGroup(groupId: string, name: string) {
  const userId = await requireAuth();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name required" };
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });
  if (!membership || membership.role !== "ADMIN") {
    return { error: "Only admins can rename" };
  }
  await prisma.group.update({ where: { id: groupId }, data: { name: trimmed } });
  revalidatePath("/group");
  return { success: true };
}

export async function deleteGroup(groupId: string) {
  const userId = await requireAuth();
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });
  if (!membership || membership.role !== "ADMIN") {
    return { error: "Only admins can delete" };
  }
  await prisma.group.delete({ where: { id: groupId } });
  revalidatePath("/group");
  return { success: true };
}

export async function leaveGroup(groupId: string) {
  const userId = await requireAuth();
  await prisma.groupMember.deleteMany({ where: { groupId, userId } });
  revalidatePath("/group");
  return { success: true };
}

export async function updateProfile(data: {
  name: string;
  birthDate?: string | null;
  sex?: string | null;
  bodyweight?: number;
  preferredSplit?: string;
  bio?: string;
  experienceLevel?: string;
  primaryFocus?: string;
  trainingPhase?: string;
  trainingDays?: number;
  injuries?: string;
  coachPrompt?: string;
  height?: number | null;
  bodyFat?: number | null;
  restingHR?: number | null;
  waist?: number | null;
  hips?: number | null;
  chest?: number | null;
  shoulders?: number | null;
  neck?: number | null;
  arm?: number | null;
  forearm?: number | null;
  thigh?: number | null;
  calf?: number | null;
}) {
  const userId = await requireAuth();
  const { birthDate, ...rest } = data;
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      birthDate:
        birthDate === undefined
          ? undefined
          : birthDate
            ? new Date(birthDate)
            : null,
    },
  });
  revalidatePath("/profile");
}

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
    include: {
      exercises: { include: { sets: true, exercise: true } },
    },
  });

  await detectAndSavePRs(userId, workout.id, workout.exercises, workout.date);

  // Auto-broadcast to every group the athlete is in as a chat message
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  if (memberships.length > 0) {
    await prisma.groupPost.createMany({
      data: memberships.map((m) => ({
        groupId: m.groupId,
        userId,
        text: "",
        workoutId: workout.id,
      })),
    });
  }

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/group");
  redirect(`/workout/${workout.id}`);
}

export async function detectAndSavePRs(
  userId: string,
  workoutId: string,
  exercises: any[],
  workoutDate: Date
) {
  // Pull the full exercise pool once so we can compare PRs across
  // near-duplicate exercise rows (e.g. a user's typo of a canonical lift).
  const allExercises = await prisma.exercise.findMany({
    select: { id: true, name: true },
  });

  for (const ex of exercises) {
    const workingSets = ex.sets.filter((s: any) => s.type === "WORKING");
    if (workingSets.length === 0) continue;

    const siblingIds = Array.from(
      similarExerciseIds(
        ex.exerciseId,
        ex.exercise?.name ?? null,
        allExercises
      )
    );

    // Identify the set with the heaviest weight (and its reps)
    const heaviestSet = workingSets.reduce(
      (best: any, s: any) =>
        (s.weight ?? 0) > (best.weight ?? 0) ? s : best,
      workingSets[0]
    );
    const maxWeight = heaviestSet.weight ?? 0;
    const weightAtMaxReps = heaviestSet.reps ?? null;

    // Identify the set with the most reps (and its weight)
    const highestRepSet = workingSets.reduce(
      (best: any, s: any) => ((s.reps ?? 0) > (best.reps ?? 0) ? s : best),
      workingSets[0]
    );
    const maxReps = highestRepSet.reps ?? 0;

    const [weightPR, repsPR] = await Promise.all([
      prisma.personalRecord.findFirst({
        where: { userId, exerciseId: { in: siblingIds }, type: "WEIGHT" },
        orderBy: { value: "desc" },
      }),
      prisma.personalRecord.findFirst({
        where: { userId, exerciseId: { in: siblingIds }, type: "REPS" },
        orderBy: { value: "desc" },
      }),
    ]);

    const prCreates: any[] = [];

    if (maxWeight > 0 && (!weightPR || maxWeight > weightPR.value)) {
      prCreates.push({
        userId,
        exerciseId: ex.exerciseId,
        type: "WEIGHT",
        value: maxWeight,
        reps: weightAtMaxReps,
        workoutId,
        date: workoutDate,
      });
    }
    if (maxReps > 0 && (!repsPR || maxReps > repsPR.value)) {
      prCreates.push({
        userId,
        exerciseId: ex.exerciseId,
        type: "REPS",
        value: maxReps,
        reps: maxReps,
        workoutId,
        date: workoutDate,
      });
    }
    if (prCreates.length > 0) {
      await prisma.personalRecord.createMany({ data: prCreates });
    }
  }
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
  revalidatePath(`/workout/${workoutId}`);
  redirect(`/workout/${workoutId}`);
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

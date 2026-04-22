"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
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

  await detectAndSavePRs(userId, workout.id, workout.exercises);

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`/workout/${workout.id}`);
}

async function detectAndSavePRs(
  userId: string,
  workoutId: string,
  exercises: any[]
) {
  for (const ex of exercises) {
    const workingSets = ex.sets.filter((s: any) => s.type === "WORKING");
    if (workingSets.length === 0) continue;

    const maxWeight = Math.max(...workingSets.map((s: any) => s.weight ?? 0));
    const maxReps = Math.max(...workingSets.map((s: any) => s.reps ?? 0));
    const totalVolume = workingSets.reduce(
      (sum: number, s: any) => sum + (s.weight ?? 0) * (s.reps ?? 0),
      0
    );

    // Check existing PRs
    const [weightPR, repsPR, volumePR] = await Promise.all([
      prisma.personalRecord.findFirst({
        where: { userId, exerciseId: ex.exerciseId, type: "WEIGHT" },
        orderBy: { value: "desc" },
      }),
      prisma.personalRecord.findFirst({
        where: { userId, exerciseId: ex.exerciseId, type: "REPS" },
        orderBy: { value: "desc" },
      }),
      prisma.personalRecord.findFirst({
        where: { userId, exerciseId: ex.exerciseId, type: "VOLUME" },
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
        workoutId,
      });
    }
    if (maxReps > 0 && (!repsPR || maxReps > repsPR.value)) {
      prCreates.push({
        userId,
        exerciseId: ex.exerciseId,
        type: "REPS",
        value: maxReps,
        workoutId,
      });
    }
    if (totalVolume > 0 && (!volumePR || totalVolume > volumePR.value)) {
      prCreates.push({
        userId,
        exerciseId: ex.exerciseId,
        type: "VOLUME",
        value: totalVolume,
        workoutId,
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
  if (fresh) await detectAndSavePRs(userId, workoutId, fresh.exercises);

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath(`/workout/${workoutId}`);
  redirect(`/workout/${workoutId}`);
}

export async function deleteWorkout(workoutId: string) {
  const userId = await requireAuth();
  await prisma.workout.deleteMany({ where: { id: workoutId, userId } });
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

export async function updateProfile(data: {
  name: string;
  bodyweight?: number;
  goals?: string;
  preferredSplit?: string;
  bio?: string;
  experienceLevel?: string;
  primaryFocus?: string;
  trainingDays?: number;
  injuries?: string;
  coachPrompt?: string;
}) {
  const userId = await requireAuth();
  await prisma.user.update({ where: { id: userId }, data });
  revalidatePath("/profile");
}

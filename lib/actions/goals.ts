"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type GoalType =
  | "STRENGTH"
  | "FREQUENCY"
  | "BODYWEIGHT_GAIN"
  | "BODYWEIGHT_CUT"
  | "DISTANCE"
  | "PACE";

export async function createGoal(data: {
  type: GoalType;
  title: string;
  exerciseId?: string;
  targetValue: number;
  targetReps?: number;
  unit?: string;
  deadline?: string;
}) {
  const userId = await requireAuth();
  await prisma.goal.create({
    data: {
      userId,
      type: data.type,
      title: data.title,
      exerciseId: data.exerciseId,
      targetValue: data.targetValue,
      targetReps: data.targetReps ?? null,
      unit: data.unit,
      deadline: data.deadline ? new Date(data.deadline) : null,
    },
  });
  revalidatePath("/analytics");
}

export async function updateGoal(
  goalId: string,
  data: Partial<{
    title: string;
    targetValue: number;
    unit: string;
    deadline: string | null;
    completed: boolean;
  }>
) {
  const userId = await requireAuth();
  await prisma.goal.updateMany({
    where: { id: goalId, userId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.targetValue !== undefined && { targetValue: data.targetValue }),
      ...(data.unit !== undefined && { unit: data.unit }),
      ...(data.deadline !== undefined && {
        deadline: data.deadline ? new Date(data.deadline) : null,
      }),
      ...(data.completed !== undefined && { completed: data.completed }),
    },
  });
  revalidatePath("/analytics");
}

export async function deleteGoal(goalId: string) {
  const userId = await requireAuth();
  await prisma.goal.deleteMany({ where: { id: goalId, userId } });
  revalidatePath("/analytics");
}

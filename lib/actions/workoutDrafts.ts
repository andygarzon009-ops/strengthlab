"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import type { Prisma } from "@/app/generated/prisma";

export type WorkoutDraftPayload = {
  workoutType: string;
  split: string;
  title: string;
  notes: string;
  feeling: string;
  isDeload: boolean;
  date: string;
  exercises: unknown[];
  durationMin: string;
  durationSec: string;
  distance: string;
  pace: string;
  avgHR: string;
  maxHR: string;
  rounds: string;
  elevation: string;
  rpe: string;
};

export async function saveWorkoutDraft(payload: WorkoutDraftPayload) {
  const userId = await requireAuth();
  await prisma.workoutDraft.upsert({
    where: { userId },
    update: { payload: payload as unknown as Prisma.InputJsonValue },
    create: {
      userId,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function loadWorkoutDraft(): Promise<WorkoutDraftPayload | null> {
  const userId = await requireAuth();
  const draft = await prisma.workoutDraft.findUnique({ where: { userId } });
  return (draft?.payload ?? null) as WorkoutDraftPayload | null;
}

export async function clearWorkoutDraft() {
  const userId = await requireAuth();
  await prisma.workoutDraft.deleteMany({ where: { userId } });
}

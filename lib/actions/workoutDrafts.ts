"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import type { Prisma } from "@/app/generated/prisma";
import {
  applyLoggedSets,
  mergeCoachAdjust,
  type DraftExercise,
  type ReportedExercise,
} from "@/lib/workoutAdjust";

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
  incline: string;
  speed: string;
  level: string;
  rpe: string;
  startedAt?: string | null;
  // The coach-prescribed warm-up and how far into it the athlete is. Both
  // optional: only coach-planned sessions have one, and drafts written before
  // warm-ups were persisted have neither.
  warmup?: unknown;
  warmupProgress?: unknown;
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

/// Apply a coach adjustment to the draft on the server.
///
/// This is the fallback path for when the athlete is chatting from somewhere
/// other than the log screen — no WorkoutForm is mounted to take the change
/// in memory, so we rewrite the stored draft and let the form hydrate it on
/// arrival. Refuses when there's nothing in progress: an adjustment has no
/// meaning without a session to adjust, and quietly inventing one here would
/// be the "separate workout" bug wearing a different hat.
export async function applyCoachAdjustToDraft(
  exercises: DraftExercise[],
): Promise<{ ok: boolean; reason?: string }> {
  const userId = await requireAuth();
  const row = await prisma.workoutDraft.findUnique({ where: { userId } });
  const payload = (row?.payload ?? null) as WorkoutDraftPayload | null;
  if (!payload || !Array.isArray(payload.exercises)) {
    return { ok: false, reason: "No workout in progress" };
  }
  const merged = mergeCoachAdjust(
    payload.exercises as DraftExercise[],
    exercises,
  );
  await prisma.workoutDraft.update({
    where: { userId },
    data: {
      payload: {
        ...payload,
        exercises: merged,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return { ok: true };
}

/// Write chat-reported sets into the stored draft.
///
/// The fallback for when no WorkoutForm is mounted to take them in memory.
/// Returns ok:false when there's no session in progress, which sends the
/// caller back to appendLiveSets — the path that logs a standalone workout
/// for an athlete who's reporting sets without using the logger at all.
export async function appendLoggedSetsToDraft(
  reported: ReportedExercise[],
): Promise<{ ok: boolean }> {
  const userId = await requireAuth();
  const row = await prisma.workoutDraft.findUnique({ where: { userId } });
  const payload = (row?.payload ?? null) as WorkoutDraftPayload | null;
  if (!payload || !Array.isArray(payload.exercises)) return { ok: false };

  const merged = applyLoggedSets(payload.exercises as DraftExercise[], reported);
  await prisma.workoutDraft.update({
    where: { userId },
    data: {
      payload: {
        ...payload,
        exercises: merged,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return { ok: true };
}

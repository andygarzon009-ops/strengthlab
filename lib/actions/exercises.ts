"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { DEFAULT_EXERCISES } from "@/lib/exercises";
import { revalidatePath } from "next/cache";

export async function syncDefaultExercises() {
  await requireAuth();
  const existing = await prisma.exercise.findMany({
    select: { id: true, name: true, splits: true, muscleGroup: true },
  });
  const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));

  const toCreate: {
    name: string;
    muscleGroup: string;
    splits: string;
  }[] = [];
  const toUpdate: {
    id: string;
    muscleGroup: string;
    splits: string;
  }[] = [];

  for (const def of DEFAULT_EXERCISES) {
    const hit = byName.get(def.name.toLowerCase());
    if (!hit) {
      toCreate.push(def);
    } else if (!hit.splits || !hit.muscleGroup) {
      toUpdate.push({
        id: hit.id,
        muscleGroup: def.muscleGroup,
        splits: def.splits,
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.exercise.createMany({
      data: toCreate.map((d) => ({
        name: d.name,
        muscleGroup: d.muscleGroup,
        splits: d.splits,
        isCustom: false,
      })),
      skipDuplicates: true,
    });
  }
  for (const u of toUpdate) {
    await prisma.exercise.update({
      where: { id: u.id },
      data: { muscleGroup: u.muscleGroup, splits: u.splits },
    });
  }
  revalidatePath("/exercises");
  revalidatePath("/log");
  return { created: toCreate.length, updated: toUpdate.length };
}

export async function updateExercise(
  id: string,
  data: { muscleGroup?: string; splits?: string; name?: string }
) {
  await requireAuth();
  await prisma.exercise.update({
    where: { id },
    data,
  });
  revalidatePath("/exercises");
  revalidatePath("/log");
}

export async function deleteCustomExercise(id: string) {
  await requireAuth();
  const ex = await prisma.exercise.findUnique({ where: { id } });
  if (!ex || !ex.isCustom) throw new Error("Only custom exercises can be deleted");
  await prisma.exercise.delete({ where: { id } });
  revalidatePath("/exercises");
  revalidatePath("/log");
}

export async function createCustomExercise(data: {
  name: string;
  muscleGroup?: string;
  splits?: string;
}) {
  await requireAuth();
  const ex = await prisma.exercise.create({
    data: {
      name: data.name,
      muscleGroup: data.muscleGroup ?? null,
      splits: data.splits ?? null,
      isCustom: true,
    },
  });
  revalidatePath("/exercises");
  revalidatePath("/log");
  return ex;
}

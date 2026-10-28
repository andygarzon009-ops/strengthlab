"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { MEALS, mealSig, type Meal } from "@/lib/meals";

type SaveItem = {
  name: string;
  portion?: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
};

const num = (v: unknown, max: number) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 10) / 10)) : 0;
};

/// Save a reviewed meal. Dated to the athlete's local day so a late dinner
/// counts for the day it was eaten.
export async function saveFoodItems(input: {
  meal: Meal;
  items: SaveItem[];
  photoUrl?: string | null;
  source: "photo" | "text";
  /// A name for this meal (two or more foods). Empty clears a name it had;
  /// left out, any existing name is untouched.
  mealName?: string;
}) {
  const userId = await requireAuth();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: user?.timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const meal: Meal = MEALS.includes(input.meal) ? input.meal : "SNACK";
  const items = input.items
    .map((it) => ({
      name: String(it.name ?? "").trim().slice(0, 80),
      portion: it.portion ? String(it.portion).trim().slice(0, 60) : null,
      kcal: num(it.kcal, 5000),
      proteinG: num(it.proteinG, 500),
      carbsG: num(it.carbsG, 1000),
      fatG: num(it.fatG, 500),
      fiberG: it.fiberG == null ? null : num(it.fiberG, 200),
    }))
    .filter((it) => it.name && it.kcal > 0)
    .slice(0, 20);
  if (items.length === 0) return { ok: false as const };

  await prisma.foodLog.createMany({
    data: items.map((it) => ({
      ...it,
      userId,
      localDate,
      meal,
      photoUrl: input.photoUrl ?? null,
      source: input.source === "text" ? "text" : "photo",
    })),
  });
  if (input.mealName !== undefined && items.length > 1) {
    await setMealName(userId, mealSig(items.map((it) => it.name)), input.mealName);
  }
  revalidatePath("/fuel");
  revalidatePath("/");
  return { ok: true as const, count: items.length };
}

export async function deleteFoodLog(id: string) {
  const userId = await requireAuth();
  await prisma.foodLog.deleteMany({ where: { id, userId } });
  revalidatePath("/fuel");
  revalidatePath("/");
}

/// Edit one logged food. Only the owner's row is touched.
export async function updateFoodLog(
  id: string,
  input: {
    name: string;
    meal: Meal;
    portion?: string | null;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  },
) {
  const userId = await requireAuth();
  const name = String(input.name ?? "").trim().slice(0, 80);
  const kcal = num(input.kcal, 5000);
  if (!name || kcal <= 0) return { ok: false as const };
  await prisma.foodLog.updateMany({
    where: { id, userId },
    data: {
      name,
      meal: MEALS.includes(input.meal) ? input.meal : "SNACK",
      portion: input.portion ? String(input.portion).trim().slice(0, 60) : null,
      kcal,
      proteinG: num(input.proteinG, 500),
      carbsG: num(input.carbsG, 1000),
      fatG: num(input.fatG, 500),
    },
  });
  revalidatePath("/fuel");
  revalidatePath("/");
  return { ok: true as const };
}

/// Name a past meal (by its food signature). An empty name goes back to the
/// automatic one.
export async function renameRecentMeal(sig: string, title: string) {
  const userId = await requireAuth();
  if (!String(sig ?? "")) return { ok: false as const };
  await setMealName(userId, String(sig), title);
  revalidatePath("/fuel");
  return { ok: true as const };
}

async function setMealName(userId: string, sig: string, title: string) {
  const key = sig.slice(0, 2000);
  const name = String(title ?? "").trim().slice(0, 60);
  if (!name) {
    await prisma.mealName.deleteMany({ where: { userId, sig: key } });
  } else {
    await prisma.mealName.upsert({
      where: { userId_sig: { userId, sig: key } },
      create: { userId, sig: key, title: name },
      update: { title: name },
    });
  }
}

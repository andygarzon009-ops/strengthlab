"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { cleanDiet } from "@/lib/diet";
import { cleanMealPrefs, type MealPrefs } from "@/lib/mealPrefs";

/// Saves the Fuel settings page: dietary restrictions and the meal-prep
/// preferences recipes are written against.
export async function saveFuelSettings(data: {
  dietRestrictions: string[];
  dietNotes: string;
  mealPrefs: MealPrefs;
}) {
  const userId = await requireAuth();
  await prisma.user.update({
    where: { id: userId },
    data: {
      dietRestrictions: cleanDiet(data.dietRestrictions),
      dietNotes: data.dietNotes.trim().slice(0, 300) || null,
      mealPrefs: cleanMealPrefs(data.mealPrefs),
    },
  });
  revalidatePath("/profile/fuel");
  revalidatePath("/fuel");
}

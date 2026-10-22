import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/session";
import { generateRecipes, num, TWEAKS } from "@/lib/recipes";

export type { Recipe, RecipeIngredient } from "@/lib/recipes";

export const runtime = "nodejs";
export const maxDuration = 120;

/// Recipes sized to what's left of today's targets, built around foods the
/// athlete already eats. Generated on demand (the Recipes tab or a swap chip),
/// never on page load.
export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kcal = num(body.kcal);
  const proteinG = num(body.proteinG);
  const carbsG = num(body.carbsG);
  const fatG = num(body.fatG);
  const meal = String(body.meal ?? "meal").toLowerCase().slice(0, 20);
  const phase = String(body.phase ?? "").slice(0, 40);
  const count = Math.min(3, Math.max(1, num(body.count) || 3));
  const tweak = TWEAKS[String(body.tweak ?? "")] ?? "";
  const exclude = (Array.isArray(body.exclude) ? body.exclude : []).map(String).slice(0, 12);
  if (kcal < 100) {
    return Response.json({ error: "You've about hit today's calories" }, { status: 400 });
  }

  const recipes = await generateRecipes(userId, { kcal, proteinG, carbsG, fatG, meal, phase, count, tweak, exclude });

  if (recipes.length === 0) {
    return Response.json({ error: "Couldn't come up with recipes right now — try again in a minute" }, { status: 502 });
  }
  return Response.json({ recipes });
}

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/session";
import { listRecentMeals } from "@/lib/foodLog";
import { textToJson } from "@/lib/foodAi";

export const runtime = "nodejs";
export const maxDuration = 120;

export type Recipe = {
  title: string;
  minutes: number;
  servings: number;
  /// Which of the athlete's usual foods it builds on, e.g. "Uses rice + pico you eat".
  usesYourFoods: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  ingredients: { name: string; amount: string; usual: boolean }[];
  steps: string[];
};

const TWEAKS: Record<string, string> = {
  other: "Make it clearly different from the ones listed as already shown.",
  quicker: "It must take 15 minutes or less, start to finish.",
  "no-cook": "No cooking at all — assembly only, no stove or oven (a microwave for 2 minutes is fine).",
};

const num = (n: unknown) => {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
};

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

  const recent = await listRecentMeals(userId, 40);
  const tally = new Map<string, number>();
  for (const m of recent) for (const it of m.items) tally.set(it.name, (tally.get(it.name) ?? 0) + m.times);
  const usual = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([n]) => n);

  const prompt = `You are a sports nutritionist writing ${count} recipe${count === 1 ? "" : "s"} for a strength athlete's ${meal}.
What's left of today's targets: ${kcal} kcal, ${proteinG} g protein, ${carbsG} g carbs, ${fatG} g fat.${phase ? ` Phase: ${phase}.` : ""}
Each recipe should land within about 10% of the calories left and get as close to the protein left as is realistic; protein matters most.
Foods they already eat: ${usual.length ? usual.join(", ") : "unknown"}.
These are real recipes — proper dishes someone would cook — not their logged foods recombined. ${count === 1 ? "It may borrow an ingredient or two they already eat if it fits naturally." : "At most one recipe may build on their usual foods; the rest should be new dishes in a style they'd plausibly like, borrowing an ingredient they already eat only where it fits naturally."}
${exclude.length ? `Already shown, don't repeat: ${exclude.join("; ")}.` : ""}
${tweak}
Keep recipes practical for a home cook: common grocery ingredients, 6–9 ingredients, 3–6 short steps, one serving.

Return ONLY JSON:
{ "recipes": [ {
  "title": string,
  "minutes": number,
  "servings": 1,
  "usesYourFoods": string | null,
  "kcal": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number | null,
  "ingredients": [ { "name": string, "amount": string, "usual": boolean } ],
  "steps": [ string ]
} ] }
- "usesYourFoods": a short phrase like "Uses rice + pico you eat" (two foods at most), or null if it uses none of their usual foods.
- "usual": true when that ingredient is one of the foods they already eat.
- "amount": e.g. "200 g", "1 cup", "1 tsp", "to taste".
- Numbers are totals for the serving, whole numbers, and must add up: kcal ≈ 4·protein + 4·carbs + 9·fat.`;

  const parsed = await textToJson<{ recipes?: unknown[] }>(prompt, "recipes");
  const recipes: Recipe[] = (Array.isArray(parsed?.recipes) ? parsed.recipes : [])
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const ing = Array.isArray(o.ingredients) ? o.ingredients : [];
      const steps = Array.isArray(o.steps) ? o.steps : [];
      return {
        title: String(o.title ?? "").trim().slice(0, 80),
        minutes: num(o.minutes),
        servings: num(o.servings) || 1,
        usesYourFoods: o.usesYourFoods ? String(o.usesYourFoods).trim().slice(0, 60) : null,
        kcal: num(o.kcal),
        proteinG: num(o.proteinG),
        carbsG: num(o.carbsG),
        fatG: num(o.fatG),
        fiberG: o.fiberG == null ? null : num(o.fiberG),
        ingredients: ing.slice(0, 14).map((i) => {
          const x = (i ?? {}) as Record<string, unknown>;
          return {
            name: String(x.name ?? "").trim().slice(0, 60),
            amount: String(x.amount ?? "").trim().slice(0, 24),
            usual: x.usual === true,
          };
        }).filter((i) => i.name),
        steps: steps.slice(0, 8).map((s) => String(s).trim().slice(0, 240)).filter(Boolean),
      };
    })
    .filter((r) => r.title && r.kcal > 0 && r.ingredients.length && r.steps.length)
    .slice(0, count);

  if (recipes.length === 0) {
    return Response.json({ error: "Couldn't come up with recipes right now — try again in a minute" }, { status: 502 });
  }
  return Response.json({ recipes });
}

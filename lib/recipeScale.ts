// Scaling a recipe's ingredient list to any number of servings, written the
// way a cook reads it: grams rounded sensibly, spoons and cups in kitchen
// fractions, teaspoons rolled up into tablespoons and tablespoons into cups.

import type { RecipeIngredient } from "@/lib/recipes";

const FRACTION: [number, string][] = [
  [0, ""],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [1, ""],
];

/// 1.5 → "1½", 0.33 → "⅓", 2 → "2".
export function kitchenNumber(v: number): string {
  let whole = Math.floor(v);
  const rest = v - whole;
  const [f, glyph] = FRACTION.reduce((a, b) => (Math.abs(b[0] - rest) < Math.abs(a[0] - rest) ? b : a));
  if (f === 1) whole += 1;
  if (whole === 0 && !glyph) return "¼"; // never round a real amount to nothing
  return `${whole || ""}${glyph}`;
}

function plural(unit: string, v: number): string {
  if (!unit || ["g", "ml", "tbsp", "tsp"].includes(unit)) return unit;
  return v > 1 && !unit.endsWith("s") ? (unit.endsWith("ch") ? `${unit}es` : `${unit}s`) : unit;
}

/// The amount column for one ingredient at `factor` × the base recipe.
export function scaledAmount(i: RecipeIngredient & { amount?: string }, factor: number): string {
  // Recipes cached before amounts were numbers.
  if (i.qty == null) return i.amount ?? "to taste";
  let v = i.qty * factor;
  let unit = i.unit;
  if (unit === "g" || unit === "ml") {
    if (v >= 1000) return `${+(v / 1000).toFixed(2)} ${unit === "g" ? "kg" : "L"}`;
    const step = v >= 100 ? 5 : 1;
    return `${Math.max(1, Math.round(v / step) * step)} ${unit}`;
  }
  if (unit === "tsp" && v >= 3) {
    v /= 3;
    unit = "tbsp";
  }
  if (unit === "tbsp" && v >= 4) {
    v /= 16;
    unit = "cup";
  }
  // Whole things (eggs, buns, cloves) only split in half.
  if (!["cup", "tbsp", "tsp"].includes(unit)) v = Math.max(0.5, Math.round(v * 2) / 2);
  const n = kitchenNumber(v);
  const label = plural(unit, v);
  return label ? `${n} ${label}` : n;
}

/// "1", "1.25", "1.5" → how a serving count reads.
export function servingsLabel(s: number): string {
  const n = Number.isInteger(s) ? `${s}` : `${+s.toFixed(2)}`;
  return `${n} serving${s === 1 ? "" : "s"}`;
}

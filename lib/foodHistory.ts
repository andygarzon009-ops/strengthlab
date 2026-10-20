// The coach's long view of what the athlete eats. The nutrition block covers
// today (and a one-line-per-day week); when the athlete asks about food or
// diet, the trainer route adds up to ~90 days of the in-app food log here, day
// by day, with the patterns already worked out.

import { prisma } from "@/lib/db";

const FOOD_WORDS =
  /\b(food|foods|eat|eats|eating|ate|meal|meals|diet|protein|calories?|kcal|macros?|carbs?|fats?|fibre|fiber|breakfast|lunch|dinner|snacks?|nutrition|fuel|hungry|appetite|bulk|bulking|cut|cutting|surplus|deficit|intake)\b/i;

/// Is this message about food? Gate so ordinary chats skip the history query.
export function asksAboutFood(message: string): boolean {
  return FOOD_WORDS.test(message);
}

/// How far back the athlete asked to look, clamped; defaults to 90 days.
export function requestedFoodDays(message: string): number {
  const m = message.match(/(\d{1,3})\s*(day|week|month)s?/i);
  if (!m) return 90;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const days = unit === "week" ? n * 7 : unit === "month" ? n * 30 : n;
  return Math.min(180, Math.max(7, days));
}

const MEAL_ORDER = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
const MEAL_SHORT: Record<string, string> = { BREAKFAST: "B", LUNCH: "L", DINNER: "D", SNACK: "S" };

const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/// Up to `days` days of logged food ending yesterday (today is already in the
/// nutrition block), rendered for the prompt. `trained` maps a local date to
/// what was trained that day. Empty string when nothing was ever logged.
export async function foodHistoryContext(
  userId: string,
  today: string,
  days: number,
  trained: Map<string, string>,
): Promise<string> {
  const start = shiftDate(today, -days);
  const rows = await prisma.foodLog.findMany({
    where: { userId, localDate: { gte: start, lt: today } },
    select: { localDate: true, meal: true, name: true, kcal: true, proteinG: true, carbsG: true, fatG: true },
    orderBy: [{ localDate: "asc" }, { loggedAt: "asc" }],
  });
  if (rows.length === 0) {
    return `FOOD HISTORY: nothing logged in StrengthLab before today in the last ${days} days. Say so plainly if asked about past eating — don't guess at it.`;
  }

  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byDay.get(r.localDate) ?? [];
    list.push(r);
    byDay.set(r.localDate, list);
  }
  const firstLogged = rows[0].localDate;

  type DayTotal = { date: string; kcal: number; p: number; c: number; f: number; meals: Set<string> };
  const totals: DayTotal[] = [];
  const lines: string[] = [];
  for (const [date, list] of byDay) {
    const t: DayTotal = { date, kcal: 0, p: 0, c: 0, f: 0, meals: new Set() };
    for (const r of list) {
      t.kcal += r.kcal;
      t.p += r.proteinG;
      t.c += r.carbsG;
      t.f += r.fatG;
      t.meals.add(r.meal);
    }
    totals.push(t);
    const foods = MEAL_ORDER.filter((m) => t.meals.has(m))
      .map(
        (m) =>
          `${MEAL_SHORT[m]}: ` +
          list
            .filter((r) => r.meal === m)
            .map((r) => `${r.name} ${Math.round(r.kcal)}`)
            .join(", "),
      )
      .join(" | ");
    const tr = trained.get(date);
    lines.push(
      `${date} ${weekday(date)}${tr ? ` [trained: ${tr}]` : " [rest]"}: ${Math.round(t.kcal)} kcal, ${Math.round(t.p)}P ${Math.round(t.c)}C ${Math.round(t.f)}F — ${foods}`,
    );
  }

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  // A day with only a snack logged isn't a day of eating; keep averages to
  // days that look complete (at least two of breakfast/lunch/dinner).
  const full = totals.filter((t) => ["BREAKFAST", "LUNCH", "DINNER"].filter((m) => t.meals.has(m)).length >= 2);
  const train = full.filter((t) => trained.has(t.date));
  const rest = full.filter((t) => !trained.has(t.date));
  const span = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${firstLogged}T12:00:00Z`)) / 86_400_000);
  const unlogged = Math.max(0, span - byDay.size);

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  // Only foods that recur say anything about habits.
  const top = [...counts.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([n, c]) => `${n} ×${c}`)
    .join(", ");

  const summary = [
    `- Logging started ${firstLogged}; ${byDay.size} day${byDay.size === 1 ? "" : "s"} with food logged since, ${unlogged} day${unlogged === 1 ? "" : "s"} with nothing logged (unknown, not zero).`,
    full.length
      ? `- On ${full.length} fully-logged day${full.length === 1 ? "" : "s"}: average ${avg(full.map((t) => t.kcal))} kcal, ${avg(full.map((t) => t.p))}g protein.`
      : "- No fully-logged days yet (each logged day has under two main meals), so averages would understate intake.",
    train.length && rest.length
      ? `- Training days avg ${avg(train.map((t) => t.kcal))} kcal / ${avg(train.map((t) => t.p))}g P vs rest days ${avg(rest.map((t) => t.kcal))} kcal / ${avg(rest.map((t) => t.p))}g P.`
      : "",
    top ? `- Most-logged foods: ${top}.` : "",
  ].filter(Boolean);

  return `FOOD HISTORY (StrengthLab food log, ${start} → yesterday — fetched because the athlete asked about food):
${summary.join("\n")}
Per day (B/L/D/S = breakfast/lunch/dinner/snack, number after each food = kcal):
${lines.join("\n")}
Use this for questions about eating patterns, consistency, protein, training vs rest days and go-to meals; when suggesting meals, prefer foods they already eat. Days missing from the list weren't logged — never read them as days without food.`;
}

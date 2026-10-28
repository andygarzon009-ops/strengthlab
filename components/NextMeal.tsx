"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { Meal } from "@/lib/meals";
import { planDay, type MealSlot } from "@/lib/nextMeal";
import { setPendingMeal } from "@/lib/pendingMeal";
import type { RecentMeal } from "@/lib/foodLog";
import type { RoomLeft } from "@/lib/roomLeft";
import type { Recipe } from "@/lib/recipes";
import { useSheetBack, SheetClose } from "@/components/useSheetBack";
import { CARBS, FAT, PROTEIN } from "@/components/FuelCharts";
import { scaledAmount, servingsLabel } from "@/lib/recipeScale";

const MEAL_WORD: Record<Meal, string> = { BREAKFAST: "breakfast", LUNCH: "lunch", DINNER: "dinner", SNACK: "a snack" };

// The meal coming up depends on the phone's clock, which the server can't
// know; null during SSR so the first client render matches it.
const noop = () => () => {};
const useHourNow = () => useSyncExternalStore(noop, () => new Date().getHours(), () => null);

/// Past meals that best fit this meal's share of what's left: protein
/// closest to the target matters most, going over the calories counts against
/// it, and a meal usually eaten at this time of day gets a nudge. Anything
/// well under half the budget (a handful of dates) isn't a meal, and only
/// counts when the suggestion is a snack.
function bestFits(recent: RecentMeal[], room: RoomLeft, meal: Meal): RecentMeal[] {
  const snack = meal === "SNACK";
  const score = (r: RecentMeal) => {
    const p = r.items.reduce((s, it) => s + it.proteinG, 0);
    const over = Math.max(0, r.kcal - room.kcal) / Math.max(room.kcal, 200);
    const under = Math.max(0, room.kcal - r.kcal) / Math.max(room.kcal, 200);
    const protein = Math.abs(p - room.proteinG) / Math.max(room.proteinG, 20);
    // Closing the gap after dinner, any small high-protein meal will do —
    // a whey shake logged at lunch is as good a snack as one logged at night.
    return protein * 0.6 + over * 1.5 + under * 0.3 + (r.meal === meal ? 0 : snack ? 0.1 : 0.35);
  };
  return recent
    .filter((r) => r.kcal <= room.kcal * (snack ? 1.3 : 1.15))
    .filter((r) => (snack ? r.kcal >= Math.min(100, room.kcal * 0.25) : r.kcal >= room.kcal * 0.5 && r.meal !== "SNACK"))
    .sort((a, b) => score(a) - score(b))
    .slice(0, 3);
}

const proteinOf = (r: RecentMeal) => Math.round(r.items.reduce((s, it) => s + it.proteinG, 0));

const MEAL_LABEL: Record<Meal, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner", SNACK: "Snack" };
const MEAL_ICON: Record<Meal, string> = { BREAKFAST: "☀️", LUNCH: "🍽️", DINNER: "🌙", SNACK: "🍎" };
const FUEL_LIME = "#a3e635";

/// Run `fn` once the browser is idle, so recipe calls never compete with the
/// Fuel page itself painting and hydrating.
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 600);
  return () => window.clearTimeout(id);
}

/// Protein / carbs / fat as a thin strip, by their share of the calories.
function MacroStrip({ r }: { r: Recipe }) {
  const p = r.proteinG * 4;
  const c = r.carbsG * 4;
  const f = r.fatG * 9;
  if (p + c + f <= 0) return null;
  return (
    <span className="flex h-1 gap-[2px] rounded-full overflow-hidden mt-1.5 max-w-[160px]" aria-hidden>
      <span className="rounded-full" style={{ flex: p, background: PROTEIN }} />
      <span className="rounded-full" style={{ flex: c, background: CARBS }} />
      <span className="rounded-full" style={{ flex: f, background: FAT }} />
    </span>
  );
}

/// "Today's meals" on Fuel, under the hero while today is open: breakfast,
/// lunch, dinner and snack as a day plan. Logged ones are checked off, the
/// next one is open, and any of them opens to recipes (AI, fetched only for
/// the open meal and only once the page is idle) or your own past meals that
/// fit its target.
export default function NextMeal({
  room: dayRoom,
  dayTargetKcal,
  dayTargetProteinG,
  logged,
  loggedByMeal,
  phase,
  recent,
  batchServings = null,
}: {
  /// What's left of the whole day.
  room: RoomLeft;
  dayTargetKcal: number;
  dayTargetProteinG: number;
  /// Meal types already logged today.
  logged: string[];
  /// What each logged meal came to, for its row.
  loggedByMeal: Record<string, { kcal: number; name: string }>;
  phase: string;
  recent: RecentMeal[];
  /// Meal-prep batch size (Fuel settings): recipes open at it and log one
  /// serving. Null when they don't meal prep.
  batchServings?: number | null;
}) {
  const hour = useHourNow();
  const slots =
    hour == null
      ? null
      : planDay(dayRoom, hour, new Set(logged), { kcal: dayTargetKcal, proteinG: dayTargetProteinG });
  const nextMeal = slots?.find((sl) => sl.status === "next")?.meal ?? null;
  // The open meal: the next one until the athlete picks another (or closes it).
  const [picked, setPicked] = useState<Meal | null | undefined>(undefined);
  const sel = picked === undefined ? nextMeal : picked;
  const [src, setSrc] = useState<"rec" | "mine">("rec");
  const [recipes, setRecipes] = useState<Partial<Record<Meal, Recipe[]>>>({});
  const [loading, setLoading] = useState<Partial<Record<Meal, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Meal, string>>>({});
  // The recipe in the sheet: which meal's list and where in it.
  const [sheet, setSheet] = useState<{ meal: Meal; idx: number } | null>(null);
  const router = useRouter();
  // Back swipe closes the recipe and stays on Fuel.
  const { dismiss, grab } = useSheetBack(sheet != null, () => setSheet(null));
  const [swapping, setSwapping] = useState<string | null>(null);
  // Servings in the open recipe; the ingredients and macros follow it.
  const [serv, setServ] = useState(1);
  // Whether "Ate it" logs every serving on screen or just one (a batch).
  const [logAll, setLogAll] = useState(true);

  const slotOf = (m: Meal) => slots?.find((sl) => sl.meal === m) ?? null;
  const openRecipe = (m: Meal, i: number) => {
    const batch = m === "SNACK" ? null : batchServings;
    setServ(batch ?? 1);
    setLogAll(batch == null);
    setSheet({ meal: m, idx: i });
  };

  // Recipes are kept for the day per meal and calorie budget, so leaving and
  // coming back to Fuel (or flipping between meals) doesn't pay for a new batch.
  const cacheKey = (m: Meal, kcal: number) =>
    `nextmeal:v4:${new Date().toDateString()}:${m}:${Math.round(kcal / 100)}`;

  const fetchRecipes = async (m: Meal, extra: Record<string, unknown> = {}) => {
    const budget = slotOf(m)?.budget ?? dayRoom;
    const res = await fetch("/api/food/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...budget, meal: m, phase, ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(body.recipes)) throw new Error(body.error ?? "Couldn't load recipes — try again");
    return body.recipes as Recipe[];
  };

  const save = (m: Meal, list: Recipe[]) => {
    try {
      sessionStorage.setItem(cacheKey(m, slotOf(m)?.budget.kcal ?? 0), JSON.stringify(list));
    } catch {}
  };

  const loadRecipes = async (m: Meal) => {
    if (recipes[m] || loading[m]) return;
    try {
      const cached = sessionStorage.getItem(cacheKey(m, slotOf(m)?.budget.kcal ?? 0));
      if (cached) {
        setRecipes((r) => ({ ...r, [m]: JSON.parse(cached) }));
        return;
      }
    } catch {}
    setLoading((l) => ({ ...l, [m]: true }));
    setErrors((e) => ({ ...e, [m]: undefined }));
    try {
      const list = await fetchRecipes(m);
      setRecipes((r) => ({ ...r, [m]: list }));
      save(m, list);
    } catch (e) {
      setErrors((er) => ({ ...er, [m]: e instanceof Error ? e.message : "Couldn't load recipes — try again" }));
    } finally {
      setLoading((l) => ({ ...l, [m]: false }));
    }
  };

  // The open meal's recipes load on their own — but only once the page is
  // idle, so the rest of Fuel is on screen and usable first.
  const wantRecipes = sel != null && src === "rec" && !recipes[sel] && !loading[sel] && !errors[sel];
  useEffect(() => {
    if (!wantRecipes || sel == null) return;
    return whenIdle(() => loadRecipes(sel));
    // loadRecipes reads the latest state; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantRecipes, sel]);

  const swap = async (m: Meal, i: number, tweak: "other" | "quicker" | "no-cook") => {
    const list = recipes[m];
    if (!list || swapping) return;
    setSwapping(tweak);
    try {
      const [next] = await fetchRecipes(m, { count: 1, tweak, exclude: list.map((r) => r.title) });
      const updated = list.map((r, j) => (j === i ? next : r));
      setRecipes((rs) => ({ ...rs, [m]: updated }));
      save(m, updated);
    } catch {
      // Keep the current recipe; the chip just stops spinning.
    } finally {
      setSwapping(null);
    }
  };

  // Freeze the page behind the recipe sheet.
  useEffect(() => {
    if (sheet == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheet, dismiss]);

  if (!slots || dayRoom.kcal < 150) return null;

  const selSlot = sel ? slotOf(sel) : null;
  const askMeal = selSlot ?? slots.find((sl) => sl.status === "next") ?? null;
  const askNext = !askMeal
    ? `I have ${dayRoom.kcal.toLocaleString()} kcal and ${dayRoom.proteinG} g protein left today. What should I eat?`
    : askMeal.snacksToClose != null
      ? `My main meals are done and I'm still ${dayRoom.kcal.toLocaleString()} kcal and ${dayRoom.proteinG} g protein short of today's target. What snacks should I have to close the gap?`
      : `I have ${dayRoom.kcal.toLocaleString()} kcal and ${dayRoom.proteinG} g protein left today. What should I eat for ${MEAL_WORD[askMeal.meal]} — around ${askMeal.budget.kcal.toLocaleString()} kcal and ${askMeal.budget.proteinG} g protein?`;

  // The recipe sheet's meal and recipe.
  const sheetSlot = sheet ? slotOf(sheet.meal) : null;
  const open = sheet ? recipes[sheet.meal]?.[sheet.idx] ?? null : null;
  const closing = sheetSlot?.snacksToClose != null;
  const mealWord = sheet ? MEAL_WORD[sheet.meal] : "your next meal";
  const meal = sheet?.meal ?? null;
  const k = open ? serv / (open.servings || 1) : 1;
  const sc = (n: number) => Math.round(n * k);

  const logRecipe = (r: Recipe, servings: number) => {
    const k = servings / (r.servings || 1);
    // Hand off to the meal logger only once the recipe's back step is gone,
    // so the logger's own sheet gets a clean one.
    dismiss(() => setPendingMeal({
      review: {
        items: [
          {
            name: r.title,
            portion: `${servingsLabel(servings)} (recipe)`,
            kcal: Math.round(r.kcal * k),
            proteinG: Math.round(r.proteinG * k),
            carbsG: Math.round(r.carbsG * k),
            fatG: Math.round(r.fatG * k),
            fiberG: r.fiberG == null ? null : Math.round(r.fiberG * k),
          },
        ],
        photoUrl: null,
      },
    }));
  };

  const statusLine = (sl: MealSlot) => {
    if (sl.status === "logged") return loggedByMeal[sl.meal]?.name ?? "Logged";
    if (sl.snacksToClose != null)
      return sl.snacksToClose === 1 ? "One snack closes the gap" : `About ${sl.snacksToClose} snacks close the gap`;
    if (sl.status === "next") return "Up next";
    if (sl.status === "passed") return "Not logged";
    return `aim ~${sl.budget.kcal.toLocaleString()} kcal · ${sl.budget.proteinG} g`;
  };

  return (
    <section
      className="rounded-2xl p-4 mb-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
    >
      <h2 className="text-[15px] font-bold tracking-tight">Today&apos;s meals</h2>
      <p className="text-[12px] mt-0.5 tabular-nums" style={{ color: "var(--fg-muted)" }}>
        <b className="font-semibold" style={{ color: "var(--fg)" }}>{dayRoom.kcal.toLocaleString()} kcal</b> and{" "}
        <b className="font-semibold" style={{ color: "var(--fg)" }}>{dayRoom.proteinG} g</b> protein left · tap a meal for ideas
      </p>

      <div className="flex flex-col gap-1.5 mt-3">
        {slots.map((sl) => {
          const isOpen = sel === sl.meal;
          const done = sl.status === "logged";
          const list = recipes[sl.meal];
          const fits = isOpen && src === "mine" ? bestFits(recent, sl.budget, sl.meal) : [];
          return (
            <div
              key={sl.meal}
              className="rounded-[14px] overflow-hidden"
              style={{
                border: `1px solid ${isOpen ? "rgba(163,230,53,0.35)" : "var(--border)"}`,
                background: isOpen
                  ? "radial-gradient(120% 80% at 0% 0%, rgba(163,230,53,0.09), transparent 55%), rgba(255,255,255,0.02)"
                  : "rgba(255,255,255,0.02)",
              }}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => {
                  setPicked(isOpen ? null : sl.meal);
                  // A meal the athlete picked loads now; only the one opened
                  // for them waits for the page to go idle.
                  if (!isOpen && src === "rec") loadRecipes(sl.meal);
                }}
                className="w-full grid items-center gap-2.5 px-3 py-[11px] text-left"
                style={{ gridTemplateColumns: "30px minmax(0,1fr) auto 14px" }}
              >
                <span
                  className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[14px] font-extrabold"
                  style={done ? { background: "rgba(34,197,94,0.14)", color: "var(--accent)" } : { background: "var(--bg-elevated)" }}
                  aria-hidden
                >
                  {done ? "✓" : MEAL_ICON[sl.meal]}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{MEAL_LABEL[sl.meal]}</span>
                  <span
                    className="block text-[11.5px] font-medium truncate mt-px tabular-nums"
                    style={{ color: sl.status === "next" ? FUEL_LIME : "var(--fg-muted)" }}
                  >
                    {statusLine(sl)}
                  </span>
                </span>
                <span
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ fontFamily: "var(--font-geist-mono)", color: done ? "var(--fg-dim)" : "var(--fg-muted)" }}
                >
                  {done ? (loggedByMeal[sl.meal]?.kcal ?? 0).toLocaleString() : `~${sl.budget.kcal.toLocaleString()}`}
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--fg-muted)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  style={{ transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform 160ms" }}
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>

              {isOpen && (
                <div className="px-3 pb-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div role="tablist" className="inline-flex gap-0.5 p-0.5 rounded-[9px]" style={{ background: "var(--bg-elevated)" }}>
                      {(
                        [
                          ["rec", "Recipes"],
                          ["mine", "Your usual"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={src === key}
                          onClick={() => {
                            setSrc(key);
                            if (key === "rec") loadRecipes(sl.meal);
                          }}
                          className="px-2.5 py-1 rounded-[7px] text-[11.5px] font-semibold"
                          style={
                            src === key
                              ? { background: "var(--bg-card)", color: "var(--fg)", boxShadow: "0 0 0 1px var(--border-strong)" }
                              : { color: "var(--fg-muted)" }
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {src === "rec" && (
                      <Link href="/profile/fuel" className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>
                        Diet settings ›
                      </Link>
                    )}
                  </div>
                  {done && (
                    <p className="text-[11px] mb-0.5" style={{ color: "var(--fg-dim)" }}>
                      Ideas for next time, around ~{sl.budget.kcal.toLocaleString()} kcal.
                    </p>
                  )}

                  {src === "rec" &&
                    (list ? (
                      list.map((r, i) => (
                        <div
                          key={`${r.title}-${i}`}
                          className="flex items-center gap-2.5 py-2"
                          style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold truncate">{r.title}</span>
                            <span className="block text-[11.5px] tabular-nums mt-0.5" style={{ color: "var(--fg-muted)" }}>
                              {r.minutes ? `${r.minutes} min · ` : ""}
                              {r.kcal.toLocaleString()} kcal · {r.proteinG} g protein
                            </span>
                            <MacroStrip r={r} />
                          </span>
                          <button
                            type="button"
                            onClick={() => openRecipe(sl.meal, i)}
                            className="shrink-0 h-[30px] px-3 rounded-full text-[12px] font-bold"
                            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
                          >
                            View
                          </button>
                        </div>
                      ))
                    ) : errors[sl.meal] ? (
                      <div className="py-2">
                        <p className="text-[12.5px]" style={{ color: "#fca5a5" }}>{errors[sl.meal]}</p>
                        <button
                          type="button"
                          onClick={() => loadRecipes(sl.meal)}
                          className="text-[12.5px] font-semibold mt-1"
                          style={{ color: "#86efac" }}
                        >
                          Try again
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 py-1.5" aria-live="polite">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: "var(--bg-elevated)" }} />
                        ))}
                        <p className="text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
                          Writing {MEAL_WORD[sl.meal]} recipes that fit…
                        </p>
                      </div>
                    ))}

                  {src === "mine" &&
                    (fits.length ? (
                      fits.map((r, i) => (
                        <div
                          key={r.key}
                          className="flex items-center gap-2.5 py-2"
                          style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
                        >
                          {r.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.photoUrl} alt="" className="w-9 h-9 rounded-[10px] object-cover shrink-0" />
                          ) : (
                            <span
                              className="w-9 h-9 rounded-[10px] shrink-0 flex items-center justify-center text-[15px]"
                              style={{ background: "var(--bg-elevated)" }}
                              aria-hidden
                            >
                              {MEAL_ICON[sl.meal]}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold truncate">{r.title}</span>
                            <span className="block text-[11.5px] tabular-nums mt-0.5" style={{ color: "var(--fg-muted)" }}>
                              {r.kcal.toLocaleString()} kcal · {proteinOf(r)} g protein
                              {r.times > 1 ? ` · ${r.times}×` : ""}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setPendingMeal({ review: { items: r.items, photoUrl: r.photoUrl } })}
                            className="shrink-0 h-[30px] px-3 rounded-full text-[12px] font-bold"
                            style={{ background: "var(--accent)", color: "#04130a" }}
                          >
                            + Log
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12.5px] py-2" style={{ color: "var(--fg-muted)" }}>
                        Nothing you&apos;ve logged fits this one. Try Recipes or ask your coach.
                      </p>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Link
        href={`/fuel?coach=1&ask=${encodeURIComponent(askNext)}`}
        className="flex items-center justify-center gap-2 w-full min-h-[46px] rounded-[14px] mt-3 text-[14px] font-semibold"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
      >
        <Sparkles size={16} strokeWidth={2.2} />
        Ask coach
      </Link>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => dismiss()}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={open.title}
              className="relative w-full max-w-lg rounded-t-3xl overflow-y-auto"
              style={{
                maxHeight: "92dvh",
                background: "var(--bg-card)",
                border: `1px solid rgba(163,230,53,0.3)`,
                borderBottom: 0,
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <SheetClose onClick={() => dismiss()} label="Close recipe" />
              {/* Drag the header down to close. */}
              <div
                {...grab}
                className="px-4 pt-2.5 pb-4"
                style={{ background: "radial-gradient(130% 120% at 0% 0%, rgba(163,230,53,0.16), transparent 55%)" }}
              >
                <div className="flex justify-center mb-3">
                  <span className="w-10 h-1 rounded-full" style={{ background: "var(--border-strong)" }} />
                </div>
                <span
                  className="inline-block text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-[3px] rounded-full"
                  style={{ background: "rgba(163,230,53,0.16)", color: "#d9f99d" }}
                >
                  {closing ? "Snack to close the gap" : `Recipe for ${meal === "DINNER" ? "tonight" : mealWord}`}
                </span>
                <h3 className="text-[19px] font-bold tracking-tight mt-2 leading-snug">{open.title}</h3>
                {open.blurb && (
                  <p className="text-[13px] mt-1 leading-snug" style={{ color: "var(--fg-muted)" }}>
                    {open.blurb}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[12px]" style={{ color: "var(--fg-muted)" }}>
                  {open.minutes > 0 && <span>⏱ {open.minutes} min</span>}
                  {open.usesYourFoods && <span>{open.usesYourFoods}</span>}
                </div>
                <div
                  className="flex items-center justify-between mt-3 rounded-xl pl-3 pr-1 py-1"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <span className="text-[12.5px] font-semibold">Servings</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Fewer servings"
                      disabled={serv <= 0.5}
                      onClick={() => setServ((s) => Math.max(0.5, s - 0.25))}
                      className="w-9 h-9 rounded-lg text-[18px] font-semibold disabled:opacity-30"
                      style={{ background: "var(--bg-elevated)" }}
                    >
                      −
                    </button>
                    <span className="w-12 text-center text-[16px] font-bold tabular-nums" aria-live="polite">
                      {+serv.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      aria-label="More servings"
                      disabled={serv >= 8}
                      onClick={() => setServ((s) => Math.min(8, s + 0.25))}
                      className="w-9 h-9 rounded-lg text-[18px] font-semibold disabled:opacity-30"
                      style={{ background: "var(--bg-elevated)" }}
                    >
                      +
                    </button>
                  </div>
                </div>
                {serv > 1 && (
                  <div className="flex items-center justify-between mt-2 text-[12px]">
                    <span style={{ color: "var(--fg-muted)" }}>When you log it</span>
                    <div className="flex rounded-lg p-[2px]" style={{ background: "rgba(255,255,255,0.04)" }}>
                      {(
                        [
                          [false, "1 serving"],
                          [true, `All ${+serv.toFixed(2)}`],
                        ] as const
                      ).map(([all, label]) => (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={logAll === all}
                          onClick={() => setLogAll(all)}
                          className="px-2.5 py-1 rounded-md font-semibold"
                          style={{
                            background: logAll === all ? "var(--bg-elevated)" : "transparent",
                            color: logAll === all ? "var(--fg)" : "var(--fg-muted)",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-1.5 mt-3">
                  {(
                    [
                      [sc(open.kcal).toLocaleString(), "kcal", "var(--fg)"],
                      [`${sc(open.proteinG)} g`, "protein", PROTEIN],
                      [`${sc(open.carbsG)} g`, "carbs", CARBS],
                      [`${sc(open.fatG)} g`, "fat", FAT],
                    ] as const
                  ).map(([v, l, c]) => (
                    <div key={l} className="rounded-[10px] py-2 px-1 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <b className="block text-[15px] tabular-nums" style={{ color: c }}>{v}</b>
                      <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>{l}</span>
                    </div>
                  ))}
                </div>
                {serv !== 1 && (
                  <p className="text-[11.5px] mt-1.5 tabular-nums" style={{ color: "var(--fg-muted)" }}>
                    For all {+serv.toFixed(2)} servings · one serving is {open.kcal.toLocaleString()} kcal, {open.proteinG} g protein
                  </p>
                )}
              </div>

              <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="flex justify-between text-[11px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: "var(--fg-muted)" }}>
                  Ingredients
                  <span className="normal-case tracking-normal font-medium" style={{ color: "var(--fg-dim)" }}>
                    for {servingsLabel(serv)}
                  </span>
                </p>
                <div className="flex flex-col gap-1.5 text-[13px]">
                  {open.ingredients.map((g, i) => (
                    <div key={i} className="flex justify-between gap-2">
                      <span className="min-w-0">
                        {g.name}
                        {g.usual && (
                          <span className="ml-1.5 text-[10px] font-bold" style={{ color: "#86efac" }}>
                            usual
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums whitespace-nowrap" style={{ color: "var(--fg-muted)" }}>
                        {scaledAmount(g, k)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="flex justify-between text-[11px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: "var(--fg-muted)" }}>
                  Steps
                  <span className="normal-case tracking-normal font-medium" style={{ color: "var(--fg-dim)" }}>
                    {open.steps.length}
                  </span>
                </p>
                <ol className="flex flex-col gap-2.5 text-[13.5px] leading-snug">
                  {open.steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span
                        className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold tabular-nums mt-px"
                        style={{ background: "rgba(163,230,53,0.16)", color: "#d9f99d" }}
                      >
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                {(
                  [
                    ["other", "↻ Something else"],
                    ["quicker", "Quicker"],
                    ["no-cook", "No cooking"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={!!swapping}
                    onClick={() => sheet && swap(sheet.meal, sheet.idx, key)}
                    className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-full disabled:opacity-50"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--fg-muted)" }}
                  >
                    {swapping === key ? "Finding one…" : label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 px-4 pt-3 pb-4" style={{ borderTop: "1px solid var(--border)" }}>
                <Link
                  href={`/fuel?coach=1&ask=${encodeURIComponent(
                    `I'm thinking of making ${open.title} for ${mealWord} (${servingsLabel(serv)}: ${sc(open.kcal)} kcal, ${sc(open.proteinG)} g protein). Does it fit my day, and how would you tweak it?`,
                  )}`}
                  onClick={(e) => {
                    // Close first, then open the coach, so back from the
                    // coach lands on Fuel rather than on a closed sheet.
                    e.preventDefault();
                    const href = e.currentTarget.getAttribute("href")!;
                    dismiss(() => router.push(href));
                  }}
                  className="flex-1 min-h-[44px] rounded-xl flex items-center justify-center text-[13.5px] font-semibold"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
                >
                  Ask coach
                </Link>
                <button
                  type="button"
                  onClick={() => logRecipe(open, logAll ? serv : 1)}
                  className="flex-1 min-h-[44px] rounded-xl text-[13.5px] font-semibold"
                  style={{ background: "var(--accent)", color: "#0a0a0a" }}
                >
                  {serv === 1 || !logAll ? "Ate a serving · log" : `Ate ${+serv.toFixed(2)} · log`}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}

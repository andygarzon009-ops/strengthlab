"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { resolveMealName, useHiddenMeals, useMealNameOverrides } from "@/lib/mealNames";
import { CARBS, FAT, PROTEIN } from "@/components/FuelCharts";
import { scaledAmount, servingsLabel } from "@/lib/recipeScale";
import { PAGE, PAGE_INK, PAGE_RGB } from "@/lib/macroColor";

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

const MEAL_LABEL: Record<Meal, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner", SNACK: "Snack" };
const MEAL_ICON: Record<Meal, string> = { BREAKFAST: "☀️", LUNCH: "🍽️", DINNER: "🌙", SNACK: "🍎" };

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

/// "Next meal" on Fuel, under the hero while today is open: pick breakfast,
/// lunch, dinner or snack (the next one is picked for you), see its target,
/// swipe recipe cards for it (AI, fetched only for the meal on screen and,
/// for the one picked for you, only once the page is idle) and log one of
/// your usual meals in a tap.
export default function NextMeal({
  room: dayRoom,
  dayTargetKcal,
  dayTargetProteinG,
  logged,
  loggedByMeal,
  phase,
  recent,
  batchServings = null,
  todayMeals = {},
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
  /// Logged meals that are one named meal, by meal type.
  todayMeals?: Record<string, { sig: string; name: string | null }>;
}) {
  const hour = useHourNow();
  const slots =
    hour == null
      ? null
      : planDay(dayRoom, hour, new Set(logged), { kcal: dayTargetKcal, proteinG: dayTargetProteinG });
  const nextMeal = slots?.find((sl) => sl.status === "next")?.meal ?? null;
  // The meal on screen: the next one until the athlete picks another.
  const [picked, setPicked] = useState<Meal | null>(null);
  const sel = picked ?? nextMeal;
  // Which recipe card is in view, for the dots under the carousel.
  const [cardIdx, setCardIdx] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const [recipes, setRecipes] = useState<Partial<Record<Meal, Recipe[]>>>({});
  const [loading, setLoading] = useState<Partial<Record<Meal, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Meal, string>>>({});
  // What each meal's recipes were built around ("" = anything), and the
  // ingredients being typed for the next batch.
  const [have, setHave] = useState<Partial<Record<Meal, string>>>({});
  const [draft, setDraft] = useState("");
  // The recipe in the sheet: which meal's list and where in it.
  const [sheet, setSheet] = useState<{ meal: Meal; idx: number } | null>(null);
  const router = useRouter();
  // A meal renamed anywhere on Fuel shows here at once.
  const nameOverrides = useMealNameOverrides();
  const hiddenMeals = useHiddenMeals();
  const nameOf = (r: RecentMeal) => resolveMealName(nameOverrides, r.key, r.named ? r.title : null, r.items);
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
    `nextmeal:v5:${new Date().toDateString()}:${m}:${Math.round(kcal / 100)}`;

  const fetchRecipes = async (m: Meal, extra: Record<string, unknown> = {}) => {
    const budget = slotOf(m)?.budget ?? dayRoom;
    const res = await fetch("/api/food/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...budget, meal: m, phase, have: have[m] ?? "", ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(body.recipes)) throw new Error(body.error ?? "Couldn't load recipes — try again");
    return body.recipes as Recipe[];
  };

  const save = (m: Meal, list: Recipe[], built: string) => {
    try {
      sessionStorage.setItem(cacheKey(m, slotOf(m)?.budget.kcal ?? 0), JSON.stringify({ have: built, list }));
    } catch {}
  };

  /// Today's batch for this meal, if one was already made (leaving Fuel and
  /// coming back, or flipping between meals, doesn't ask again).
  const restore = (m: Meal) => {
    if (recipes[m] || loading[m]) return;
    try {
      const cached = sessionStorage.getItem(cacheKey(m, slotOf(m)?.budget.kcal ?? 0));
      if (!cached) return;
      const { have: built, list } = JSON.parse(cached) as { have: string; list: Recipe[] };
      setRecipes((r) => ({ ...r, [m]: list }));
      setHave((h) => ({ ...h, [m]: built }));
    } catch {}
  };

  /// Recipes are only written once asked: around what the athlete says
  /// they're cooking with, or anything ("" — Surprise me).
  const generate = async (m: Meal, ingredients: string) => {
    if (loading[m]) return;
    const built = ingredients.trim().slice(0, 200);
    setHave((h) => ({ ...h, [m]: built }));
    setLoading((l) => ({ ...l, [m]: true }));
    setErrors((e) => ({ ...e, [m]: undefined }));
    try {
      const list = await fetchRecipes(m, { have: built });
      setRecipes((r) => ({ ...r, [m]: list }));
      save(m, list, built);
    } catch (e) {
      setErrors((er) => ({ ...er, [m]: e instanceof Error ? e.message : "Couldn't load recipes — try again" }));
    } finally {
      setLoading((l) => ({ ...l, [m]: false }));
    }
  };

  /// Back to the "what are you cooking with?" step for this meal.
  const startOver = (m: Meal) => {
    setDraft(have[m] ?? "");
    setRecipes((r) => ({ ...r, [m]: undefined }));
    setErrors((e) => ({ ...e, [m]: undefined }));
    try {
      sessionStorage.removeItem(cacheKey(m, slotOf(m)?.budget.kcal ?? 0));
    } catch {}
  };

  // The open meal's earlier batch comes back once the page is idle, so the
  // rest of Fuel is on screen and usable first.
  useEffect(() => {
    if (sel == null) return;
    return whenIdle(() => restore(sel));
    // restore reads the latest state; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const swap = async (m: Meal, i: number, tweak: "other" | "quicker" | "no-cook") => {
    const list = recipes[m];
    if (!list || swapping) return;
    setSwapping(tweak);
    try {
      const [next] = await fetchRecipes(m, { count: 1, tweak, exclude: list.map((r) => r.title) });
      const updated = list.map((r, j) => (j === i ? next : r));
      setRecipes((rs) => ({ ...rs, [m]: updated }));
      save(m, updated, have[m] ?? "");
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
  const askMeal = selSlot;
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

  const chipTag = (sl: MealSlot) =>
    sl.status === "logged" ? "logged" : sl.status === "next" ? "next" : `~${sl.budget.kcal.toLocaleString()}`;
  const pick = (m: Meal) => {
    setPicked(m);
    setCardIdx(0);
    railRef.current?.scrollTo({ left: 0 });
    // A batch already made for this meal today comes straight back.
    restore(m);
  };

  const list = sel ? recipes[sel] : undefined;
  // The card closest to this meal's protein without running over its calories.
  const bestIdx =
    list && selSlot
      ? list.reduce(
          (best, r, i, all) => {
            const cost = (x: Recipe) =>
              Math.abs(x.proteinG - selSlot.budget.proteinG) + Math.max(0, x.kcal - selSlot.budget.kcal) / 10;
            return cost(r) < cost(all[best]) ? i : best;
          },
          0,
        )
      : -1;
  const fits = selSlot
    ? bestFits(recent.filter((r) => !hiddenMeals.has(r.key)), selSlot.budget, selSlot.meal)
    : [];
  const loggedHere = (() => {
    if (selSlot?.status !== "logged") return null;
    const base = loggedByMeal[selSlot.meal];
    const id = todayMeals[selSlot.meal];
    if (!base || !id) return base ?? null;
    // Renamed this visit wins, then the saved name, then the automatic one.
    const local = nameOverrides[id.sig];
    const name = local !== undefined ? local : id.name;
    return { ...base, name: name ?? base.name };
  })();

  return (
    <section
      className="rounded-2xl p-4 mb-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
    >
      <h2 className="text-[15px] font-bold tracking-tight">Next meal</h2>

      {/* Pick the meal. The next one is chosen for you. */}
      <div
        role="tablist"
        aria-label="Meal"
        className="grid grid-cols-4 gap-1 p-[3px] rounded-xl mt-3"
        style={{ background: "var(--bg-elevated)" }}
      >
        {slots.map((sl) => {
          const on = sel === sl.meal;
          return (
            <button
              key={sl.meal}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(sl.meal)}
              className="flex flex-col items-center gap-px pt-[7px] pb-1.5 rounded-[9px] text-[12.5px] font-semibold"
              style={
                on
                  ? { background: "var(--bg-card)", color: "var(--fg)", boxShadow: "0 0 0 1px var(--border-strong)" }
                  : { color: "var(--fg-muted)" }
              }
            >
              {MEAL_LABEL[sl.meal]}
              <span
                className="text-[9.5px] font-semibold uppercase tabular-nums"
                style={{ letterSpacing: "0.04em", color: sl.status === "next" ? PAGE : "var(--fg-dim)" }}
              >
                {chipTag(sl)}
              </span>
            </button>
          );
        })}
      </div>

      {selSlot && (
        <>
          {loggedHere && (
            <p className="text-[12px] mt-3 tabular-nums" style={{ color: "var(--fg-muted)" }}>
              Logged: {loggedHere.name} · {loggedHere.kcal.toLocaleString()} kcal. Ideas for next time:
            </p>
          )}
          {/* This meal's target. */}
          <div
            className="flex items-center gap-2.5 mt-3 px-3 py-2.5 rounded-xl"
            style={{
              background: `radial-gradient(120% 140% at 0% 0%, rgba(${PAGE_RGB},0.12), transparent 60%), rgba(255,255,255,0.02)`,
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="text-[20px] font-semibold tabular-nums leading-none"
              style={{ fontFamily: "var(--font-geist-mono)", letterSpacing: "-0.04em", color: PAGE }}
            >
              ~{selSlot.budget.kcal.toLocaleString()}
              <span className="text-[11px] font-semibold ml-1" style={{ fontFamily: "var(--font-geist-sans)", letterSpacing: 0, color: "var(--fg-dim)" }}>
                kcal
              </span>
            </span>
            <span className="text-[12px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
              <b className="font-semibold" style={{ color: "var(--fg)" }}>{selSlot.budget.proteinG} g</b> protein
            </span>
            <span className="ml-auto text-[11px] text-right" style={{ color: "var(--fg-dim)" }}>
              {selSlot.snacksToClose != null
                ? selSlot.snacksToClose === 1
                  ? "one snack closes the gap"
                  : `about ${selSlot.snacksToClose} snacks close the gap`
                : selSlot.status === "logged" || selSlot.status === "passed"
                  ? "your usual"
                  : "share of what's left"}
            </span>
          </div>

          <p
            className="flex items-baseline justify-between text-[10.5px] font-bold uppercase mt-3.5 mb-1.5"
            style={{ letterSpacing: "0.1em", color: "var(--fg-dim)" }}
          >
            Recipes for {MEAL_WORD[selSlot.meal].replace(/^a /, "")}
            <Link href="/profile/fuel" className="normal-case text-[11.5px] font-semibold" style={{ letterSpacing: 0, color: "var(--fg-muted)" }}>
              Diet settings ›
            </Link>
          </p>

          {list ? (
            <>
              <p className="flex items-center gap-1.5 text-[12px] mb-2 min-w-0" style={{ color: "var(--fg-muted)" }}>
                <span className="truncate">
                  {have[selSlot.meal] ? (
                    <>
                      Cooking with <b className="font-semibold" style={{ color: "var(--fg)" }}>{have[selSlot.meal]}</b>
                    </>
                  ) : (
                    "Any recipe"
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => startOver(selSlot.meal)}
                  className="shrink-0 font-semibold"
                  style={{ color: PAGE }}
                >
                  · Change
                </button>
              </p>
              <div
                ref={railRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const w = el.firstElementChild?.clientWidth ?? el.clientWidth;
                  setCardIdx(Math.round(el.scrollLeft / (w + 10)));
                }}
                className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1.5"
                style={{ scrollbarWidth: "none" }}
              >
                {list.map((r, i) => (
                  <article
                    key={`${r.title}-${i}`}
                    className="snap-start shrink-0 basis-[80%] rounded-2xl p-[13px] pb-3 flex flex-col gap-2.5"
                    style={{
                      background: `radial-gradient(130% 90% at 0% 0%, rgba(${PAGE_RGB},0.16), transparent 55%), var(--bg-elevated)`,
                      border: "1px solid var(--border-strong)",
                    }}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>
                      {r.minutes > 0 && <>⏱ {r.minutes} min</>}
                      {i === bestIdx && (
                        <span
                          className="ml-auto text-[10px] font-bold px-[7px] py-[3px] rounded-full"
                          style={{ background: `rgba(${PAGE_RGB},0.14)`, color: PAGE }}
                        >
                          Best fit
                        </span>
                      )}
                    </span>
                    <h3 className="text-[16px] font-bold tracking-tight leading-snug" style={{ textWrap: "balance" }}>
                      {r.title}
                    </h3>
                    {r.blurb && (
                      <p className="text-[12px] leading-snug -mt-1 line-clamp-2" style={{ color: "var(--fg-muted)" }}>
                        {r.blurb}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 mt-auto">
                      {(
                        [
                          [r.kcal.toLocaleString(), "kcal", "var(--fg)"],
                          [`${r.proteinG}g`, "protein", PROTEIN],
                          [`${r.carbsG}g`, "carbs", CARBS],
                        ] as const
                      ).map(([v, l, c]) => (
                        <span
                          key={l}
                          className="rounded-[10px] px-2 py-[7px]"
                          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}
                        >
                          <b
                            className="block text-[15px] font-semibold tabular-nums"
                            style={{ fontFamily: "var(--font-geist-mono)", letterSpacing: "-0.03em", color: c }}
                          >
                            {v}
                          </b>
                          <span className="text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.06em", color: "var(--fg-dim)" }}>
                            {l}
                          </span>
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => openRecipe(selSlot.meal, i)}
                        className="h-9 rounded-[11px] text-[12.5px] font-bold"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-strong)" }}
                      >
                        See recipe
                      </button>
                      <button
                        type="button"
                        onClick={() => logRecipe(r, 1)}
                        className="h-9 rounded-[11px] text-[12.5px] font-bold"
                        style={{ background: "var(--accent)", color: "#04130a" }}
                      >
                        Ate it · log
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {list.length > 1 && (
                <div className="flex justify-center gap-[5px] mt-0.5" aria-hidden>
                  {list.map((_, i) => (
                    <span
                      key={i}
                      className="h-[5px] rounded-full transition-all"
                      style={{ width: i === cardIdx ? 14 : 5, background: i === cardIdx ? PAGE : "var(--border-strong)" }}
                    />
                  ))}
                </div>
              )}
            </>
          ) : errors[selSlot.meal] ? (
            <div className="py-2">
              <p className="text-[12.5px]" style={{ color: "#fca5a5" }}>{errors[selSlot.meal]}</p>
              <button
                type="button"
                onClick={() => generate(selSlot.meal, have[selSlot.meal] ?? "")}
                className="text-[12.5px] font-semibold mt-1"
                style={{ color: "#86efac" }}
              >
                Try again
              </button>
            </div>
          ) : !loading[selSlot.meal] ? (
            // Before any recipes: what they're cooking with, or anything.
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) generate(selSlot.meal, draft);
              }}
              className="rounded-2xl p-3"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <label htmlFor="nextmeal-have" className="block text-[13px] font-semibold">
                What are you cooking with?
              </label>
              <div className="flex gap-2 mt-2">
                <input
                  id="nextmeal-have"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="e.g. chicken, rice, peppers"
                  enterKeyHint="go"
                  autoComplete="off"
                  maxLength={200}
                  className="min-w-0 flex-1 h-10 rounded-xl px-3 text-[14px] outline-none"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", color: "var(--fg)" }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="shrink-0 h-10 px-3.5 rounded-xl text-[13px] font-bold disabled:opacity-40"
                  style={{ background: PAGE, color: "#04130a" }}
                >
                  Find recipes
                </button>
              </div>
              <button
                type="button"
                onClick={() => generate(selSlot.meal, "")}
                className="w-full h-10 mt-2 rounded-xl text-[13px] font-semibold"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-strong)", color: "var(--fg)" }}
              >
                Surprise me · any recipe
              </button>
            </form>
          ) : (
            <div aria-live="polite">
              <div className="flex gap-2.5 -mx-4 px-4 overflow-hidden">
                {[0, 1].map((i) => (
                  <div key={i} className="shrink-0 basis-[80%] h-[204px] rounded-2xl animate-pulse" style={{ background: "var(--bg-elevated)" }} />
                ))}
              </div>
              <p className="text-[11.5px] mt-2" style={{ color: "var(--fg-muted)" }}>
                Writing {MEAL_WORD[selSlot.meal]} recipes that fit…
              </p>
            </div>
          )}

          {fits.length > 0 && (
            <>
              <p
                className="text-[10.5px] font-bold uppercase mt-3.5 mb-1.5"
                style={{ letterSpacing: "0.1em", color: "var(--fg-dim)" }}
              >
                Your usual · tap to log
              </p>
              <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
                {fits.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() =>
                      setPendingMeal({
                        review: { items: r.items, photoUrl: r.photoUrl, name: nameOf(r).named ? nameOf(r).title : undefined },
                      })
                    }
                    className="shrink-0 flex items-center gap-[7px] h-9 pl-1.5 pr-3 rounded-full text-[12.5px] font-semibold active:scale-95"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                  >
                    {r.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photoUrl} alt="" className="w-[26px] h-[26px] rounded-full object-cover" />
                    ) : (
                      <span
                        className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[13px]"
                        style={{ background: "var(--bg-card)" }}
                        aria-hidden
                      >
                        {MEAL_ICON[selSlot.meal]}
                      </span>
                    )}
                    <span className="max-w-[150px] truncate">{nameOf(r).title || r.title}</span>
                    <span className="text-[11px] tabular-nums" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--fg-dim)" }}>
                      {r.kcal.toLocaleString()}
                    </span>
                    <span className="font-extrabold" style={{ color: "var(--accent)" }} aria-hidden>
                      +
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* replace, not push: the coach strips ?coach=1 from the URL once it
          opens, so a pushed entry would be left as a second copy of Fuel and
          the page's back button would land on Fuel again. */}
      <Link
        replace
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
                border: `1px solid rgba(${PAGE_RGB},0.3)`,
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
                style={{ background: `radial-gradient(130% 120% at 0% 0%, rgba(${PAGE_RGB},0.16), transparent 55%)` }}
              >
                <div className="flex justify-center mb-3">
                  <span className="w-10 h-1 rounded-full" style={{ background: "var(--border-strong)" }} />
                </div>
                <span
                  className="inline-block text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-[3px] rounded-full"
                  style={{ background: `rgba(${PAGE_RGB},0.16)`, color: PAGE_INK }}
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
                        style={{ background: `rgba(${PAGE_RGB},0.16)`, color: PAGE_INK }}
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
                    // Close first, then open the coach in place (replace — see
                    // the Ask coach link below the card), so back still
                    // leaves Fuel in one step.
                    e.preventDefault();
                    const href = e.currentTarget.getAttribute("href")!;
                    dismiss(() => router.replace(href));
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

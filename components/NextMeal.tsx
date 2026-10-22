"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { Meal } from "@/lib/meals";
import { planNextMeal } from "@/lib/nextMeal";
import { setPendingMeal } from "@/lib/pendingMeal";
import type { RecentMeal } from "@/lib/foodLog";
import type { RoomLeft } from "@/lib/roomLeft";
import type { Recipe } from "@/lib/recipes";
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

/// "Next meal" on Fuel, under the hero while today is open: the athlete's own
/// past meals that fit what's left, a Recipes tab (AI, fetched only when
/// opened), and a hand-off to the coach.
export default function NextMeal({
  room: dayRoom,
  dayTargetKcal,
  logged,
  phase,
  recent,
  batchServings = null,
}: {
  /// What's left of the whole day.
  room: RoomLeft;
  dayTargetKcal: number;
  /// Meal types already logged today.
  logged: string[];
  phase: string;
  recent: RecentMeal[];
  /// Meal-prep batch size (Fuel settings): recipes open at it and log one
  /// serving. Null when they don't meal prep.
  batchServings?: number | null;
}) {
  const hour = useHourNow();
  const plan = hour == null ? null : planNextMeal(dayRoom, hour, new Set(logged), dayTargetKcal);
  const meal = plan?.meal ?? null;
  // This meal's share of the day — what suggestions and recipes aim for.
  const room = plan?.budget ?? dayRoom;
  const [tab, setTab] = useState<"mine" | "rec">("mine");
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  // Servings in the open recipe; the ingredients and macros follow it.
  const [serv, setServ] = useState(1);
  // Whether "Ate it" logs every serving on screen or just one (a batch).
  const [logAll, setLogAll] = useState(true);
  const openRecipe = (i: number) => {
    const batch = plan?.snacksToClose == null ? batchServings : null;
    setServ(batch ?? 1);
    setLogAll(batch == null);
    setOpenIdx(i);
  };

  // Recipes are kept for the session per meal and calorie budget, so leaving
  // and coming back to Fuel doesn't pay for a new batch.
  const cacheKey = meal ? `nextmeal:v3:${new Date().toDateString()}:${meal}:${Math.round(room.kcal / 100)}` : null;

  const fetchRecipes = async (extra: Record<string, unknown> = {}) => {
    const res = await fetch("/api/food/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...room, meal: meal ?? "meal", phase, ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(body.recipes)) throw new Error(body.error ?? "Couldn't load recipes — try again");
    return body.recipes as Recipe[];
  };

  const save = (list: Recipe[]) => {
    try {
      if (cacheKey) sessionStorage.setItem(cacheKey, JSON.stringify(list));
    } catch {}
  };

  const loadRecipes = async () => {
    if (recipes || loading) return;
    try {
      const cached = cacheKey ? sessionStorage.getItem(cacheKey) : null;
      if (cached) {
        setRecipes(JSON.parse(cached));
        return;
      }
    } catch {}
    setLoading(true);
    setError(null);
    try {
      const list = await fetchRecipes();
      setRecipes(list);
      save(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load recipes — try again");
    } finally {
      setLoading(false);
    }
  };

  const swap = async (i: number, tweak: "other" | "quicker" | "no-cook") => {
    if (!recipes || swapping) return;
    setSwapping(tweak);
    try {
      const [next] = await fetchRecipes({ count: 1, tweak, exclude: recipes.map((r) => r.title) });
      const list = recipes.map((r, j) => (j === i ? next : r));
      setRecipes(list);
      save(list);
    } catch {
      // Keep the current recipe; the chip just stops spinning.
    } finally {
      setSwapping(null);
    }
  };

  // Freeze the page behind the recipe sheet.
  useEffect(() => {
    if (openIdx == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenIdx(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [openIdx]);

  if (!plan || dayRoom.kcal < 150) return null;

  const mealWord = meal ? MEAL_WORD[meal] : "your next meal";
  const fits = bestFits(recent, room, plan.meal);
  const closing = plan.snacksToClose != null;
  const askNext = closing
    ? `My main meals are done and I'm still ${dayRoom.kcal.toLocaleString()} kcal and ${dayRoom.proteinG} g protein short of today's target. What snacks should I have to close the gap?`
    : `I have ${dayRoom.kcal.toLocaleString()} kcal and ${dayRoom.proteinG} g protein left today and ${MEAL_WORD[plan.meal]}'s next. What should I eat for it — around ${room.kcal.toLocaleString()} kcal and ${room.proteinG} g protein?`;
  const open = openIdx != null && recipes ? recipes[openIdx] : null;
  const k = open ? serv / (open.servings || 1) : 1;
  const sc = (n: number) => Math.round(n * k);

  const logRecipe = (r: Recipe, servings: number) => {
    const k = servings / (r.servings || 1);
    setOpenIdx(null);
    setPendingMeal({
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
    });
  };

  return (
    <section
      className="rounded-2xl p-4 mb-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
    >
      <h2 className="text-[15px] font-bold tracking-tight">{closing ? "Close the gap" : "Next meal"}</h2>
      <p className="text-[12px] mt-0.5 tabular-nums" style={{ color: "var(--fg-muted)" }}>
        {closing ? (
          <>
            {dayRoom.kcal.toLocaleString()} kcal and {dayRoom.proteinG} g protein short of today&apos;s target ·{" "}
            {plan.snacksToClose === 1
              ? "one snack like these closes it"
              : `about ${plan.snacksToClose} snacks like these (~${room.kcal.toLocaleString()} kcal each)`}
          </>
        ) : (
          <>
            {mealWord.charAt(0).toUpperCase()}
            {mealWord.slice(1)} · aim for ~{room.kcal.toLocaleString()} kcal and {room.proteinG} g protein
          </>
        )}
      </p>

      <div role="tablist" className="flex rounded-xl p-[3px] mt-3 mb-1" style={{ background: "var(--bg-elevated)" }}>
        {(
          [
            ["mine", "Your meals"],
            ["rec", "Recipes"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
              if (key === "rec") loadRecipes();
            }}
            className="flex-1 py-2 rounded-[9px] text-[13px] font-semibold"
            style={
              tab === key
                ? { background: "var(--bg-card)", color: "var(--fg)", boxShadow: "0 0 0 1px var(--border-strong)" }
                : { color: "var(--fg-muted)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "mine" &&
        (fits.length ? (
          fits.map((r, i) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setPendingMeal({ review: { items: r.items, photoUrl: r.photoUrl } })}
              className="w-full flex items-center gap-3 py-2.5 text-left active:opacity-70"
              style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
            >
              {r.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photoUrl} alt="" className="w-10 h-10 rounded-[10px] object-cover shrink-0" />
              ) : (
                <span
                  className="w-10 h-10 rounded-[10px] shrink-0 flex items-center justify-center text-[17px]"
                  style={{ background: "var(--bg-elevated)" }}
                  aria-hidden
                >
                  🍽️
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold truncate">{r.title}</span>
                <span className="block text-[11.5px] tabular-nums mt-0.5" style={{ color: "var(--fg-muted)" }}>
                  {r.kcal.toLocaleString()} kcal · {proteinOf(r)} g protein
                  {r.times > 1 ? ` · eaten ${r.times}×` : ""}
                </span>
              </span>
              {i === 0 && (
                <span
                  className="text-[10px] font-bold px-2 py-[3px] rounded-full whitespace-nowrap"
                  style={{ background: "rgba(34,197,94,0.14)", color: "#86efac" }}
                >
                  Best fit
                </span>
              )}
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[16px] font-bold shrink-0"
                style={{ background: "rgba(74,222,128,0.16)", color: "#86efac" }}
                aria-hidden
              >
                +
              </span>
            </button>
          ))
        ) : (
          <p className="text-[12.5px] py-3" style={{ color: "var(--fg-muted)" }}>
            Nothing you&apos;ve logged fits what&apos;s left. Try the Recipes tab or ask your coach.
          </p>
        ))}

      {tab === "rec" && (
        <div>
          {loading && (
            <div className="flex flex-col gap-2 py-2" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: "var(--bg-elevated)" }} />
              ))}
              <p className="text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
                Writing recipes that fit what&apos;s left…
              </p>
            </div>
          )}
          {error && !loading && (
            <div className="py-3">
              <p className="text-[12.5px]" style={{ color: "#fca5a5" }}>{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  loadRecipes();
                }}
                className="text-[12.5px] font-semibold mt-1.5"
                style={{ color: "#86efac" }}
              >
                Try again
              </button>
            </div>
          )}
          {recipes && (
            <Link
              href="/profile/fuel"
              className="flex items-center justify-end gap-1 text-[11.5px] font-semibold pb-1"
              style={{ color: "var(--fg-muted)" }}
            >
              Diet &amp; cooking settings ›
            </Link>
          )}
          {recipes?.map((r, i) => (
            <button
              key={`${r.title}-${i}`}
              type="button"
              onClick={() => openRecipe(i)}
              className="w-full flex items-center gap-3 py-2.5 text-left active:opacity-70"
              style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
            >
              <span
                className="w-10 h-10 rounded-[10px] shrink-0 flex items-center justify-center"
                style={{
                  background: `radial-gradient(120% 120% at 0% 0%, rgba(249,115,22,0.3), transparent 60%), var(--bg-elevated)`,
                }}
                aria-hidden
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fdba74" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11h18M5 11v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6M9 7c0-1.5 1-2 1-3.5M13 7c0-1.5 1-2 1-3.5" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold truncate">{r.title}</span>
                {r.blurb && (
                  <span className="block text-[11.5px] truncate mt-0.5" style={{ color: "var(--fg-muted)" }}>
                    {r.blurb}
                  </span>
                )}
                <span className="block text-[11.5px] tabular-nums mt-0.5" style={{ color: "var(--fg-dim)" }}>
                  {r.minutes ? `${r.minutes} min · ` : ""}
                  {r.kcal.toLocaleString()} kcal · {r.proteinG} g protein
                </span>
              </span>
              <span className="text-[18px]" style={{ color: "var(--fg-dim)" }} aria-hidden>
                ›
              </span>
            </button>
          ))}
        </div>
      )}

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
            onClick={() => setOpenIdx(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={open.title}
              className="w-full max-w-lg rounded-t-3xl overflow-y-auto"
              style={{
                maxHeight: "92dvh",
                background: "var(--bg-card)",
                border: `1px solid rgba(249,115,22,0.3)`,
                borderBottom: 0,
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-4 pt-2.5 pb-4"
                style={{ background: "radial-gradient(130% 120% at 0% 0%, rgba(249,115,22,0.2), transparent 55%)" }}
              >
                <div className="flex justify-center mb-3">
                  <span className="w-10 h-1 rounded-full" style={{ background: "var(--border-strong)" }} />
                </div>
                <span
                  className="inline-block text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-[3px] rounded-full"
                  style={{ background: "rgba(249,115,22,0.16)", color: "#fdba74" }}
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
                        style={{ background: "rgba(249,115,22,0.16)", color: "#fdba74" }}
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
                    onClick={() => swap(openIdx!, key)}
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
                  onClick={() => setOpenIdx(null)}
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

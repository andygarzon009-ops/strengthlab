"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { deleteFoodLog, updateFoodLog } from "@/lib/actions/food";
import { MEALS, type Meal } from "@/lib/meals";

type Row = {
  id: string;
  meal: string;
  name: string;
  portion: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  photoUrl: string | null;
};

const ORDER = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
const LABEL: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snacks",
};
const MEAL_LABEL: Record<Meal, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
};
const SCALES = [0.5, 1, 1.5, 2];

type Draft = {
  name: string;
  meal: Meal;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  scale: number;
};

const toDraft = (r: Row): Draft => ({
  name: r.name,
  meal: (MEALS as readonly string[]).includes(r.meal) ? (r.meal as Meal) : "SNACK",
  kcal: String(Math.round(r.kcal)),
  proteinG: String(Math.round(r.proteinG)),
  carbsG: String(Math.round(r.carbsG)),
  fatG: String(Math.round(r.fatG)),
  scale: 1,
});
const n = (s: string) => {
  const v = parseFloat(s);
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

/// What you've logged in StrengthLab today, by meal. Tap a food to edit its
/// name, meal, portion or numbers, or to delete it. Google Health foods aren't
/// listed here — they're edited where they were logged.
export default function FoodLogToday({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Meals start folded to one line each so the list doesn't push Fuel down.
  const [openMeals, setOpenMeals] = useState<Set<string>>(new Set());
  const toggle = (m: string) =>
    setOpenMeals((s) => {
      const next = new Set(s);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  const [pending, startTransition] = useTransition();
  const [vh, setVh] = useState<number | null>(null);
  const [vTop, setVTop] = useState(0);

  useEffect(() => {
    if (!editing) return;
    const vv = window.visualViewport;
    const sync = () => {
      setVh(vv ? vv.height : window.innerHeight);
      setVTop(vv ? vv.offsetTop : 0);
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      document.body.style.overflow = prev;
    };
  }, [editing]);

  const live = rows.filter((r) => !gone.has(r.id));
  if (live.length === 0) return null;

  const open = (r: Row) => {
    setEditing(r);
    setDraft(toDraft(r));
  };
  const close = () => {
    if (pending) return;
    setEditing(null);
    setDraft(null);
  };

  // A portion change rescales every number from what was saved.
  const rescale = (scale: number) => {
    if (!editing || !draft) return;
    setDraft({
      ...draft,
      scale,
      kcal: String(Math.round(editing.kcal * scale)),
      proteinG: String(Math.round(editing.proteinG * scale)),
      carbsG: String(Math.round(editing.carbsG * scale)),
      fatG: String(Math.round(editing.fatG * scale)),
    });
  };

  const save = () => {
    if (!editing || !draft) return;
    const portion =
      draft.scale === 1 ? editing.portion : `${draft.scale}× ${editing.portion ?? "portion"}`;
    startTransition(async () => {
      const res = await updateFoodLog(editing.id, {
        name: draft.name,
        meal: draft.meal,
        portion,
        kcal: n(draft.kcal),
        proteinG: n(draft.proteinG),
        carbsG: n(draft.carbsG),
        fatG: n(draft.fatG),
      });
      if (res.ok) {
        setEditing(null);
        setDraft(null);
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!editing) return;
    const id = editing.id;
    setGone((g) => new Set(g).add(id));
    setEditing(null);
    setDraft(null);
    startTransition(async () => {
      await deleteFoodLog(id);
      router.refresh();
    });
  };

  const valid = !!draft && draft.name.trim() !== "" && n(draft.kcal) > 0;

  return (
    <section
      className="rounded-2xl p-4 mb-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold tracking-tight">Logged today</h2>
        <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Tap a meal to open</span>
      </div>
      {ORDER.filter((m) => live.some((r) => r.meal === m)).map((m) => {
        const list = live.filter((r) => r.meal === m);
        const kcal = list.reduce((s, r) => s + r.kcal, 0);
        const isOpen = openMeals.has(m);
        return (
          <div key={m} className="mt-2" style={{ borderBottom: isOpen ? undefined : "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => toggle(m)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 min-h-[44px] text-left active:opacity-70"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--fg-dim)" }}>
                {LABEL[m]}
              </span>
              <span className="flex-1 min-w-0 text-[11px] truncate" style={{ color: "var(--fg-dim)" }}>
                {list.length} item{list.length === 1 ? "" : "s"}
              </span>
              <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--fg-muted)" }}>
                {Math.round(kcal).toLocaleString()} kcal
              </span>
              <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--fg-dim)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="shrink-0"
                  style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
            </button>
            {isOpen && list.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => open(r)}
                className="w-full flex items-center gap-3 py-2 text-left active:opacity-70"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                {r.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-[15px]" style={{ background: "var(--bg-elevated)" }} aria-hidden>
                    🍽️
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium truncate">{r.name}</span>
                  <span className="block text-[11px] truncate" style={{ color: "var(--fg-dim)" }}>
                    {[r.portion, `${Math.round(r.proteinG)}g protein`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-[14px] font-semibold tabular-nums shrink-0">{Math.round(r.kcal)}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-dim)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
            ))}
          </div>
        );
      })}

      {editing &&
        draft &&
        createPortal(
          <div
            className="fixed inset-x-0 z-[70] flex items-end justify-center"
            style={{ top: vTop, height: vh ?? "100dvh", background: "rgba(0,0,0,0.6)", overscrollBehavior: "contain" }}
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Edit ${editing.name}`}
              className="w-full max-w-lg rounded-t-3xl flex flex-col"
              style={{
                background: "var(--bg-card)",
                borderTop: "1px solid var(--border-strong)",
                maxHeight: vh ? vh - 40 : "88dvh",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-2.5">
                <span className="w-10 h-1 rounded-full" style={{ background: "var(--border-strong)" }} />
              </div>
              <div className="overflow-y-auto px-5 pt-3 pb-4" style={{ overscrollBehavior: "contain" }}>
                <div className="flex items-center gap-3">
                  {editing.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={editing.photoUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                  )}
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    aria-label="Food name"
                    className="flex-1 min-w-0 h-11 px-3 rounded-xl font-bold outline-none"
                    style={{ fontSize: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                  />
                </div>

                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mt-4 mb-2" style={{ color: "var(--fg-muted)" }}>Meal</p>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Meal">
                  {MEALS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={draft.meal === m}
                      onClick={() => setDraft({ ...draft, meal: m })}
                      className="flex-1 h-8 rounded-full text-[12px] font-semibold"
                      style={
                        draft.meal === m
                          ? { background: "rgba(74,222,128,0.16)", border: "1px solid rgba(134,239,172,0.5)", color: "#dcfce7" }
                          : { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--fg-muted)" }
                      }
                    >
                      {MEAL_LABEL[m]}
                    </button>
                  ))}
                </div>

                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mt-4 mb-2" style={{ color: "var(--fg-muted)" }}>
                  Portion{editing.portion ? ` · was ${editing.portion}` : ""}
                </p>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Portion">
                  {SCALES.map((x) => (
                    <button
                      key={x}
                      type="button"
                      role="radio"
                      aria-checked={draft.scale === x}
                      onClick={() => rescale(x)}
                      className="flex-1 h-9 rounded-xl text-[13px] font-bold tabular-nums"
                      style={
                        draft.scale === x
                          ? { background: "var(--fg)", color: "var(--bg)" }
                          : { background: "var(--bg-elevated)", color: "var(--fg-muted)" }
                      }
                    >
                      {x === 0.5 ? "½×" : `${x}×`}
                    </button>
                  ))}
                </div>

                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mt-4 mb-2" style={{ color: "var(--fg-muted)" }}>Numbers</p>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      ["kcal", "Calories", "#22c55e"],
                      ["proteinG", "Protein g", "#ec4899"],
                      ["carbsG", "Carbs g", "#3b82f6"],
                      ["fatG", "Fat g", "#c2820a"],
                    ] as const
                  ).map(([key, label, color]) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--fg-muted)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        {label}
                      </span>
                      <input
                        value={draft[key]}
                        onChange={(e) => setDraft({ ...draft, [key]: e.target.value.replace(/[^0-9.]/g, "") })}
                        inputMode="decimal"
                        className="h-11 px-2 rounded-xl text-center font-bold tabular-nums outline-none"
                        style={{ fontSize: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                      />
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={save}
                  disabled={!valid || pending}
                  className="btn-accent w-full min-h-[50px] rounded-2xl text-[15px] font-bold mt-5 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="w-full min-h-[44px] rounded-2xl text-[14px] font-semibold mt-2"
                  style={{ color: "#f87171" }}
                >
                  Delete this food
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}

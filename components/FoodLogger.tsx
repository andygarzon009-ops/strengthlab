"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { shrinkImage } from "@/lib/shrinkImage";
import { renameRecentMeal, saveFoodItems } from "@/lib/actions/food";
import { mealForHour, MEALS, type Meal } from "@/lib/meals";
import { onPendingMeal, takePendingMeal } from "@/lib/pendingMeal";
import type { RecentMeal } from "@/lib/foodLog";
import type { DetectedFood } from "@/app/api/food/analyze/route";
import { useSheetBack, SheetClose, backdropTap } from "@/components/useSheetBack";

/// `base` is the leading count in the estimate's portion ("2 large eggs" → 2),
/// so a miscount is fixed with a stepper instead of a ratio. `scale` is
/// count / base, or a chip value when the portion isn't a count.
type Item = DetectedFood & { scale: number; base: number | null; editing?: boolean };
type Stage =
  | { kind: "closed" }
  | { kind: "describe" }
  | { kind: "analyzing"; preview: string | null }
  | {
      kind: "review";
      items: Item[];
      photoUrl: string | null;
      preview: string | null;
      note: string | null;
      source: "photo" | "text";
      /// The meal's name, saved with it when it's two or more foods.
      name: string;
    }
  | { kind: "error"; message: string };

const MEAL_LABEL: Record<Meal, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
};
const SCALES = [0.5, 1, 1.5, 2];

const RECENT_HEADING: Record<Meal, string> = {
  BREAKFAST: "Breakfasts",
  LUNCH: "Lunches",
  DINNER: "Dinners",
  SNACK: "Snacks",
};
const MEAL_ICON: Record<Meal, string> = { BREAKFAST: "🍳", LUNCH: "🥗", DINNER: "🍽️", SNACK: "🍎" };

// A weight or volume ("30 g almonds", "250 ml milk") isn't a count; those keep the chips.
const leadingCount = (portion: string): number | null => {
  const m = portion.match(/^(\d+(?:\.\d+)?)\s+(?!(?:g|kg|mg|ml|l|oz|lb|fl)\b)/i);
  const n = m ? parseFloat(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 50 ? n : null;
};

const toItem = (it: DetectedFood): Item => ({ ...it, scale: 1, base: leadingCount(it.portion) });

const countOf = (it: Item) => (it.base == null ? null : Math.round(it.base * it.scale * 10) / 10);

/// The portion as it'll be saved: a recounted item gets its number (and any
/// gram weight) rewritten; a chip-scaled one gets an "N×" prefix.
const portionOf = (it: Item) => {
  if (it.scale === 1) return it.portion;
  const n = countOf(it);
  if (n == null) return `${it.scale}× ${it.portion}`;
  const rest = it.portion
    .replace(/^\d+(?:\.\d+)?/, "")
    .replace(/(\d+(?:\.\d+)?)\s*g\b/g, (_, g) => `${Math.round(parseFloat(g) * it.scale)} g`);
  return `${n}${rest}`;
};

const scaled = (it: Item) => ({
  kcal: Math.round(it.kcal * it.scale),
  proteinG: Math.round(it.proteinG * it.scale),
  carbsG: Math.round(it.carbsG * it.scale),
  fatG: Math.round(it.fatG * it.scale),
});

/// Log a meal from a photo or a sentence. Gemini estimates each food; the
/// athlete trims, rescales or removes items, picks the meal, and saves it to
/// Fuel. Nothing is stored until Save.
/// The automatic name for a past meal: its biggest food, "+N" for the rest.
function autoTitle(r: RecentMeal): string {
  const lead = [...r.items].sort((a, b) => b.kcal - a.kcal)[0];
  if (!lead) return r.title;
  return r.items.length > 1 ? `${lead.name} +${r.items.length - 1}` : lead.name;
}

export default function FoodLogger({ recent = [] }: { recent?: RecentMeal[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "closed" });
  const [text, setText] = useState("");
  const [meal, setMeal] = useState<Meal>(() => mealForHour(new Date().getHours()));
  const [saved, setSaved] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  // Which meal's past meals are expanded; starts on the meal it is right now.
  const [recentMeal, setRecentMeal] = useState<Meal | null>(() => mealForHour(new Date().getHours()));
  // Renaming a past meal: the row being edited, and names saved this visit
  // (shown at once, before the page refreshes with them).
  const [renaming, setRenaming] = useState<{ key: string; value: string } | null>(null);
  const [renamed, setRenamed] = useState<Record<string, string | null>>({});
  const titleOf = (r: RecentMeal) => {
    const local = renamed[r.key];
    return local === undefined ? r.title : local ?? autoTitle(r);
  };
  const isNamed = (r: RecentMeal) => (renamed[r.key] === undefined ? !!r.named : renamed[r.key] != null);
  const saveRename = (r: RecentMeal, value: string) => {
    const name = value.trim();
    setRenaming(null);
    if (name === titleOf(r)) return;
    setRenamed((m) => ({ ...m, [r.key]: name || null }));
    renameRecentMeal(r.key, name).then(() => router.refresh());
  };
  const [pending, startTransition] = useTransition();
  const [vh, setVh] = useState<number | null>(null);
  const [vTop, setVTop] = useState(0);
  const open = stage.kind !== "closed";

  // Same sheet mechanics as the favourite-lift picker: sized to the visual
  // viewport so the keyboard can't cover it, page behind frozen.
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const analyze = async (fd: FormData, preview: string | null, source: "photo" | "text") => {
    setStage({ kind: "analyzing", preview });
    try {
      const res = await fetch("/api/food/analyze", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStage({ kind: "error", message: body.error ?? "Couldn't read that meal — try again" });
        return;
      }
      if (!body.items?.length) {
        setStage({ kind: "error", message: body.note ?? "Couldn't spot any food in that." });
        return;
      }
      setStage({
        kind: "review",
        items: (body.items as DetectedFood[]).map(toItem),
        photoUrl: body.photoUrl ?? null,
        preview,
        note: body.note ?? null,
        source,
        name: "",
      });
    } catch {
      setStage({ kind: "error", message: "No connection — try again" });
    }
  };

  const startPhoto = async (picked: File) => {
    setMeal(mealForHour(new Date().getHours()));
    // Show the sheet before the shrink: decoding a full camera photo can take
    // a few seconds on a phone, and the page shouldn't sit there looking idle.
    setStage({ kind: "analyzing", preview: null });
    const file = await shrinkImage(picked, 1280);
    const preview = URL.createObjectURL(file);
    const fd = new FormData();
    fd.append("photo", file);
    analyze(fd, preview, "photo");
  };

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (picked) startPhoto(picked);
  };

  // Arrived from the New chooser with a photo already taken (or asking to
  // describe): go straight into the flow. Also listens while mounted — opening
  // the chooser from /fuel itself doesn't remount this, so the photo would
  // otherwise be dropped and the page left as it was.
  useEffect(() => {
    const pickUp = () => {
      const p = takePendingMeal();
      if (!p) return;
      if ("file" in p) startPhoto(p.file);
      else if ("review" in p) {
        setMeal(mealForHour(new Date().getHours()));
        setStage({
          kind: "review",
          items: p.review.items.map(toItem),
          photoUrl: p.review.photoUrl,
          preview: p.review.photoUrl,
          note: null,
          source: p.review.photoUrl ? "photo" : "text",
          name: p.review.name ?? "",
        });
      } else {
        setMeal(mealForHour(new Date().getHours()));
        setStage({ kind: "describe" });
      }
    };
    // Deferred a tick so it isn't a synchronous in-effect setState.
    queueMicrotask(pickUp);
    return onPendingMeal(pickUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDescribe = () => {
    const t = text.trim();
    if (!t) return;
    const fd = new FormData();
    fd.append("text", t);
    analyze(fd, null, "text");
  };

  // A recent meal skips the estimate: same foods, same numbers, straight to
  // review so the portion or meal can still be tweaked before saving.
  const relog = (r: RecentMeal) => {
    setMeal(mealForHour(new Date().getHours()));
    setStage({
      kind: "review",
      items: r.items.map(toItem),
      photoUrl: r.photoUrl,
      preview: r.photoUrl,
      note: null,
      source: r.photoUrl ? "photo" : "text",
      name: isNamed(r) ? titleOf(r) : "",
    });
  };

  const close = () => {
    if (stage.kind === "analyzing" || pending || addBusy) return;
    dismiss();
  };

  const update = (i: number, patch: Partial<Item>) =>
    setStage((s) =>
      s.kind === "review"
        ? { ...s, items: s.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }
        : s,
    );
  // Opening the editor bakes any count/scale into the numbers so the fields
  // show exactly what will be saved.
  const startEdit = (i: number) =>
    setStage((s) =>
      s.kind === "review"
        ? {
            ...s,
            items: s.items.map((it, j) =>
              j === i
                ? {
                    ...it,
                    ...scaled(it),
                    fiberG: it.fiberG == null ? null : Math.round(it.fiberG * it.scale),
                    portion: portionOf(it),
                    scale: 1,
                    base: countOf(it),
                    editing: true,
                  }
                : it,
            ),
          }
        : s,
    );
  const remove = (i: number) =>
    setStage((s) =>
      s.kind === "review" ? { ...s, items: s.items.filter((_, j) => j !== i) } : s,
    );

  // A food the estimate missed: describe it, estimate it on its own, append.
  const [adding, setAdding] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Back swipe closes the sheet and stays on Fuel.
  const { dismiss, grab } = useSheetBack(open, () => {
    setStage({ kind: "closed" });
    setAdding(null);
    setAddError(null);
  });
  const addItem = async () => {
    const t = adding?.trim();
    if (!t || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const fd = new FormData();
      fd.append("text", t);
      const res = await fetch("/api/food/analyze", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      const found = (body.items ?? []) as DetectedFood[];
      if (!res.ok || found.length === 0) {
        setAddError(body.error ?? body.note ?? "Couldn't estimate that — try wording it differently");
        return;
      }
      setStage((s) => (s.kind === "review" ? { ...s, items: [...s.items, ...found.map(toItem)] } : s));
      setAdding(null);
    } catch {
      setAddError("No connection — try again");
    } finally {
      setAddBusy(false);
    }
  };

  const save = () => {
    if (stage.kind !== "review" || stage.items.length === 0) return;
    const items = stage.items.map((it) => ({
      name: it.name,
      portion: portionOf(it),
      fiberG: it.fiberG == null ? null : Math.round(it.fiberG * it.scale),
      ...scaled(it),
    }));
    const total = items.reduce((s, it) => s + it.kcal, 0);
    startTransition(async () => {
      const res = await saveFoodItems({
        meal,
        items,
        photoUrl: stage.photoUrl,
        source: stage.source,
        mealName: items.length > 1 ? stage.name : undefined,
      });
      if (res.ok) {
        dismiss();
        setText("");
        setAdding(null);
        setSaved(`${MEAL_LABEL[meal]} saved · ${total.toLocaleString()} kcal`);
        setTimeout(() => setSaved(null), 3500);
        router.refresh();
      }
    });
  };

  const totals =
    stage.kind === "review"
      ? stage.items.reduce(
          (t, it) => {
            const s = scaled(it);
            return {
              kcal: t.kcal + s.kcal,
              p: t.p + s.proteinG,
              c: t.c + s.carbsG,
              f: t.f + s.fatG,
            };
          },
          { kcal: 0, p: 0, c: 0, f: 0 },
        )
      : null;

  return (
    <section id="log" className="rounded-2xl p-4 mb-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPhoto}
      />
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-bold tracking-tight">Log a meal</h2>
        {saved && (
          <span className="text-[12px] font-semibold" style={{ color: "#86efac" }} role="status">
            ✓ {saved}
          </span>
        )}
      </div>
      {/* Same two tiles as the New sheet's meal options, so logging a meal
          looks the same wherever it starts. */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex flex-col gap-3 rounded-2xl p-4 text-left active:scale-[0.99] transition-transform"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 0%, rgba(163,230,53,0.18) 0%, transparent 60%), var(--bg-elevated)",
            border: "1px solid rgba(163,230,53,0.3)",
          }}
        >
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: "#a3e635" }}
            aria-hidden
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
          <span>
            <span className="block text-[15px] font-bold">Meal photo</span>
            <span className="block text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              Snap it, we count it
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMeal(mealForHour(new Date().getHours()));
            setStage({ kind: "describe" });
          }}
          className="flex flex-col gap-3 rounded-2xl p-4 text-left active:scale-[0.99] transition-transform"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
        >
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}
            aria-hidden
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </span>
          <span>
            <span className="block text-[15px] font-bold">Describe a meal</span>
            <span className="block text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              Type what you ate
            </span>
          </span>
        </button>
      </div>
      {recent.length > 0 && (
        <div className="mt-3">
          {/* Collapsed until asked for: a dropdown of past meals, the ones
              logged most often first. */}
          <button
            type="button"
            onClick={() => setShowRecent((v) => !v)}
            aria-expanded={showRecent}
            className="w-full flex items-center justify-between min-h-[44px] px-3.5 rounded-xl text-[14px] font-semibold"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
          >
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5M12 7v5l3 2" />
              </svg>
              Log a past meal
            </span>
            <span className="flex items-center gap-2 text-[12px]" style={{ color: "var(--fg-muted)" }}>
              {recent.length}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                style={{ transform: showRecent ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>

          {showRecent && (
            <div className="mt-2 flex flex-col gap-1.5">
              {MEALS.map((m) => {
                const list = recent.filter((r) => r.meal === m);
                if (list.length === 0) return null;
                const isOpen = recentMeal === m;
                return (
                  <div
                    key={m}
                    className="rounded-xl overflow-hidden"
                    style={{ border: "1px solid var(--border)", background: "rgba(255,255,255,0.015)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setRecentMeal(isOpen ? null : m)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between min-h-[44px] px-3.5 text-[13px] font-semibold"
                    >
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden className="text-[15px]">{MEAL_ICON[m]}</span>
                        {RECENT_HEADING[m]}
                      </span>
                      <span className="flex items-center gap-2 text-[12px] font-medium" style={{ color: "var(--fg-muted)" }}>
                        {list.length}
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </span>
                    </button>
                    {isOpen &&
                      list.map((r) =>
                        renaming?.key === r.key ? (
                          <form
                            key={r.key}
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveRename(r, renaming.value);
                            }}
                            className="flex items-center gap-2 px-3.5 py-2"
                            style={{ borderTop: "1px solid var(--border)" }}
                          >
                            <input
                              autoFocus
                              value={renaming.value}
                              maxLength={60}
                              onChange={(e) => setRenaming({ key: r.key, value: e.target.value })}
                              onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                              placeholder={autoTitle(r)}
                              aria-label="Meal name"
                              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[14px] focus:outline-none"
                              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--fg)" }}
                            />
                            {isNamed(r) && (
                              <button
                                type="button"
                                onClick={() => saveRename(r, "")}
                                className="text-[12px] font-semibold px-2 py-2"
                                style={{ color: "var(--fg-muted)" }}
                              >
                                Reset
                              </button>
                            )}
                            <button
                              type="submit"
                              className="text-[12.5px] font-semibold px-3 py-2 rounded-lg"
                              style={{ background: "var(--accent)", color: "#0a0a0a" }}
                            >
                              Save
                            </button>
                          </form>
                        ) : (
                        <div key={r.key} className="flex items-center" style={{ borderTop: "1px solid var(--border)" }}>
                        <button
                          type="button"
                          onClick={() => relog(r)}
                          className="min-w-0 flex-1 flex items-center gap-3 pl-3.5 py-2.5 text-left active:opacity-70"
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
                            <span className="block text-[14px] font-medium truncate">{titleOf(r)}</span>
                            <span className="block text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                              {r.kcal.toLocaleString()} kcal
                              {r.times > 1 ? ` · logged ${r.times}×` : ""}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Rename ${titleOf(r)}`}
                          onClick={() => setRenaming({ key: r.key, value: isNamed(r) ? titleOf(r) : "" })}
                          className="w-9 h-9 flex items-center justify-center shrink-0"
                          style={{ color: "var(--fg-dim)" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`Log ${titleOf(r)}`}
                          onClick={() => relog(r)}
                          className="pr-3.5 pl-1 py-2.5 shrink-0"
                        >
                          <span
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[16px] font-bold"
                            style={{ background: "rgba(74,222,128,0.16)", color: "#86efac" }}
                            aria-hidden
                          >
                            +
                          </span>
                        </button>
                        </div>
                        ),
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] mt-2.5" style={{ color: "var(--fg-dim)" }}>
        Estimates from a photo are rough — check portions before saving.
      </p>

      {open &&
        createPortal(
          <div
            className="fixed inset-x-0 z-[70] flex items-end justify-center"
            style={{ top: vTop, height: vh ?? "100dvh", background: "rgba(0,0,0,0.6)", overscrollBehavior: "contain" }}
            onClick={() => backdropTap(close)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Log a meal"
              className="relative w-full max-w-lg rounded-t-3xl flex flex-col"
              style={{
                background: "var(--bg-card)",
                borderTop: "1px solid var(--border-strong)",
                maxHeight: vh ? vh - 40 : "88dvh",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {stage.kind !== "analyzing" && <SheetClose onClick={close} />}
              <div className="flex justify-center pt-2.5 pb-1 touch-none" {...(stage.kind === "analyzing" ? {} : grab)}>
                <span className="w-10 h-1 rounded-full" style={{ background: "var(--border-strong)" }} />
              </div>

              {stage.kind === "describe" && (
                <div className="px-5 pt-3 pb-4">
                  <h3 className="text-[18px] font-extrabold tracking-tight">What did you eat?</h3>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="e.g. 3 eggs scrambled in butter, 2 slices sourdough, black coffee"
                    className="mt-3 w-full px-4 py-3 rounded-xl text-[16px] outline-none resize-none"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                  />
                  <button
                    type="button"
                    onClick={onDescribe}
                    disabled={!text.trim()}
                    className="btn-accent mt-3 w-full min-h-[48px] rounded-2xl text-[15px] font-bold disabled:opacity-50"
                  >
                    Estimate
                  </button>
                </div>
              )}

              {stage.kind === "analyzing" && (
                <div className="px-5 pt-4 pb-8 flex flex-col items-center text-center">
                  {stage.preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={stage.preview} alt="" className="w-full max-h-[220px] object-cover rounded-2xl" />
                  )}
                  <span
                    className="mt-5 w-6 h-6 rounded-full border-[3px] animate-spin"
                    style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
                  />
                  <p className="text-[14px] font-semibold mt-3">Reading your meal…</p>
                </div>
              )}

              {stage.kind === "error" && (
                <div className="px-5 pt-4 pb-6 text-center">
                  <p className="text-[15px] font-semibold">{stage.message}</p>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => dismiss()}
                      className="min-h-[44px] rounded-xl text-[14px] font-semibold"
                      style={{ background: "var(--bg-elevated)" }}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage({ kind: "describe" })}
                      className="btn-accent min-h-[44px] rounded-xl text-[14px] font-bold"
                    >
                      Describe instead
                    </button>
                  </div>
                </div>
              )}

              {stage.kind === "review" && totals && (
                <>
                  <div className="px-5 pt-3">
                    <div className="flex items-start gap-3">
                      {stage.preview && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={stage.preview} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[30px] font-extrabold leading-none tabular-nums" style={{ letterSpacing: "-0.03em" }}>
                          {totals.kcal.toLocaleString()}
                          <span className="text-[13px] font-semibold ml-1" style={{ color: "var(--fg-muted)" }}>kcal</span>
                        </p>
                        <p className="text-[12px] mt-1.5 tabular-nums" style={{ color: "var(--fg-muted)", fontFamily: "var(--font-geist-mono)" }}>
                          P {totals.p}g · C {totals.c}g · F {totals.f}g
                        </p>
                      </div>
                    </div>
                    {stage.note && (
                      <p className="text-[12px] mt-2.5" style={{ color: "var(--fg-muted)" }}>
                        {stage.note}
                      </p>
                    )}
                    {stage.items.length > 1 && (
                      <label className="flex items-center gap-2 mt-3 h-10 px-3 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                        <span className="text-[11px] font-semibold uppercase shrink-0" style={{ letterSpacing: "0.1em", color: "var(--fg-dim)" }}>
                          Name
                        </span>
                        <input
                          value={stage.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setStage((st) => (st.kind === "review" ? { ...st, name: v } : st));
                          }}
                          maxLength={60}
                          placeholder="Name this meal (optional)"
                          aria-label="Meal name"
                          className="flex-1 min-w-0 bg-transparent outline-none font-semibold"
                          style={{ fontSize: 16 }}
                        />
                      </label>
                    )}
                    <div className="flex gap-1.5 mt-3.5" role="radiogroup" aria-label="Meal">
                      {MEALS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={meal === m}
                          onClick={() => setMeal(m)}
                          className="flex-1 h-8 rounded-full text-[12px] font-semibold"
                          style={
                            meal === m
                              ? { background: "rgba(74,222,128,0.16)", border: "1px solid rgba(134,239,172,0.5)", color: "#dcfce7" }
                              : { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--fg-muted)" }
                          }
                        >
                          {MEAL_LABEL[m]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto px-5 mt-3" style={{ overscrollBehavior: "contain" }}>
                    {stage.items.map((it, i) => {
                      const s = scaled(it);
                      const n = countOf(it);
                      if (it.editing) {
                        const field = (
                          key: "kcal" | "proteinG" | "carbsG" | "fatG",
                          label: string,
                        ) => (
                          <label className="flex-1 min-w-0">
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--fg-dim)" }}>
                              {label}
                            </span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={it[key] || ""}
                              onChange={(e) => update(i, { [key]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                              className="mt-1 w-full h-10 px-2.5 rounded-lg tabular-nums outline-none"
                              style={{ fontSize: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                            />
                          </label>
                        );
                        return (
                          <div key={i} className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
                            <input
                              value={it.name}
                              onChange={(e) => update(i, { name: e.target.value })}
                              aria-label="Food name"
                              placeholder="Food"
                              className="w-full h-10 px-3 rounded-lg font-semibold outline-none"
                              style={{ fontSize: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                            />
                            <input
                              value={it.portion}
                              onChange={(e) => update(i, { portion: e.target.value })}
                              aria-label="Portion"
                              placeholder="Portion, e.g. 3 large eggs"
                              className="mt-2 w-full h-10 px-3 rounded-lg outline-none"
                              style={{ fontSize: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                            />
                            <div className="flex gap-2 mt-2">
                              {field("kcal", "kcal")}
                              {field("proteinG", "P g")}
                              {field("carbsG", "C g")}
                              {field("fatG", "F g")}
                            </div>
                            <div className="flex gap-2 mt-2.5">
                              <button
                                type="button"
                                onClick={() => remove(i)}
                                className="h-9 px-3.5 rounded-lg text-[13px] font-semibold"
                                style={{ background: "var(--bg-elevated)", color: "#fca5a5" }}
                              >
                                Remove
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  update(i, { editing: false, base: leadingCount(it.portion), scale: 1 })
                                }
                                disabled={!it.name.trim() || it.kcal <= 0}
                                className="flex-1 h-9 rounded-lg text-[13px] font-bold disabled:opacity-50"
                                style={{ background: "var(--fg)", color: "var(--bg)" }}
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={i} className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(i)}
                              aria-label={`Edit ${it.name}`}
                              className="min-w-0 flex-1 text-left"
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="text-[15px] font-semibold truncate">{it.name}</span>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--fg-dim)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
                                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                                </svg>
                              </span>
                              <span className="block text-[11px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
                                {portionOf(it)}
                              </span>
                            </button>
                            <p className="text-[15px] font-bold tabular-nums shrink-0">{s.kcal}</p>
                            <button
                              type="button"
                              onClick={() => remove(i)}
                              aria-label={`Remove ${it.name}`}
                              className="w-7 h-7 -mr-1 rounded-full flex items-center justify-center shrink-0"
                              style={{ color: "var(--fg-dim)" }}
                            >
                              ✕
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <p className="text-[11px] tabular-nums" style={{ color: "var(--fg-muted)", fontFamily: "var(--font-geist-mono)" }}>
                              P {s.proteinG} · C {s.carbsG} · F {s.fatG}
                            </p>
                            {n != null && it.base != null ? (
                              // A counted food: fix the count directly (2 eggs → 3).
                              <div className="flex items-center gap-1" aria-label="Count">
                                <button
                                  type="button"
                                  onClick={() => update(i, { scale: Math.max(1, n - 1) / it.base! })}
                                  disabled={n <= 1}
                                  aria-label="One fewer"
                                  className="w-8 h-8 rounded-lg text-[16px] font-bold disabled:opacity-40"
                                  style={{ background: "var(--bg-elevated)" }}
                                >
                                  −
                                </button>
                                <span className="min-w-[28px] text-center text-[14px] font-bold tabular-nums">{n}</span>
                                <button
                                  type="button"
                                  onClick={() => update(i, { scale: (Math.floor(n) + 1) / it.base! })}
                                  aria-label="One more"
                                  className="w-8 h-8 rounded-lg text-[16px] font-bold"
                                  style={{ background: "var(--bg-elevated)" }}
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-1" role="radiogroup" aria-label="Portion">
                                {SCALES.map((x) => (
                                  <button
                                    key={x}
                                    type="button"
                                    role="radio"
                                    aria-checked={it.scale === x}
                                    onClick={() => update(i, { scale: x })}
                                    className="h-7 min-w-[38px] px-2 rounded-lg text-[11px] font-bold tabular-nums"
                                    style={
                                      it.scale === x
                                        ? { background: "var(--fg)", color: "var(--bg)" }
                                        : { background: "var(--bg-elevated)", color: "var(--fg-muted)" }
                                    }
                                  >
                                    {x === 0.5 ? "½×" : `${x}×`}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <div className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
                      {adding == null ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAdding("");
                            setAddError(null);
                          }}
                          className="w-full h-10 rounded-xl text-[13px] font-semibold"
                          style={{ border: "1px dashed var(--border-strong)", color: "var(--fg-muted)" }}
                        >
                          + Add something it missed
                        </button>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <input
                              value={adding}
                              onChange={(e) => setAdding(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addItem()}
                              autoFocus
                              placeholder="e.g. 1 slice sourdough with butter"
                              className="flex-1 min-w-0 h-10 px-3 rounded-lg outline-none"
                              style={{ fontSize: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                            />
                            <button
                              type="button"
                              onClick={addItem}
                              disabled={!adding.trim() || addBusy}
                              className="h-10 px-3.5 rounded-lg text-[13px] font-bold disabled:opacity-50"
                              style={{ background: "var(--fg)", color: "var(--bg)" }}
                            >
                              {addBusy ? "…" : "Add"}
                            </button>
                          </div>
                          {addError && (
                            <p className="text-[12px] mt-1.5" style={{ color: "#fca5a5" }}>
                              {addError}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="px-5 pt-3 pb-4" style={{ borderTop: "1px solid var(--border)" }}>
                    <button
                      type="button"
                      onClick={save}
                      disabled={pending || addBusy || stage.items.length === 0}
                      className="btn-accent w-full min-h-[50px] rounded-2xl text-[15px] font-bold disabled:opacity-50"
                    >
                      {pending ? "Saving…" : `Save ${MEAL_LABEL[meal].toLowerCase()} · ${totals.kcal.toLocaleString()} kcal`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}

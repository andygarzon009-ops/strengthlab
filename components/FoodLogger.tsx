"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { shrinkImage } from "@/lib/shrinkImage";
import { saveFoodItems } from "@/lib/actions/food";
import { mealForHour, MEALS, type Meal } from "@/lib/meals";
import { takePendingMeal } from "@/lib/pendingMeal";
import type { DetectedFood } from "@/app/api/food/analyze/route";

type Item = DetectedFood & { scale: number };
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
    }
  | { kind: "error"; message: string };

const MEAL_LABEL: Record<Meal, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
};
const SCALES = [0.5, 1, 1.5, 2];

const scaled = (it: Item) => ({
  kcal: Math.round(it.kcal * it.scale),
  proteinG: Math.round(it.proteinG * it.scale),
  carbsG: Math.round(it.carbsG * it.scale),
  fatG: Math.round(it.fatG * it.scale),
});

/// Log a meal from a photo or a sentence. Gemini estimates each food; the
/// athlete trims, rescales or removes items, picks the meal, and saves it to
/// Fuel. Nothing is stored until Save.
export default function FoodLogger() {
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "closed" });
  const [text, setText] = useState("");
  const [meal, setMeal] = useState<Meal>(() => mealForHour(new Date().getHours()));
  const [saved, setSaved] = useState<string | null>(null);
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
        items: (body.items as DetectedFood[]).map((it) => ({ ...it, scale: 1 })),
        photoUrl: body.photoUrl ?? null,
        preview,
        note: body.note ?? null,
        source,
      });
    } catch {
      setStage({ kind: "error", message: "No connection — try again" });
    }
  };

  const startPhoto = async (picked: File) => {
    setMeal(mealForHour(new Date().getHours()));
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
  // describe): go straight into the flow.
  useEffect(() => {
    const p = takePendingMeal();
    if (!p) return;
    // Deferred a tick so it isn't a synchronous in-effect setState.
    queueMicrotask(() => {
      if ("file" in p) startPhoto(p.file);
      else {
        setMeal(mealForHour(new Date().getHours()));
        setStage({ kind: "describe" });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDescribe = () => {
    const t = text.trim();
    if (!t) return;
    const fd = new FormData();
    fd.append("text", t);
    analyze(fd, null, "text");
  };

  const close = () => {
    if (stage.kind === "analyzing" || pending) return;
    setStage({ kind: "closed" });
  };

  const update = (i: number, patch: Partial<Item>) =>
    setStage((s) =>
      s.kind === "review"
        ? { ...s, items: s.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }
        : s,
    );
  const remove = (i: number) =>
    setStage((s) =>
      s.kind === "review" ? { ...s, items: s.items.filter((_, j) => j !== i) } : s,
    );

  const save = () => {
    if (stage.kind !== "review" || stage.items.length === 0) return;
    const items = stage.items.map((it) => ({
      name: it.name,
      portion: it.scale === 1 ? it.portion : `${it.scale}× ${it.portion}`,
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
      });
      if (res.ok) {
        setStage({ kind: "closed" });
        setText("");
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
              "radial-gradient(120% 140% at 0% 0%, rgba(56,189,248,0.18) 0%, transparent 60%), var(--bg-elevated)",
            border: "1px solid rgba(56,189,248,0.3)",
          }}
        >
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: "#38bdf8" }}
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
      <p className="text-[11px] mt-2.5" style={{ color: "var(--fg-dim)" }}>
        Estimates from a photo are rough — check portions before saving.
      </p>

      {open &&
        createPortal(
          <div
            className="fixed inset-x-0 z-[70] flex items-end justify-center"
            style={{ top: vTop, height: vh ?? "100dvh", background: "rgba(0,0,0,0.6)", overscrollBehavior: "contain" }}
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Log a meal"
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
                      onClick={() => setStage({ kind: "closed" })}
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
                      return (
                        <div key={i} className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <input
                                value={it.name}
                                onChange={(e) => update(i, { name: e.target.value })}
                                aria-label="Food name"
                                className="w-full bg-transparent text-[15px] font-semibold outline-none"
                                style={{ fontSize: 16 }}
                              />
                              <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
                                {it.portion}
                              </p>
                            </div>
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
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-5 pt-3 pb-4" style={{ borderTop: "1px solid var(--border)" }}>
                    <button
                      type="button"
                      onClick={save}
                      disabled={pending || stage.items.length === 0}
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

"use client";

// Declares the training cycle the AI coach programs against. The coach can't
// infer a block from session history — its deepest view is ~7 weeks of
// workouts with nothing marking a block start or a deload — so the athlete
// states the cycle here and the week is computed from it.

import { useMemo, useState } from "react";
import {
  BLOCK_GUIDES,
  DEFAULT_PERIODIZATION,
  deloadWeekSet,
  periodizationState,
  trainedWeekSet,
  isValidConfig,
  type PeriodizationConfig,
} from "@/lib/periodization";

const CARD = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
} as const;

const INPUT =
  "rounded-lg px-3 py-2 text-[13px] focus:outline-none";
const INPUT_STYLE = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
} as const;

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/// Monday of the current week — the natural start for a training cycle, and it
/// keeps week boundaries aligned with how people talk about training weeks.
function thisMondayISO(): string {
  const d = new Date();
  const offset = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PeriodizationEditor({
  value,
  onChange,
  trainedDates = [],
  deloadDates = [],
}: {
  value: PeriodizationConfig | null;
  onChange: (v: PeriodizationConfig | null) => void;
  /// Local dates the athlete logged on. Weeks absent from this list didn't
  /// happen, and the cycle doesn't advance through them.
  trainedDates?: string[];
  /// Local dates of sessions logged as deloads — those weeks were deloads.
  deloadDates?: string[];
}) {
  const enabled = value != null;
  // Which block's explanation is open (the 💡 under each block).
  const [openGuide, setOpenGuide] = useState<number | null>(null);
  const cfg = value;

  const enable = () =>
    onChange({ ...DEFAULT_PERIODIZATION, startDate: thisMondayISO() });

  const patch = (p: Partial<PeriodizationConfig>) =>
    cfg && onChange({ ...cfg, ...p });

  const patchBlock = (i: number, p: Partial<{ name: string; weeks: number }>) =>
    cfg &&
    onChange({
      ...cfg,
      blocks: cfg.blocks.map((b, j) => (j === i ? { ...b, ...p } : b)),
    });

  // Recomputed as the athlete edits the start date, so the preview always
  // answers for the cycle currently on screen rather than the saved one.
  const preview = useMemo(() => {
    if (!cfg || !isValidConfig(cfg)) return null;
    return periodizationState(
      cfg,
      todayLocalISO(),
      trainedWeekSet(cfg.startDate, trainedDates),
      deloadWeekSet(cfg.startDate, deloadDates),
    );
  }, [cfg, trainedDates, deloadDates]);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="label">Training cycle</label>
        <span className="text-[10px]" style={{ color: "var(--accent)" }}>
          Feeds the AI prompt
        </span>
      </div>

      {!enabled ? (
        <div className="rounded-xl p-4" style={CARD}>
          <p className="text-[13px] leading-snug" style={{ color: "var(--fg-muted)" }}>
            Set a block cycle and your coach will know exactly which block and week
            you&apos;re in, and when your next deload lands — instead of guessing from
            recent sessions.
          </p>
          <button
            type="button"
            onClick={enable}
            className="mt-3 px-4 py-2 rounded-lg text-[13px] font-semibold"
            style={{ background: "var(--accent)", color: "#0a0a0a" }}
          >
            Set up a cycle
          </button>
        </div>
      ) : (
        <div className="rounded-xl p-4 space-y-4" style={CARD}>
          {preview && (
            <div
              className="rounded-lg px-3 py-2.5"
              style={{
                background: "var(--accent-dim)",
                border: "1px solid var(--accent-ring)",
              }}
            >
              <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                Right now your coach sees
              </p>
              <p className="text-[13px] font-semibold mt-0.5">
                {preview.isDeloadWeek
                  ? `Week ${preview.weekNumber} — Deload week`
                  : `Week ${preview.weekNumber} — ${preview.blockName}, week ${preview.weekInBlock} of ${preview.blockWeeks}`}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                Next up: {preview.nextUp}
              </p>
              {preview.weeksOff > 0 && (
                <p
                  className="text-[11px] mt-1 leading-snug"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {preview.weeksOff} week{preview.weeksOff === 1 ? "" : "s"} without
                  a lifting session {preview.weeksOff === 1 ? "was" : "were"} skipped
                  — the block pauses instead of advancing, so this is training week{" "}
                  {preview.weekNumber} of calendar week {preview.calendarWeek}.
                </p>
              )}
            </div>
          )}

          <div>
            <p className="text-[11px] mb-2" style={{ color: "var(--fg-dim)" }}>
              Blocks, in order — the cycle repeats when it reaches the end.
            </p>
            <div className="space-y-2">
              {cfg!.blocks.map((b, i) => {
                // A house block picked from the menu, or a custom name.
                const guide = BLOCK_GUIDES.find(
                  (g) => g.name.toLowerCase() === b.name.trim().toLowerCase(),
                );
                const custom = !guide;
                const open = openGuide === i;
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <select
                        value={guide ? guide.name : CUSTOM}
                        onChange={(e) =>
                          patchBlock(i, {
                            // A custom block starts named so the cycle stays
                            // valid (a blank name would void it on save).
                            name: e.target.value === CUSTOM ? "Custom block" : e.target.value,
                          })
                        }
                        aria-label={`Block ${i + 1} type`}
                        className={`${INPUT} flex-1 min-w-0`}
                        style={INPUT_STYLE}
                      >
                        {BLOCK_GUIDES.map((g) => (
                          <option key={g.name} value={g.name}>
                            {g.name}
                          </option>
                        ))}
                        <option value={CUSTOM}>Custom…</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setOpenGuide(open ? null : i)}
                        aria-label={`What is ${guide?.name ?? "this block"}?`}
                        aria-expanded={open}
                        className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
                        style={{
                          // Bulb yellow, so it reads as a lightbulb at a glance;
                          // lit (filled, glowing) while its explainer is open.
                          background: open ? "rgba(250,204,21,0.16)" : "rgba(250,204,21,0.08)",
                          color: BULB,
                          border: `1px solid ${open ? "rgba(250,204,21,0.55)" : "rgba(250,204,21,0.3)"}`,
                        }}
                      >
                        <BulbIcon lit={open} />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={26}
                        value={b.weeks}
                        onChange={(e) =>
                          patchBlock(i, { weeks: Math.max(1, Number(e.target.value) || 1) })
                        }
                        aria-label={`Block ${i + 1} weeks`}
                        className={`${INPUT} w-14 text-center tabular-nums`}
                        style={INPUT_STYLE}
                      />
                      <span className="text-[11px] w-5" style={{ color: "var(--fg-dim)" }}>
                        wk
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          cfg!.blocks.length > 1 &&
                          patch({ blocks: cfg!.blocks.filter((_, j) => j !== i) })
                        }
                        disabled={cfg!.blocks.length <= 1}
                        aria-label={`Remove ${b.name || "block"}`}
                        className="w-7 h-7 rounded-lg shrink-0 text-[15px] leading-none disabled:opacity-30"
                        style={{ background: "var(--bg-card)", color: "var(--fg-dim)" }}
                      >
                        ×
                      </button>
                    </div>

                    {custom && (
                      <input
                        value={b.name}
                        onChange={(e) => patchBlock(i, { name: e.target.value })}
                        placeholder="Name your block"
                        aria-label={`Block ${i + 1} custom name`}
                        className={`${INPUT} w-full mt-2`}
                        style={INPUT_STYLE}
                      />
                    )}

                    {open && (
                      <div
                        className="mt-2 rounded-lg px-3 py-2.5 text-[12px] leading-snug space-y-1.5"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          color: "var(--fg-muted)",
                        }}
                      >
                        {guide ? (
                          <>
                            <p className="font-semibold" style={{ color: "var(--fg)" }}>
                              {guide.name}
                            </p>
                            <p>{guide.what}</p>
                            <p>
                              <span style={{ color: "var(--fg-dim)" }}>Effort · </span>
                              {guide.effort}
                            </p>
                            <p>
                              <span style={{ color: "var(--fg-dim)" }}>Rest · </span>
                              {guide.rest}
                            </p>
                            <p style={{ color: "var(--fg)" }}>{guide.why}</p>
                          </>
                        ) : (
                          <p>
                            A block you name yourself has no set prescription — the
                            coach programs it from its name, your coach notes and
                            your recent sessions, defaulting to 3–4 sets of 6–10 at
                            1–2 reps in reserve.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                patch({ blocks: [...cfg!.blocks, { name: "Hypertrophy", weeks: 4 }] })
              }
              className="mt-2 text-[12px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              + Add block
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] block mb-1" style={{ color: "var(--fg-dim)" }}>
                Cycle started
              </label>
              <input
                type="date"
                value={cfg!.startDate}
                onChange={(e) => patch({ startDate: e.target.value })}
                className={`${INPUT} w-full`}
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: "var(--fg-dim)" }}>
                Deload every
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={26}
                  value={cfg!.deloadEveryWeeks ?? 0}
                  onChange={(e) => {
                    const n = Number(e.target.value) || 0;
                    patch({ deloadEveryWeeks: n > 0 ? n : null });
                  }}
                  className={`${INPUT} w-16 text-center tabular-nums`}
                  style={INPUT_STYLE}
                />
                <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                  weeks {cfg!.deloadEveryWeeks ? "" : "(off)"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] block mb-1" style={{ color: "var(--fg-dim)" }}>
              Deload pulls back by {cfg!.deloadReductionPct}%
            </label>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={cfg!.deloadReductionPct}
              onChange={(e) => patch({ deloadReductionPct: Number(e.target.value) })}
              className="w-full"
              style={{ accentColor: "var(--accent)" }}
            />
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[12px]"
              style={{ color: "var(--fg-dim)" }}
            >
              Turn off
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({ ...DEFAULT_PERIODIZATION, startDate: cfg!.startDate })
              }
              className="text-[12px]"
              style={{ color: "var(--fg-dim)" }}
            >
              Reset to standard cycle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const CUSTOM = "__custom__";

const BULB = "#facc15";

function BulbIcon({ lit }: { lit: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill={lit ? BULB : "none"}
      fillOpacity={lit ? 0.35 : undefined}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={lit ? { filter: "drop-shadow(0 0 5px rgba(250,204,21,0.7))" } : undefined}
    >
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
    </svg>
  );
}

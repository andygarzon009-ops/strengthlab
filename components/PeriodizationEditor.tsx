"use client";

// Declares the training cycle the AI coach programs against. The coach can't
// infer a block from session history — its deepest view is ~7 weeks of
// workouts with nothing marking a block start or a deload — so the athlete
// states the cycle here and the week is computed from it.

import {
  DEFAULT_PERIODIZATION,
  periodizationState,
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
}: {
  value: PeriodizationConfig | null;
  onChange: (v: PeriodizationConfig | null) => void;
}) {
  const enabled = value != null;
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

  const preview =
    cfg && isValidConfig(cfg) ? periodizationState(cfg, todayLocalISO()) : null;

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
            </div>
          )}

          <div>
            <p className="text-[11px] mb-2" style={{ color: "var(--fg-dim)" }}>
              Blocks, in order — the cycle repeats when it reaches the end.
            </p>
            <div className="space-y-2">
              {cfg!.blocks.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={b.name}
                    onChange={(e) => patchBlock(i, { name: e.target.value })}
                    placeholder="Block name"
                    className={`${INPUT} flex-1 min-w-0`}
                    style={INPUT_STYLE}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={26}
                    value={b.weeks}
                    onChange={(e) =>
                      patchBlock(i, { weeks: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className={`${INPUT} w-16 text-center tabular-nums`}
                    style={INPUT_STYLE}
                  />
                  <span className="text-[11px] w-6" style={{ color: "var(--fg-dim)" }}>
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
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                patch({ blocks: [...cfg!.blocks, { name: "", weeks: 4 }] })
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

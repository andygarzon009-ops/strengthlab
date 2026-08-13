"use client";

// The prescribed session, rendered from the plan the coach emitted rather
// than from prose. The JSON was already being parsed to drive the "Do this
// workout" button — it carries every load, rep and rest — so the athlete was
// reading a markdown bullet list that restated data we had in structured form.
//
// Warm-up ramp sets get their own quiet line: they belong to the lift and go
// to the log, but they aren't the prescription.

import type { WorkoutPlan, WorkoutPlanSet } from "@/lib/workoutPlan";

function num(v: number | string | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/// "225 lb", or "BW" for an unloaded movement.
function load(weight: number | null): string {
  return weight && weight > 0 ? `${weight} lb` : "BW";
}

type Group = { count: number; reps: number | null; weight: number | null; rir: number | null };

/// Collapse a run of identical sets into "3×5" instead of listing it three
/// times. The plan emits one entry per set so the athlete can tick each one
/// off; that's the right shape for logging and the wrong shape for reading.
function group(sets: WorkoutPlanSet[]): Group[] {
  const out: Group[] = [];
  for (const s of sets) {
    const reps = num(s.reps);
    const weight = num(s.weight);
    const rir = num(s.rir);
    const last = out[out.length - 1];
    if (last && last.reps === reps && last.weight === weight && last.rir === rir) {
      last.count += 1;
    } else {
      out.push({ count: 1, reps, weight, rir });
    }
  }
  return out;
}

function workingLabel(g: Group): string {
  const scheme = `${g.count}×${g.reps ?? "?"}`;
  const rir = g.rir != null ? ` RIR${g.rir}` : "";
  return `${scheme} @ ${load(g.weight)}${rir}`;
}

/// Ramp sets drop the unit — five of them in a row reads as noise, and the
/// working line right above has already established the scale.
function warmupLabel(g: Group): string {
  const w = g.weight && g.weight > 0 ? String(g.weight) : "BW";
  const each = `${w}×${g.reps ?? "?"}`;
  return g.count > 1 ? `${each} ×${g.count}` : each;
}

function restLabel(seconds: number | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function CoachPlanCard({ plan }: { plan: WorkoutPlan }) {
  const totalSets = plan.exercises.reduce((n, e) => n + (e.sets?.length ?? 0), 0);
  const warmupItems = plan.exercises.length;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
      }}
    >
      <div
        className="px-3.5 py-2.5 flex items-baseline justify-between gap-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h3 className="text-[14px] font-bold tracking-tight truncate">
          {plan.title?.trim() || "Today's session"}
        </h3>
        <span
          className="label nums text-[10px] shrink-0"
          style={{ color: "var(--fg-dim)" }}
        >
          {warmupItems} ex · {totalSets} set{totalSets === 1 ? "" : "s"}
        </span>
      </div>

      <ol>
        {plan.exercises.map((ex, i) => {
          const sets = ex.sets ?? [];
          const warm = group(sets.filter((s) => s.type === "WARMUP"));
          const work = group(sets.filter((s) => s.type !== "WARMUP"));
          const rest = restLabel(ex.restSeconds);

          return (
            <li
              key={i}
              className="px-3.5 py-2.5"
              style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span
                    className="nums text-[11px] shrink-0"
                    style={{
                      color: "var(--fg-dim)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-semibold leading-tight">
                    {ex.name}
                  </span>
                </div>
                {rest && (
                  <span
                    className="label nums text-[10px] shrink-0"
                    style={{
                      color: "var(--fg-dim)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    rest {rest}
                  </span>
                )}
              </div>

              {work.length > 0 && (
                <div
                  className="nums text-[13px] mt-1 ml-[18px]"
                  style={{
                    color: "var(--accent)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {work.map(workingLabel).join(" · ")}
                </div>
              )}

              {warm.length > 0 && (
                <div
                  className="nums text-[11px] mt-1 ml-[18px] leading-relaxed"
                  style={{
                    color: "var(--fg-dim)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  <span className="label">warm-up</span>{" "}
                  {warm.map(warmupLabel).join(" · ")}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

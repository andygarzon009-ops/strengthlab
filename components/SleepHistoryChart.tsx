"use client";

import { useMemo, useState } from "react";

export type SleepNightHistory = {
  date: string; // YYYY-MM-DD (local)
  asleepMin: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
};

type Range = "W" | "M";

// Match the stage colors on the "Last night" card.
const DEEP = "#4338ca";
const REM = "#7c3aed";
const LIGHT = "#0ea5e9";

function fmtDur(min: number): string {
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

function labelFor(dateKey: string | undefined): string {
  if (!dateKey) return "";
  const d = new Date(`${dateKey}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function SleepHistoryChart({
  history,
}: {
  history: SleepNightHistory[];
}) {
  const [range, setRange] = useState<Range>("W");

  const days = useMemo(() => {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - (range === "W" ? 6 : 29));
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    return sorted.filter((d) => d.date >= cutoffKey && d.asleepMin > 0);
  }, [history, range]);

  if (history.length === 0) return null;

  const avg =
    days.length > 0
      ? Math.round(days.reduce((s, d) => s + d.asleepMin, 0) / days.length)
      : 0;
  // Scale so the 8h line sits ~60% up and tall nights still fit.
  const maxMin = Math.max(540, ...days.map((d) => d.asleepMin));
  const targetPct = (480 / maxMin) * 100;
  const isMonth = range === "M";

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="label">Sleep tracking</p>
        <div className="flex gap-1">
          {(["W", "M"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="text-[11px] px-2.5 py-1 rounded-full font-semibold"
              style={
                range === r
                  ? { background: "var(--accent)", color: "#0a0a0a" }
                  : {
                      background: "var(--bg-elevated)",
                      color: "var(--fg-dim)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {r === "W" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
            Avg{" "}
            <span
              className="text-[16px] font-bold tabular-nums"
              style={{ color: "var(--fg)" }}
            >
              {avg > 0 ? fmtDur(avg) : "—"}
            </span>
          </p>
          <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {days.length} night{days.length === 1 ? "" : "s"}
          </p>
        </div>

        {days.length === 0 ? (
          <p
            className="text-[12px] py-6 text-center"
            style={{ color: "var(--fg-dim)" }}
          >
            No sleep tracked in this range.
          </p>
        ) : (
          <>
            {/* Stacked stage bars with an 8h reference line */}
            <div className="relative" style={{ height: 104 }}>
              <div
                className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
                style={{ bottom: `${targetPct}%`, borderColor: "var(--border)" }}
              >
                <span
                  className="absolute right-0 -top-3.5 text-[9px]"
                  style={{ color: "var(--fg-dim)" }}
                >
                  8h
                </span>
              </div>
              <div
                className="absolute inset-0 flex items-end"
                style={{ gap: isMonth ? 2 : 5 }}
              >
                {days.map((d) => {
                  const total = d.deepMin + d.lightMin + d.remMin || 1;
                  const barPct = (total / maxMin) * 100;
                  return (
                    <div
                      key={d.date}
                      className="flex-1 flex flex-col justify-end h-full"
                      title={`${labelFor(d.date)}: ${fmtDur(d.asleepMin)} — Deep ${d.deepMin}m · REM ${d.remMin}m · Light ${d.lightMin}m`}
                    >
                      <div
                        className="flex flex-col overflow-hidden"
                        style={{
                          height: `${barPct}%`,
                          borderRadius: isMonth ? 2 : 3,
                        }}
                      >
                        <div style={{ height: `${(d.remMin / total) * 100}%`, background: REM }} />
                        <div style={{ height: `${(d.lightMin / total) * 100}%`, background: LIGHT }} />
                        <div style={{ height: `${(d.deepMin / total) * 100}%`, background: DEEP }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* x range */}
            <div className="flex justify-between mt-1.5 mb-3">
              <span className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
                {labelFor(days[0]?.date)}
              </span>
              <span className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
                {labelFor(days[days.length - 1]?.date)}
              </span>
            </div>

            {/* legend */}
            <div className="flex items-center gap-3">
              {[
                { c: DEEP, l: "Deep" },
                { c: REM, l: "REM" },
                { c: LIGHT, l: "Light" },
              ].map((s) => (
                <span
                  key={s.l}
                  className="text-[10px] flex items-center gap-1"
                  style={{ color: "var(--fg-dim)" }}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-sm"
                    style={{ background: s.c }}
                  />
                  {s.l}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

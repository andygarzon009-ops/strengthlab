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

// Color a night by how much sleep it got.
function barColor(min: number): string {
  if (min >= 420) return "#22c55e"; // 7h+
  if (min >= 360) return "#f59e0b"; // 6–7h
  return "#ef4444"; // <6h
}

function fmtDur(min: number): string {
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

export default function SleepHistoryChart({
  history,
}: {
  history: SleepNightHistory[];
}) {
  const [range, setRange] = useState<Range>("W");

  const days = useMemo(() => {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(range === "W" ? -7 : -30);
  }, [history, range]);

  if (history.length === 0) return null;

  const nights = days.filter((d) => d.asleepMin > 0);
  const avg =
    nights.length > 0
      ? Math.round(nights.reduce((s, d) => s + d.asleepMin, 0) / nights.length)
      : 0;
  // Scale: cap at the larger of the max night or 9h so the target line sits well.
  const maxMin = Math.max(540, ...days.map((d) => d.asleepMin));
  const targetPct = (480 / maxMin) * 100; // 8h reference

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
              className="text-[15px] font-bold tabular-nums"
              style={{ color: "var(--fg)" }}
            >
              {avg > 0 ? fmtDur(avg) : "—"}
            </span>
          </p>
          <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {nights.length} night{nights.length === 1 ? "" : "s"}
          </p>
        </div>

        {/* Bars with an 8h reference line */}
        <div className="relative" style={{ height: 96 }}>
          <div
            className="absolute left-0 right-0 border-t border-dashed"
            style={{
              bottom: `${targetPct}%`,
              borderColor: "var(--border-strong, var(--border))",
            }}
          >
            <span
              className="absolute right-0 -top-3.5 text-[9px]"
              style={{ color: "var(--fg-dim)" }}
            >
              8h
            </span>
          </div>
          <div className="absolute inset-0 flex items-end gap-[3px]">
            {days.map((d) => {
              const h = d.asleepMin > 0 ? (d.asleepMin / maxMin) * 100 : 0;
              return (
                <div
                  key={d.date}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${Math.max(h, d.asleepMin > 0 ? 4 : 0)}%`,
                    minHeight: d.asleepMin > 0 ? 3 : 0,
                    background: d.asleepMin > 0 ? barColor(d.asleepMin) : "transparent",
                  }}
                  title={`${d.date}: ${d.asleepMin > 0 ? fmtDur(d.asleepMin) : "no data"}`}
                />
              );
            })}
          </div>
        </div>

        {/* Sparse x labels */}
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
            {labelFor(days[0]?.date)}
          </span>
          <span className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
            {labelFor(days[days.length - 1]?.date)}
          </span>
        </div>
      </div>
    </div>
  );
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

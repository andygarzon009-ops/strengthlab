"use client";

import { useState } from "react";

export default function HistoryCalendar({
  workoutDates,
  earliestYear,
}: {
  workoutDates: string[];
  earliestYear: number;
}) {
  const dateSet = new Set(workoutDates);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const fmtYMD = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthLabel = firstOfMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const maxYear = now.getFullYear();
  const minYear = Math.min(earliestYear, maxYear - 5);
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  const atMax =
    viewYear > maxYear ||
    (viewYear === maxYear && viewMonth >= now.getMonth());

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const sessionsInView = Array.from({ length: daysInMonth }, (_, i) =>
    dateSet.has(fmtYMD(viewYear, viewMonth, i + 1))
  ).filter(Boolean).length;

  const todayKey = fmtYMD(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="card p-5 mb-4">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="px-2 py-1 rounded-md text-[14px] shrink-0"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            ‹
          </button>
          <p className="font-semibold text-[14px] tracking-tight truncate">
            {monthLabel}
          </p>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={atMax}
            className="px-2 py-1 rounded-md text-[14px] disabled:opacity-30 shrink-0"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            ›
          </button>
          <select
            value={viewYear}
            onChange={(e) => setViewYear(parseInt(e.target.value))}
            className="text-[11px] rounded-md px-1.5 py-1 nums ml-1"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <p
          className="label text-[9px] nums shrink-0"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {sessionsInView} {sessionsInView === 1 ? "session" : "sessions"}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            className="text-[10px] pb-2"
            style={{ color: "var(--fg-dim)" }}
          >
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e-${i}`} />;
          const key = fmtYMD(viewYear, viewMonth, d);
          const hasWorkout = dateSet.has(key);
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className="aspect-square flex items-center justify-center rounded-md text-[12px] nums"
              style={{
                fontFamily: "var(--font-geist-mono)",
                background: hasWorkout
                  ? "var(--accent)"
                  : isToday
                    ? "var(--bg-elevated)"
                    : "transparent",
                color: hasWorkout
                  ? "#0a0a0a"
                  : isToday
                    ? "var(--fg)"
                    : "var(--fg-dim)",
                fontWeight: hasWorkout || isToday ? 600 : 400,
                border:
                  isToday && !hasWorkout
                    ? "1px solid var(--border-strong)"
                    : "none",
              }}
            >
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

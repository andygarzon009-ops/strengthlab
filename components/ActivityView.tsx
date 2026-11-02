"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ActivityChart, { type ActivityRange } from "@/components/ActivityChart";

type RangeDay = {
  dateKey: string;
  moveKcal: number;
  exerciseMin: number;
  sessions: number;
};

type Workout = {
  id: string;
  title: string;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  calories: number | null;
  activeZoneMin: number | null;
  duration: number | null;
};

type Initial = {
  range: ActivityRange;
  tz: string;
  moveGoal: number;
  exerciseGoal: number;
  sessionGoal: number;
  days: RangeDay[];
};

const RANGE_DAYS: Record<ActivityRange, number> = {
  D: 1,
  W: 7,
  M: 30,
  Y: 365,
};

const RANGE_LABEL: Record<ActivityRange, string> = {
  D: "Today",
  W: "Last 7 days",
  M: "Last 30 days",
  Y: "Last 12 months",
};

function formatWorkoutDate(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60 * 60) return `${Math.max(1, Math.floor(sec / 60))}m ago`;
  if (sec < 60 * 60 * 24) return `${Math.floor(sec / 3600)}h ago`;
  const day = Math.floor(sec / 86400);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ActivityView({
  initial,
  workouts,
}: {
  initial: Initial;
  workouts: Workout[];
}) {
  const [range, setRange] = useState<ActivityRange>("D");

  const filtered = useMemo(() => {
    const cutoff = Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    return workouts
      .map((w) => ({
        ...w,
        sortAt: new Date(w.endedAt ?? w.startedAt ?? w.date),
      }))
      .filter((w) => w.sortAt.getTime() >= cutoff)
      .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
  }, [range, workouts]);

  return (
    <div>
      <ActivityChart
        initial={initial}
        range={range}
        onRangeChange={setRange}
      />

      <div className="mt-6">
        <div className="flex items-baseline justify-between mb-2.5 px-1">
          <h2 className="text-[17px] font-extrabold tracking-tight">Workouts</h2>
          <span className="text-[11px] font-bold uppercase" style={{ letterSpacing: "0.12em", color: "var(--fg-dim)" }}>
            {RANGE_LABEL[range]}
          </span>
        </div>
        {filtered.length === 0 ? (
          <div
            className="rounded-[22px] p-6 text-center"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)" }}
          >
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              No workouts {RANGE_LABEL[range].toLowerCase()}.
            </p>
          </div>
        ) : (
          <div
            className="rounded-[22px] overflow-hidden"
            style={{ background: "linear-gradient(180deg, #141416, var(--bg-card))", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {filtered.map((w, i) => {
              const min =
                w.activeZoneMin && w.activeZoneMin > 0
                  ? w.activeZoneMin
                  : w.duration && w.duration > 0
                    ? Math.round(w.duration / 60)
                    : null;
              return (
                <Link
                  key={w.id}
                  href={`/workout/${w.id}`}
                  className="flex items-center gap-3 px-4 min-h-16 active:opacity-70"
                  style={{ borderTop: i === 0 ? undefined : "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span
                    className="w-10 h-10 shrink-0 rounded-[13px] flex items-center justify-center"
                    style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)" }}
                    aria-hidden
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold truncate">{w.title}</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
                      {formatWorkoutDate(w.sortAt)}
                      {min !== null ? ` · ${min} min` : ""}
                    </p>
                  </div>
                  <p className="text-right tabular-nums" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    <span className="text-[16px] font-bold" style={{ color: w.calories ? "#fb923c" : "var(--fg-dim)" }}>
                      {w.calories ?? "—"}
                    </span>
                    <span className="text-[10px] ml-1" style={{ color: "var(--fg-dim)" }}>
                      cal
                    </span>
                  </p>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-dim)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

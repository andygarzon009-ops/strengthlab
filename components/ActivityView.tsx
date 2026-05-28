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
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[15px] font-bold tracking-tight">Workouts</h2>
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {RANGE_LABEL[range]}
          </span>
        </div>
        {filtered.length === 0 ? (
          <div
            className="rounded-2xl p-5 text-center"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
              No workouts {RANGE_LABEL[range].toLowerCase()}.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((w) => {
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
                  className="card flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium truncate">{w.title}</p>
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {formatWorkoutDate(w.sortAt)}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-[15px] font-bold">
                      {w.calories ?? "—"}
                      <span
                        className="text-[10px] ml-1"
                        style={{ color: "var(--fg-dim)" }}
                      >
                        cal
                      </span>
                    </p>
                    {min !== null && (
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--fg-dim)" }}
                      >
                        {min} min
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

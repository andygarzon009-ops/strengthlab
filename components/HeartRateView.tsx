"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DailyHRChart, { type Range } from "@/components/DailyHRChart";

type Sample = { t: string; bpm: number };
type Workout = {
  id: string;
  title: string;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
};

const RANGE_DAYS: Record<Range, number> = {
  // H slices an hour off the day; the cutoff is hours, not days, but the
  // shape still fits since the filter is just a millisecond comparison.
  H: 1 / 24,
  D: 1,
  W: 7,
  M: 30,
  Y: 365,
};

const RANGE_LABEL: Record<Range, string> = {
  H: "Last hour",
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
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function HeartRateView({
  initial,
  workouts,
}: {
  initial: {
    connected: boolean;
    samples: Sample[];
    tz: string;
    dateKey: string;
  };
  workouts: Workout[];
}) {
  const [range, setRange] = useState<Range>("D");

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
      <DailyHRChart
        initial={initial}
        range={range}
        onRangeChange={setRange}
      />

      <div className="mt-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[15px] font-bold tracking-tight">
            Workouts
          </h2>
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
              No workouts with HR data {RANGE_LABEL[range].toLowerCase()}.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((w) => (
              <Link
                key={w.id}
                href={`/workout/${w.id}`}
                className="card flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: "#ef4444" }}
                    />
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      Workout HR
                    </span>
                  </div>
                  <p className="text-[14px] font-medium truncate">{w.title}</p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {formatWorkoutDate(w.sortAt)}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-[16px] font-bold">
                    {w.avgHeartRate ?? "—"}
                    <span
                      className="text-[10px] ml-1"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      avg
                    </span>
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                    max {w.maxHeartRate ?? "—"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

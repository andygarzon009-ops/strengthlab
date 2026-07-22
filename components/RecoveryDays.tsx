"use client";

// "Last 7 days" recovery trend — each bar is tappable, and selecting a day
// swaps the sleep card below it to that night's data. Today's bar carries the
// full hypnogram (stages are only persisted for last night); earlier days fall
// back to the stage-composition view built from the 30-night sleep history.

import { useState } from "react";
import { sleepQualityScore } from "@/lib/sleepScore";
import SleepDetail, { type SleepSummary } from "@/components/SleepDetail";
import { type SleepNightHistory } from "@/components/SleepHistoryChart";

const BAND_COLOR: Record<string, string> = {
  primed: "#22c55e",
  moderate: "#f59e0b",
  low: "#ef4444",
};

export type TrendDay = { dateKey: string; score: number; band: string | null };

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

// dateKey is YYYY-MM-DD; parse as UTC noon so the weekday is stable.
function asDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

function longLabel(dateKey: string): string {
  return asDate(dateKey).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function RecoveryDays({
  days,
  history,
  lastNight,
  lastNightKey,
}: {
  days: TrendDay[];
  history: SleepNightHistory[];
  lastNight: SleepSummary | null;
  lastNightKey: string | null;
}) {
  const latestKey = days[days.length - 1]?.dateKey ?? null;
  const [selected, setSelected] = useState<string | null>(latestKey);

  // Prefer the full stored summary (it has stages + toSleepMin) when the
  // selected day is the night we last synced; otherwise rebuild from history.
  let sleep: SleepSummary | null = null;
  if (selected && lastNight && selected === lastNightKey) {
    sleep = lastNight;
  } else if (selected) {
    const night = history.find((n) => n.date === selected);
    if (night && night.asleepMin > 0) {
      sleep = {
        asleepMin: night.asleepMin,
        inBedMin:
          night.inBedMin ?? night.asleepMin + (night.awakeMin ?? 0),
        deepMin: night.deepMin,
        remMin: night.remMin,
        lightMin: night.lightMin,
        awakeMin: night.awakeMin,
        startUtc: night.startUtc,
        endUtc: night.endUtc,
        offsetSec: night.offsetSec,
      };
    }
  }

  const isToday = selected != null && selected === latestKey;
  const title = isToday && sleep === lastNight ? "Last night" : selected ? longLabel(selected) : "";

  return (
    <>
      <div className="mb-5">
        <p className="label mb-2">Last {days.length} days</p>
        <div
          className="rounded-xl px-2 py-4 flex items-end justify-between"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            height: 118,
          }}
        >
          {days.map((d) => {
            const c = d.band
              ? (BAND_COLOR[d.band] ?? "var(--fg-dim)")
              : "var(--fg-dim)";
            const h = Math.max(6, (Math.min(100, d.score) / 100) * 64);
            const dow = DOW[asDate(d.dateKey).getUTCDay()];
            const on = d.dateKey === selected;
            return (
              <button
                key={d.dateKey}
                type="button"
                onClick={() => setSelected(d.dateKey)}
                aria-pressed={on}
                aria-label={`${longLabel(d.dateKey)} — recovery ${d.score}`}
                className="flex flex-col items-center gap-1.5 flex-1 rounded-lg py-1.5"
                style={
                  on
                    ? { background: "var(--bg-elevated)" }
                    : { background: "transparent" }
                }
              >
                <span
                  className="text-[10px] font-bold tabular-nums"
                  style={{ color: on ? c : "var(--fg-dim)" }}
                >
                  {d.score}
                </span>
                <div
                  className="rounded-full"
                  style={{
                    width: 8,
                    height: h,
                    background: c,
                    opacity: on ? 1 : 0.5,
                  }}
                />
                <span
                  className="text-[10px]"
                  style={{
                    color: on ? "var(--fg)" : "var(--fg-dim)",
                    fontWeight: on ? 700 : 400,
                  }}
                >
                  {dow}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {sleep ? (
        <SleepDetail
          sleep={sleep}
          qualityScore={sleepQualityScore(
            sleep.asleepMin,
            sleep.deepMin,
            sleep.remMin,
          )}
          title={title}
        />
      ) : (
        <div className="mb-5">
          <p className="label mb-2">{title}</p>
          <div
            className="rounded-2xl px-5 py-8 text-center"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
              No sleep tracked for this night.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

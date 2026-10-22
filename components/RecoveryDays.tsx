"use client";

// "Last 7 days" recovery trend — each bar is tappable, and selecting a day
// swaps the sleep card below it to that night's data. Today's bar carries the
// full hypnogram (stages are only persisted for last night); earlier days fall
// back to the stage-composition view built from the 30-night sleep history.

import { useState } from "react";
import { sleepQualityScore } from "@/lib/sleepScore";
import SleepDetail, { type SleepSummary } from "@/components/SleepDetail";
import { type SleepNightHistory } from "@/components/SleepHistoryChart";

// Same red→amber→green scale as the gauge (kept local: this is a client
// module and the gauge's copy lives in a server component).
function scaleColor(score: number): string {
  const p = Math.max(0, Math.min(100, score));
  return `hsl(${Math.round((p / 100) * 130)}, 78%, 50%)`;
}

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
        toSleepMin: night.toSleepMin,
        // Only the newest 7 nights carry segments; older ones fall back to the
        // composition view inside <SleepDetail>.
        stages: night.stages?.length ? night.stages : undefined,
      };
    }
  }

  const isToday = selected != null && selected === latestKey;
  const title = isToday && sleep === lastNight ? "Last night" : selected ? longLabel(selected) : "";

  return (
    <>
      <TrendChart days={days} selected={selected} onSelect={setSelected} />

      {sleep ? (
        <SleepDetail
          sleep={sleep}
          qualityScore={sleepQualityScore(
            sleep.asleepMin,
            sleep.deepMin,
            sleep.remMin,
          )}
          title={title}
          nightDate={selected ?? undefined}
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

// Smooth line through the points (Catmull-Rom → cubic Bézier).
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/// Readiness over the last week: a smooth line with a soft area under it, a
/// dot per day in that day's colour, and the 7-day average dashed across.
/// Each day's column is a tap target that swaps the sleep card below.
function TrendChart({
  days,
  selected,
  onSelect,
}: {
  days: TrendDay[];
  selected: string | null;
  onSelect: (k: string) => void;
}) {
  const W = 340;
  const H = 120;
  const padX = 22;
  const top = 18;
  const bottom = 14;
  const n = days.length;
  const xAt = (i: number) => (n === 1 ? W / 2 : padX + (i / (n - 1)) * (W - 2 * padX));
  const yAt = (v: number) => top + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - top - bottom);
  const pts = days.map((d, i) => ({ x: xAt(i), y: yAt(d.score) }));
  const line = smoothPath(pts);
  const area = line
    ? `${line} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`
    : "";
  const avg = Math.round(days.reduce((s, d) => s + d.score, 0) / Math.max(1, n));
  const selIdx = days.findIndex((d) => d.dateKey === selected);

  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between mb-2">
        <p className="label" style={{ color: "var(--fg-muted)" }}>
          Last {n} days
        </p>
        <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
          avg <span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>{avg}</span>
        </p>
      </div>
      <div
        className="rounded-2xl pt-3 pb-2 px-1"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
      >
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" aria-hidden>
            <defs>
              <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="trend-line" x1="0" y1="0" x2="1" y2="0">
                {days.map((d, i) => (
                  <stop
                    key={d.dateKey}
                    offset={`${n === 1 ? 0 : (i / (n - 1)) * 100}%`}
                    stopColor={scaleColor(d.score)}
                  />
                ))}
              </linearGradient>
            </defs>
            {[25, 50, 75].map((g) => (
              <line key={g} x1={0} x2={W} y1={yAt(g)} y2={yAt(g)} stroke="#1c1c20" strokeWidth={1} />
            ))}
            <line
              x1={0}
              x2={W}
              y1={yAt(avg)}
              y2={yAt(avg)}
              stroke="#52525b"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            {selIdx >= 0 && (
              <line
                x1={pts[selIdx].x}
                x2={pts[selIdx].x}
                y1={pts[selIdx].y}
                y2={H}
                stroke="#3f3f46"
                strokeWidth={1.5}
              />
            )}
            {area && <path d={area} fill="url(#trend-area)" />}
            {line && (
              <path
                d={line}
                fill="none"
                stroke="url(#trend-line)"
                strokeWidth={3}
                strokeLinecap="round"
              />
            )}
            {pts.map((p, i) => {
              const on = i === selIdx;
              const c = scaleColor(days[i].score);
              return (
                <g key={days[i].dateKey}>
                  {on && <circle cx={p.x} cy={p.y} r={11} fill={c} opacity={0.2} />}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={on ? 6 : 4.5}
                    fill={on ? c : "#0f0f11"}
                    stroke={c}
                    strokeWidth={on ? 0 : 2.5}
                  />
                </g>
              );
            })}
          </svg>
          {/* tap targets, one column per day */}
          <div className="absolute inset-0 flex">
            {days.map((d) => (
              <button
                key={d.dateKey}
                type="button"
                onClick={() => onSelect(d.dateKey)}
                aria-pressed={d.dateKey === selected}
                aria-label={`${longLabel(d.dateKey)}: readiness ${d.score}`}
                className="flex-1"
              />
            ))}
          </div>
        </div>
        <div className="flex px-0.5">
          {days.map((d) => {
            const on = d.dateKey === selected;
            return (
              <button
                key={d.dateKey}
                type="button"
                onClick={() => onSelect(d.dateKey)}
                className="flex-1 flex flex-col items-center py-1.5 rounded-xl"
                style={{ background: on ? "var(--bg-elevated)" : "transparent" }}
              >
                <span
                  className="text-[15px] font-bold tabular-nums leading-tight"
                  style={{ color: on ? scaleColor(d.score) : "var(--fg)" }}
                >
                  {d.score}
                </span>
                <span
                  className="text-[11px] font-medium"
                  style={{ color: on ? "var(--fg)" : "var(--fg-muted)" }}
                >
                  {DOW[asDate(d.dateKey).getUTCDay()]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type SessionRow = {
  workoutId: string;
  at: string;
  topWeight: number;
  topReps: number;
  topE1rm: number;
  isPR: boolean;
  setE1rms: number[];
};

type Range = "W" | "M" | "Y";
const RANGE_LABELS: { value: Range; label: string }[] = [
  { value: "W", label: "W" },
  { value: "M", label: "M" },
  { value: "Y", label: "Y" },
];
const RANGE_DAYS: Record<Range, number> = { W: 7, M: 30, Y: 365 };
const RANGE_SUBTITLE: Record<Range, string> = {
  W: "Last 7 days",
  M: "Last 30 days",
  Y: "Last 12 months",
};

const COLOR = "#22c55e";
const PR_COLOR = "#eab308";

function formatRelative(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60 * 60) return `${Math.max(1, Math.floor(sec / 60))}m ago`;
  if (sec < 60 * 60 * 24) return `${Math.floor(sec / 3600)}h ago`;
  const day = Math.floor(sec / 86400);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function LiftDrilldownChart({
  sessions,
}: {
  sessions: SessionRow[];
}) {
  const [range, setRange] = useState<Range>("M");
  // When the user taps a dot, we highlight the corresponding row in the
  // sessions list and scroll it into view rather than navigating away.
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    return sessions.filter((s) => new Date(s.at).getTime() >= cutoff);
  }, [sessions, range]);

  const latest = sessions.length ? sessions[sessions.length - 1] : null;
  const bestEver = sessions.reduce((m, s) => (s.topE1rm > m ? s.topE1rm : m), 0);
  const prCount = sessions.filter((s) => s.isPR).length;

  return (
    <div>
      {/* Summary tiles */}
      <div
        className="rounded-2xl p-4 mb-3 grid grid-cols-3 gap-3"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <Tile
          label="Current 1RM"
          value={latest ? `${Math.round(latest.topE1rm).toLocaleString()}` : "—"}
          unit="lb"
          color={COLOR}
        />
        <Tile
          label="Best 1RM"
          value={bestEver > 0 ? `${Math.round(bestEver).toLocaleString()}` : "—"}
          unit="lb"
        />
        <Tile
          label="PRs"
          value={String(prCount)}
          unit=""
          color={prCount > 0 ? PR_COLOR : undefined}
        />
      </div>

      {/* Range chips */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="flex gap-1 p-1 rounded-full flex-1"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          {RANGE_LABELS.map((r) => {
            const active = r.value === range;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className="flex-1 py-1.5 rounded-full text-[12px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--bg-elevated)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-dim)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div
        className="rounded-2xl p-4 mb-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-wider font-semibold mb-1"
          style={{ color: "var(--fg-dim)" }}
        >
          Est. 1RM (lb) · trend
        </p>
        <p
          className="text-[11px] mb-3"
          style={{ color: "var(--fg-dim)" }}
        >
          {RANGE_SUBTITLE[range]} · {filtered.length} session
          {filtered.length === 1 ? "" : "s"} · faint dots are working sets, bold dots are session tops
        </p>
        {filtered.length === 0 ? (
          <p
            className="text-[12px] py-8 text-center"
            style={{ color: "var(--fg-dim)" }}
          >
            No sessions in this window.
          </p>
        ) : (
          <LineChart
            sessions={filtered}
            range={range}
            selectedWorkoutId={selectedWorkoutId}
            onSelect={(id) =>
              setSelectedWorkoutId((cur) => (cur === id ? null : id))
            }
          />
        )}
      </div>

      {/* Session list */}
      {filtered.length > 0 && (
        <SessionList
          sessions={[...filtered].reverse()}
          selectedWorkoutId={selectedWorkoutId}
          onClear={() => setSelectedWorkoutId(null)}
        />
      )}
    </div>
  );
}

function SessionList({
  sessions,
  selectedWorkoutId,
  onClear,
}: {
  sessions: SessionRow[];
  selectedWorkoutId: string | null;
  onClear: () => void;
}) {
  const rowRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());

  // Scroll the selected row into view when the user taps a dot.
  useEffect(() => {
    if (!selectedWorkoutId) return;
    const el = rowRefs.current.get(selectedWorkoutId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedWorkoutId]);

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[14px] font-bold tracking-tight">Sessions</h2>
        {selectedWorkoutId && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] underline"
            style={{ color: "var(--fg-dim)" }}
          >
            Clear selection
          </button>
        )}
      </div>
      <div className="space-y-2">
        {sessions.map((s) => {
          const isSelected = s.workoutId === selectedWorkoutId;
          return (
            <Link
              key={s.workoutId + s.at}
              ref={(el) => {
                if (el) rowRefs.current.set(s.workoutId, el);
                else rowRefs.current.delete(s.workoutId);
              }}
              href={`/workout/${s.workoutId}`}
              className="card flex items-center justify-between px-4 py-3 transition-colors"
              style={
                isSelected
                  ? {
                      borderColor: "var(--accent)",
                      background: "var(--accent-dim)",
                    }
                  : undefined
              }
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium tabular-nums">
                  {s.topWeight} × {s.topReps}
                  {s.isPR && (
                    <span
                      className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(234,179,8,0.15)",
                        color: PR_COLOR,
                        border: "1px solid rgba(234,179,8,0.35)",
                      }}
                    >
                      PR
                    </span>
                  )}
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {formatRelative(new Date(s.at))}
                </p>
              </div>
              <div className="text-right tabular-nums">
                <p className="text-[14px] font-bold">
                  {Math.round(s.topE1rm)}
                  <span
                    className="text-[10px] ml-1"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    e1RM
                  </span>
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color?: string;
}) {
  return (
    <div>
      <p
        className="text-[9px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </p>
      <p
        className="text-[18px] font-bold tabular-nums"
        style={{ color: color ?? "var(--fg)" }}
      >
        {value}
        {unit && (
          <span
            className="text-[10px] ml-0.5"
            style={{ color: "var(--fg-dim)" }}
          >
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function LineChart({
  sessions,
  range,
  selectedWorkoutId,
  onSelect,
}: {
  sessions: SessionRow[];
  range: Range;
  selectedWorkoutId: string | null;
  onSelect: (workoutId: string) => void;
}) {
  const W = 320;
  const H = 200;
  const padL = 8;
  const padR = 32;
  const padT = 12;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const cutoff = Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  const windowStart = cutoff;
  const windowEnd = Date.now();
  const span = Math.max(1, windowEnd - windowStart);

  // Smart axis: bracket the actual e1rm range to use the full plot height.
  // Pad ±5 lb so a point doesn't sit on the edge. Include EVERY set's e1rm
  // (not just top-set) so volume work doesn't clip below the visible range.
  const allVals: number[] = [];
  for (const s of sessions) {
    allVals.push(s.topE1rm);
    for (const v of s.setE1rms) allVals.push(v);
  }
  const minVal = Math.max(0, Math.min(...allVals) - 5);
  const maxVal = Math.max(...allVals) + 5;
  const span2 = Math.max(1, maxVal - minVal);

  const xFor = (atIso: string) => {
    const t = new Date(atIso).getTime();
    return padL + ((t - windowStart) / span) * plotW;
  };
  const yFor = (v: number) =>
    padT + plotH * (1 - (v - minVal) / span2);

  const linePath = sessions
    .map((s, i) => `${i === 0 ? "M" : "L"}${xFor(s.at)},${yFor(s.topE1rm)}`)
    .join(" ");

  // 3 y-ticks: min, mid, max.
  const yTicks = [minVal, (minVal + maxVal) / 2, maxVal];

  // X ticks vary by range.
  const MONTH_ABBR = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const DAY_ABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const xTicks: { x: number; label: string }[] = [];
  if (range === "W") {
    for (let i = 0; i < 7; i++) {
      const t = windowStart + ((i + 0.5) / 7) * span;
      const d = new Date(t);
      xTicks.push({
        x: padL + ((t - windowStart) / span) * plotW,
        label: DAY_ABBR[d.getDay()],
      });
    }
  } else {
    const monthsSeen = new Map<string, number>();
    sessions.forEach((s) => {
      const d = new Date(s.at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthsSeen.has(key)) monthsSeen.set(key, d.getTime());
    });
    // Also include the window start/end month so an empty stretch still labels.
    const startD = new Date(windowStart);
    const endD = new Date(windowEnd);
    const ensure = (d: Date) => {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthsSeen.has(key)) {
        monthsSeen.set(
          key,
          new Date(d.getFullYear(), d.getMonth(), 15).getTime(),
        );
      }
    };
    ensure(startD);
    ensure(endD);
    for (const [, t] of monthsSeen) {
      if (t < windowStart || t > windowEnd) continue;
      const d = new Date(t);
      xTicks.push({
        x: padL + ((t - windowStart) / span) * plotW,
        label: MONTH_ABBR[d.getMonth()],
      });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block" }}
      preserveAspectRatio="none"
    >
      {yTicks.map((y, i) => (
        <line
          key={`y-${i}`}
          x1={padL}
          x2={W - padR}
          y1={yFor(y)}
          y2={yFor(y)}
          stroke="var(--border)"
          strokeDasharray="2 3"
          strokeWidth={0.5}
        />
      ))}
      {yTicks.map((y, i) => (
        <text
          key={`yl-${i}`}
          x={W - padR + 4}
          y={yFor(y) + 3}
          fontSize="9"
          fill="var(--fg-dim)"
        >
          {Math.round(y)}{i === yTicks.length - 1 ? " lb" : ""}
        </text>
      ))}
      {xTicks.map((t, i) => (
        <text
          key={`xl-${i}`}
          x={t.x}
          y={H - padB + 14}
          fontSize="9"
          fill="var(--fg-dim)"
          textAnchor="middle"
        >
          {t.label}
        </text>
      ))}

      {/* All-sets scatter underneath the trend line. Non-top sets render
          as faint dots so volume days show as a vertical column. */}
      {sessions.map((s) =>
        s.setE1rms
          .filter((v) => v !== s.topE1rm)
          .map((v, j) => (
            <circle
              key={`set-${s.workoutId}-${j}`}
              cx={xFor(s.at)}
              cy={yFor(v)}
              r={1.8}
              fill={COLOR}
              fillOpacity={0.35}
            />
          )),
      )}

      <path
        d={linePath}
        fill="none"
        stroke={COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {sessions.map((s, i) => {
        const cx = xFor(s.at);
        const cy = yFor(s.topE1rm);
        const isSelected = s.workoutId === selectedWorkoutId;
        const onActivate = () => onSelect(s.workoutId);
        // Selected dot ring expands to make the highlight unambiguous; PR
        // dots are slightly larger by default.
        const r = isSelected ? 6 : s.isPR ? 4 : 2.5;
        const ringR = isSelected ? r + 3 : 0;
        return (
          <g
            key={i}
            onClick={onActivate}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`${s.topWeight} × ${s.topReps} session, est 1RM ${Math.round(s.topE1rm)} lb${s.isPR ? ", PR" : ""}`}
            style={{ cursor: "pointer", outline: "none" }}
          >
            {/* Invisible hit zone wider than the visible dot so it's easy
                to tap on mobile and to keyboard-focus. */}
            <circle cx={cx} cy={cy} r={9} fill="transparent" />
            {ringR > 0 && (
              <circle
                cx={cx}
                cy={cy}
                r={ringR}
                fill="none"
                stroke={s.isPR ? PR_COLOR : COLOR}
                strokeOpacity={0.45}
                strokeWidth={1.5}
              />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={s.isPR ? PR_COLOR : COLOR}
              stroke={isSelected || s.isPR ? "var(--bg-card)" : "none"}
              strokeWidth={isSelected ? 2 : s.isPR ? 1.5 : 0}
            />
          </g>
        );
      })}
    </svg>
  );
}

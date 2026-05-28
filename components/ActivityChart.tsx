"use client";

import { useEffect, useMemo, useState } from "react";

export type ActivityRange = "D" | "W" | "M" | "Y";

type RangeDay = {
  dateKey: string;
  moveKcal: number;
  exerciseMin: number;
  sessions: number;
};

type Payload = {
  range: ActivityRange;
  tz: string;
  moveGoal: number;
  exerciseGoal: number;
  sessionGoal: number;
  days: RangeDay[];
};

const MOVE_COLOR = "#fa114f";
const EXERCISE_COLOR = "#a4f803";
const SESSION_COLOR = "#1dd2e6";

const RANGE_LABELS: { value: ActivityRange; label: string }[] = [
  { value: "D", label: "D" },
  { value: "W", label: "W" },
  { value: "M", label: "M" },
  { value: "Y", label: "Y" },
];

const RANGE_SUBTITLE: Record<ActivityRange, string> = {
  D: "Today",
  W: "Last 7 days",
  M: "Last 30 days",
  Y: "Last 12 months",
};

export default function ActivityChart({
  initial,
  range,
  onRangeChange,
}: {
  initial: Payload;
  range: ActivityRange;
  onRangeChange: (r: ActivityRange) => void;
}) {
  const [data, setData] = useState<Payload>(initial);
  const [loading, setLoading] = useState(false);

  // Fetch new range when chip changes; D refetches too so the user can
  // see today's totals update after closing a fresh workout.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/activity/range?range=${range}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const totals = useMemo(() => {
    const move = data.days.reduce((s, d) => s + d.moveKcal, 0);
    const ex = data.days.reduce((s, d) => s + d.exerciseMin, 0);
    const sessions = data.days.reduce((s, d) => s + d.sessions, 0);
    return { move, ex, sessions };
  }, [data]);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/activity/range?range=${range}`, {
        cache: "no-store",
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  };

  return (
    <div>
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
                onClick={() => onRangeChange(r.value)}
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
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: loading
                ? "act-spin 0.9s linear infinite"
                : undefined,
            }}
          >
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <polyline points="21 3 21 8 16 8" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <polyline points="3 21 3 16 8 16" />
          </svg>
        </button>
      </div>
      <style>{`@keyframes act-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {range === "D" ? (
        <DayCard
          today={data.days[data.days.length - 1]}
          moveGoal={data.moveGoal}
          exerciseGoal={data.exerciseGoal}
          sessionGoal={data.sessionGoal}
        />
      ) : (
        <RangeCard
          days={data.days}
          range={range}
          moveGoal={data.moveGoal}
          exerciseGoal={data.exerciseGoal}
          subtitle={RANGE_SUBTITLE[range]}
          totals={totals}
        />
      )}
    </div>
  );
}

function DayCard({
  today,
  moveGoal,
  exerciseGoal,
  sessionGoal,
}: {
  today: RangeDay | undefined;
  moveGoal: number;
  exerciseGoal: number;
  sessionGoal: number;
}) {
  const move = today?.moveKcal ?? 0;
  const ex = today?.exerciseMin ?? 0;
  const sess = today?.sessions ?? 0;

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <p
        className="text-[10px] uppercase tracking-wider font-semibold mb-1"
        style={{ color: "var(--fg-dim)" }}
      >
        Today
      </p>
      <div className="flex items-center gap-5">
        <BigRings
          move={{ value: move, goal: moveGoal }}
          exercise={{ value: ex, goal: exerciseGoal }}
          session={{ value: sess, goal: sessionGoal }}
        />
        <div className="flex-1 space-y-3 min-w-0">
          <BigStat label="Move" value={move} goal={moveGoal} unit="cal" color={MOVE_COLOR} />
          <BigStat label="Exercise" value={ex} goal={exerciseGoal} unit="min" color={EXERCISE_COLOR} />
          <BigStat label="Sessions" value={sess} goal={sessionGoal} unit="" color={SESSION_COLOR} />
        </div>
      </div>
    </div>
  );
}

function RangeCard({
  days,
  range,
  moveGoal,
  exerciseGoal,
  subtitle,
  totals,
}: {
  days: RangeDay[];
  range: ActivityRange;
  moveGoal: number;
  exerciseGoal: number;
  subtitle: string;
  totals: { move: number; ex: number; sessions: number };
}) {
  const movedDays = days.filter((d) => d.moveKcal > 0).length;
  const avgMove = movedDays > 0 ? Math.round(totals.move / movedDays) : 0;
  const avgEx = movedDays > 0 ? Math.round(totals.ex / movedDays) : 0;

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl p-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--fg-dim)" }}
        >
          Move
        </p>
        <div className="flex items-baseline gap-2 mb-1 tabular-nums">
          <span className="text-[26px] font-bold" style={{ color: MOVE_COLOR }}>
            {totals.move.toLocaleString()}
          </span>
          <span
            className="text-[12px]"
            style={{ color: "var(--fg-dim)" }}
          >
            CAL
          </span>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--fg-dim)" }}>
          {subtitle} · avg {avgMove}/day
        </p>
        <BarChart
          days={days}
          range={range}
          field="moveKcal"
          color={MOVE_COLOR}
          goalLine={moveGoal}
        />
      </div>

      <div
        className="rounded-2xl p-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--fg-dim)" }}
        >
          Exercise
        </p>
        <div className="flex items-baseline gap-2 mb-1 tabular-nums">
          <span
            className="text-[26px] font-bold"
            style={{ color: EXERCISE_COLOR }}
          >
            {totals.ex.toLocaleString()}
          </span>
          <span
            className="text-[12px]"
            style={{ color: "var(--fg-dim)" }}
          >
            MIN
          </span>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--fg-dim)" }}>
          {subtitle} · avg {avgEx}/day
        </p>
        <BarChart
          days={days}
          range={range}
          field="exerciseMin"
          color={EXERCISE_COLOR}
          goalLine={exerciseGoal}
        />
      </div>
    </div>
  );
}

function BigRings({
  move,
  exercise,
  session,
}: {
  move: { value: number; goal: number };
  exercise: { value: number; goal: number };
  session: { value: number; goal: number };
}) {
  const size = 150;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 14;
  const gap = 3;
  const rOuter = cx - stroke / 2;
  const rMiddle = rOuter - stroke - gap;
  const rInner = rMiddle - stroke - gap;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Ring
        cx={cx}
        cy={cy}
        r={rOuter}
        stroke={stroke}
        color={MOVE_COLOR}
        pct={Math.min(1, move.value / move.goal)}
      />
      <Ring
        cx={cx}
        cy={cy}
        r={rMiddle}
        stroke={stroke}
        color={EXERCISE_COLOR}
        pct={Math.min(1, exercise.value / exercise.goal)}
      />
      <Ring
        cx={cx}
        cy={cy}
        r={rInner}
        stroke={stroke}
        color={SESSION_COLOR}
        pct={Math.min(1, session.value / session.goal)}
      />
    </svg>
  );
}

function Ring({
  cx,
  cy,
  r,
  stroke,
  color,
  pct,
}: {
  cx: number;
  cy: number;
  r: number;
  stroke: number;
  color: string;
  pct: number;
}) {
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  return (
    <g transform={`rotate(-90 ${cx} ${cy})`}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeOpacity={0.18}
        strokeWidth={stroke}
      />
      {pct > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
        />
      )}
    </g>
  );
}

function BigStat({
  label,
  value,
  goal,
  unit,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </p>
      <p className="text-[18px] font-bold tabular-nums" style={{ color }}>
        {value.toLocaleString()}
        <span
          className="text-[10px] ml-1"
          style={{ color: "var(--fg-dim)" }}
        >
          /{goal.toLocaleString()}
          {unit ? ` ${unit}` : ""}
        </span>
      </p>
    </div>
  );
}

function BarChart({
  days,
  range,
  field,
  color,
  goalLine,
}: {
  days: RangeDay[];
  range: ActivityRange;
  field: "moveKcal" | "exerciseMin";
  color: string;
  goalLine: number;
}) {
  const W = 320;
  const H = 180;
  const padL = 8;
  const padR = 32;
  const padT = 8;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = days.length || 1;
  const slotW = plotW / n;
  const barW = Math.max(2, slotW - 2);

  const maxVal = Math.max(
    goalLine,
    ...days.map((d) => d[field]),
  );
  // Round axis max up to nearest 100 for kcal or 30 for min for clean ticks.
  const niceMax = (() => {
    if (field === "moveKcal") return Math.max(100, Math.ceil(maxVal / 100) * 100);
    return Math.max(30, Math.ceil(maxVal / 30) * 30);
  })();

  const yFor = (v: number) =>
    padT + plotH * (1 - Math.min(1, v / niceMax));

  const yTicks = [0, niceMax / 2, niceMax];

  const MONTH_ABBR = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const ticks: { index: number; label: string }[] = [];
  if (range === "W") {
    days.forEach((d, i) =>
      ticks.push({ index: i, label: d.dateKey.slice(8, 10) }),
    );
  } else {
    const byMonth = new Map<string, number[]>();
    days.forEach((d, i) => {
      const m = d.dateKey.slice(0, 7);
      const cur = byMonth.get(m);
      if (cur) cur.push(i);
      else byMonth.set(m, [i]);
    });
    const minSpan = range === "M" ? 3 : 1;
    for (const [month, indices] of byMonth) {
      if (indices.length < minSpan) continue;
      const midIdx = indices[Math.floor(indices.length / 2)];
      const monthNum = Number(month.slice(5, 7));
      ticks.push({ index: midIdx, label: MONTH_ABBR[monthNum - 1] ?? "" });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block" }}
      preserveAspectRatio="none"
    >
      {yTicks.map((y) => (
        <line
          key={`y-${y}`}
          x1={padL}
          x2={W - padR}
          y1={yFor(y)}
          y2={yFor(y)}
          stroke="var(--border)"
          strokeDasharray="2 3"
          strokeWidth={0.5}
        />
      ))}
      {yTicks.map((y) => (
        <text
          key={`yl-${y}`}
          x={W - padR + 4}
          y={yFor(y) + 3}
          fontSize="9"
          fill="var(--fg-dim)"
        >
          {Math.round(y)}
        </text>
      ))}
      <line
        x1={padL}
        x2={W - padR}
        y1={yFor(goalLine)}
        y2={yFor(goalLine)}
        stroke={color}
        strokeOpacity={0.4}
        strokeDasharray="3 3"
        strokeWidth={1}
      />
      {ticks.map((t) => (
        <text
          key={`xl-${t.index}-${t.label}`}
          x={padL + t.index * slotW + slotW / 2}
          y={H - padB + 14}
          fontSize="9"
          fill="var(--fg-dim)"
          textAnchor="middle"
        >
          {t.label}
        </text>
      ))}
      {days.map((d, i) => {
        const v = d[field];
        if (v <= 0) return null;
        const x = padL + i * slotW + (slotW - barW) / 2;
        const y = yFor(v);
        const h = Math.max(2, padT + plotH - y);
        return (
          <rect
            key={d.dateKey}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1.5}
            fill={color}
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
}

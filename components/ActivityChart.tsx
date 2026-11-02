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

// Matches the feed Activity card — warmer, non-Apple palette.
const MOVE_COLOR = "#f97316";
const EXERCISE_COLOR = "#22c55e";
const SESSION_COLOR = "#38bdf8";

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
          role="tablist"
          aria-label="Range"
          className="flex gap-1 p-1 rounded-full flex-1"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {RANGE_LABELS.map((r) => {
            const active = r.value === range;
            return (
              <button
                key={r.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onRangeChange(r.value)}
                className="flex-1 min-h-9 rounded-full text-[12.5px] font-bold transition-colors"
                style={
                  active
                    ? { background: "linear-gradient(160deg, #4ade80, #16a34a)", color: "#052e14", boxShadow: "0 6px 16px rgba(34,197,94,0.35)" }
                    : { color: "var(--fg-muted)" }
                }
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
          className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--fg-muted)" }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animation: loading ? "act-spin 0.9s linear infinite" : undefined }}
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

// The same glass-and-glow card the Today page uses.
const glowCard = (rgb: string, at = "50% 0%") => ({
  background: `radial-gradient(80% 55% at ${at}, rgba(${rgb},0.16), transparent 70%), linear-gradient(180deg, #161618, var(--bg-card) 70%)`,
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 20px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
});

const RING_COLOR = "#38bdf8";

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
  // The Today page's Activity ring: each goal capped at 100%, averaged.
  const share = (v: number, g: number) => Math.min(1, g > 0 ? v / g : 0);
  const pct = Math.round(((share(move, moveGoal) + share(ex, exerciseGoal) + share(sess, sessionGoal)) / 3) * 100);
  const size = 132;
  const stroke = 11;
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="rounded-[28px] p-5" style={glowCard("56,189,248", "25% 30%")}>
      <div className="flex items-center gap-5">
        <span className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% of today's activity goals`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={RING_COLOR} strokeOpacity={0.14} strokeWidth={stroke} />
            {pct > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={RING_COLOR}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * c} ${c}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ filter: `drop-shadow(0 0 8px ${RING_COLOR})` }}
              />
            )}
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[36px] font-bold leading-none tabular-nums" style={{ fontFamily: "var(--font-geist-mono)", letterSpacing: "-0.05em" }}>
              {pct}%
            </span>
            <span className="text-[10px] font-extrabold uppercase mt-1.5" style={{ color: "#7dd3fc", letterSpacing: "0.16em" }}>
              of goals
            </span>
          </span>
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: "0.14em", color: "#7dd3fc" }}>
            Today
          </span>
          <span className="text-[34px] font-bold leading-none tabular-nums" style={{ fontFamily: "var(--font-geist-mono)", letterSpacing: "-0.05em", color: MOVE_COLOR }}>
            {move.toLocaleString()}
          </span>
          <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            active calories
          </span>
        </div>
      </div>
      <div className="space-y-4 mt-5">
        <DayBar label="Move" value={move} goal={moveGoal} unit="cal" color={MOVE_COLOR} />
        <DayBar label="Exercise" value={ex} goal={exerciseGoal} unit="min" color={EXERCISE_COLOR} />
        <DayBar label="Sessions" value={sess} goal={sessionGoal} unit="" color={SESSION_COLOR} />
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

  const block = (
    label: string,
    total: number,
    unit: string,
    avg: number,
    color: string,
    rgb: string,
    field: "moveKcal" | "exerciseMin",
    goal: number,
  ) => (
    <div className="rounded-[26px] p-4" style={glowCard(rgb, "0% 0%")}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: "0.14em", color }}>
            {label}
          </p>
          <p className="flex items-baseline gap-1.5 mt-1 tabular-nums">
            <span className="text-[32px] font-bold leading-none" style={{ fontFamily: "var(--font-geist-mono)", letterSpacing: "-0.05em" }}>
              {total.toLocaleString()}
            </span>
            <span className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
              {unit}
            </span>
          </p>
        </div>
        <span className="text-right">
          <span className="block text-[10px] font-bold uppercase" style={{ letterSpacing: "0.12em", color: "var(--fg-dim)" }}>
            Avg / day
          </span>
          <span className="block text-[16px] font-bold tabular-nums" style={{ fontFamily: "var(--font-geist-mono)", color }}>
            {avg.toLocaleString()}
          </span>
        </span>
      </div>
      <p className="text-[11px] mt-1 mb-3" style={{ color: "var(--fg-dim)" }}>
        {subtitle} · dashed line is your goal
      </p>
      <BarChart days={days} range={range} field={field} color={color} goalLine={goal} />
    </div>
  );

  return (
    <div className="space-y-3">
      {block("Move", totals.move, "cal", avgMove, MOVE_COLOR, "249,115,22", "moveKcal", moveGoal)}
      {block("Exercise", totals.ex, "min", avgEx, EXERCISE_COLOR, "34,197,94", "exerciseMin", exerciseGoal)}
    </div>
  );
}

function DayBar({
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
  const pct = Math.min(1, goal > 0 ? value / goal : 0);
  const done = value >= goal && goal > 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase" style={{ letterSpacing: "0.12em", color: "var(--fg-muted)" }}>
          <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          {label}
        </span>
        <span className="tabular-nums" style={{ fontFamily: "var(--font-geist-mono)" }}>
          <span className="text-[18px] font-bold">{value.toLocaleString()}</span>
          <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
            {" "}/ {goal.toLocaleString()}
            {unit ? ` ${unit}` : ""}
          </span>
          {done && (
            <span className="text-[13px] font-bold ml-1" style={{ color }}>
              ✓
            </span>
          )}
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, #0a0a0a), ${color})`,
            boxShadow: pct > 0 ? `0 0 10px ${color}88` : undefined,
            transition: "width 600ms ease",
          }}
        />
      </div>
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
  const DAY_ABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const ticks: { index: number; label: string }[] = [];
  if (range === "W") {
    days.forEach((d, i) => {
      const [yy, mm, dd] = d.dateKey.split("-").map(Number);
      const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
      ticks.push({ index: i, label: DAY_ABBR[dow] });
    });
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
      <defs>
        <linearGradient id={`act-bar-${field}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity={0.45} />
        </linearGradient>
      </defs>
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
            rx={Math.min(3, barW / 2)}
            fill={`url(#act-bar-${field})`}
          />
        );
      })}
    </svg>
  );
}

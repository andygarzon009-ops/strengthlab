"use client";

// The Fuel page's charts, built the way the sleep and heart-rate charts are:
// an SVG plot with recessive grid, a dashed goal line labelled on the right
// axis, thin rounded marks with 2px surface gaps, and a hold-and-drag readout.
//
// Macro colours are validated for colour-vision deficiency on the dark card
// surface (dataviz validator, 2026-10-19): protein pink, carbs blue, fat
// amber, fiber teal. Every chart also labels its values in text, so identity
// never rests on colour alone.

import ChartScrubTrack from "@/components/ChartScrubTrack";
import type { FoodRow, FuelDayView } from "@/components/FuelWeek";

export const PROTEIN = "#ec4899";
export const CARBS = "#3b82f6";
export const FAT = "#c2820a";
export const FIBER = "#0d9488";
const GOAL = "#a3e635";
const OVER = "#f59e0b";
const GAP = 2; // surface gap between stacked fills

const RATING_COLOR: Record<string, string> = {
  "on track": "#22c55e",
  good: "#84cc16",
  "off target": "#f59e0b",
  "needs work": "#ef4444",
};

function dow(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
function longDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`);

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--fg-muted)" }}>
      <span className="inline-block w-2 h-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl py-2.5 px-2 text-center" style={{ background: "var(--bg-elevated)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>{label}</p>
      <p className="text-[16px] font-bold tabular-nums leading-tight mt-0.5">{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>{note}</p>
    </div>
  );
}

// ── This week ───────────────────────────────────────────────────────────────

const W = 340;
const H = 184;
const PAD_L = 4;
const PAD_R = 30;
const PAD_T = 10;
const PAD_B = 36;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/// Seven days as stacked macro bars (calories from protein, carbs, fat) under
/// each day's own calorie target, drawn as a dashed lime step. Hold and drag
/// to read a day; tap to open it below.
export function WeekChart({
  days,
  selected,
  onSelect,
}: {
  days: FuelDayView[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const n = days.length;
  const peak = Math.max(
    1,
    ...days.map((d) => Math.max(d.intake.kcal, d.targets.calorieTargetKcal)),
  );
  // At most ~4 gridlines, like the sleep chart's hour axis.
  const step = peak > 2000 ? 1000 : 500;
  const yMax = Math.ceil((peak * 1.08) / step) * step;
  const y = (v: number) => PAD_T + PLOT_H - (v / yMax) * PLOT_H;
  const base = PAD_T + PLOT_H;
  const slot = PLOT_W / n;
  const bw = Math.min(26, slot * 0.56);
  const cx = (i: number) => PAD_L + slot * (i + 0.5);
  const ticks: number[] = [];
  for (let v = step; v <= yMax; v += step) ticks.push(v);
  const lastTarget = days[n - 1].targets.calorieTargetKcal;

  const logged = days.filter((d) => d.logged);
  const closed = logged.filter((d) => !d.partial);
  const avg = (f: (d: FuelDayView) => number) =>
    logged.length ? Math.round(logged.reduce((s, d) => s + f(d), 0) / logged.length) : 0;
  const onTarget = closed.filter((d) => d.score.rating === "on track" || d.score.rating === "good").length;

  return (
    <div>
      <ChartScrubTrack
        xFracs={days.map((_, i) => (i + 0.5) / n)}
        padLeft={PAD_L / W}
        padRight={PAD_R / W}
        hint={
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            Hold and drag to read a day · tap to open it
          </span>
        }
        onTap={(i) => onSelect(days[i].date)}
        readout={(i) => {
          const d = days[i];
          return (
            <div className="flex items-center gap-3 tabular-nums min-w-0">
              <div className="shrink-0">
                <p className="text-[16px] font-bold leading-none">
                  {d.logged ? d.intake.kcal.toLocaleString() : "—"}
                  <span className="text-[11px] font-medium ml-1" style={{ color: "var(--fg-muted)" }}>
                    / {d.targets.calorieTargetKcal.toLocaleString()}
                  </span>
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>{longDate(d.date)}</p>
              </div>
              {d.logged && (
                <div className="flex gap-2.5 text-[11px] flex-wrap">
                  {[
                    ["Protein", d.intake.proteinG, PROTEIN],
                    ["Carbs", d.intake.carbsG, CARBS],
                    ["Fat", d.intake.fatG, FAT],
                  ].map(([l, v, c]) => (
                    <span key={l as string} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-[2px]" style={{ background: c as string }} />
                      <span style={{ color: "var(--fg-muted)" }}>{l}</span>
                      <b>{Math.round(v as number)}g</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      >
        {(idx) => (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-label="Calories by day, stacked by macro">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={0.6} />
                {/* The target label wins the right edge when they'd collide. */}
                {Math.abs(y(v) - y(lastTarget)) > 11 && (
                  <text x={W - PAD_R + 5} y={y(v) + 3} fontSize="9" fill="var(--fg-muted)">{k(v)}</text>
                )}
              </g>
            ))}
            <line x1={PAD_L} x2={W - PAD_R} y1={base} y2={base} stroke="var(--border-strong)" strokeWidth={0.8} />

            {days.map((d, i) => {
              const on = d.date === selected;
              const dim = idx != null ? idx !== i : !on;
              const x = cx(i) - bw / 2;
              if (!d.logged) {
                return (
                  <rect
                    key={d.date}
                    x={x}
                    y={base - 6}
                    width={bw}
                    height={6}
                    rx={2}
                    fill="none"
                    stroke="var(--border-strong)"
                    strokeDasharray="2 2"
                  />
                );
              }
              const p = d.intake.proteinG * 4;
              const c = d.intake.carbsG * 4;
              const f = d.intake.fatG * 9;
              const sum = p + c + f || 1;
              const top = y(d.intake.kcal);
              const h = base - top;
              // Segments share the bar's height in proportion to their calories.
              const segs = [
                { v: p, col: PROTEIN },
                { v: c, col: CARBS },
                { v: f, col: FAT },
              ].filter((s) => s.v > 0);
              let acc = base;
              return (
                <g key={d.date} opacity={dim ? 0.42 : 1}>
                  <clipPath id={`fw-${i}`}>
                    <rect x={x} y={top} width={bw} height={h + 6} rx={4} />
                  </clipPath>
                  <g clipPath={`url(#fw-${i})`}>
                    {segs.map((s, si) => {
                      const sh = (s.v / sum) * h;
                      acc -= sh;
                      const last = si === segs.length - 1;
                      return (
                        <rect
                          key={si}
                          x={x}
                          y={acc + (last ? 0 : GAP / 2)}
                          width={bw}
                          height={Math.max(0, sh - (last ? GAP / 2 : GAP))}
                          fill={s.col}
                        />
                      );
                    })}
                  </g>
                </g>
              );
            })}

            {/* Each day's own calorie target, as a dashed step. */}
            {days.map((d, i) => (
              <line
                key={`t-${d.date}`}
                x1={PAD_L + slot * i + 3}
                x2={PAD_L + slot * (i + 1) - 3}
                y1={y(d.targets.calorieTargetKcal)}
                y2={y(d.targets.calorieTargetKcal)}
                stroke={GOAL}
                strokeWidth={1.4}
                strokeDasharray="4 3"
                opacity={0.9}
              />
            ))}
            <text x={W - PAD_R + 5} y={y(lastTarget) + 3} fontSize="9" fontWeight={700} fill={GOAL}>
              {k(Math.round(lastTarget / 10) * 10)}
            </text>

            {days.map((d, i) => {
              const on = d.date === selected;
              const scoreTxt = !d.logged ? "—" : d.partial ? `${d.progress.pct}%` : `${d.score.score}`;
              const scoreCol = !d.logged
                ? "var(--fg-dim)"
                : d.partial
                  ? "#38bdf8"
                  : (RATING_COLOR[d.score.rating] ?? "var(--fg-muted)");
              return (
                <g key={`l-${d.date}`}>
                  <text x={cx(i)} y={base + 14} fontSize="10" textAnchor="middle" fontWeight={on ? 700 : 400} fill={on ? "var(--fg)" : "var(--fg-muted)"}>
                    {dow(d.date)}
                  </text>
                  <text x={cx(i)} y={base + 28} fontSize="10" textAnchor="middle" fontWeight={700} fill={scoreCol}>
                    {scoreTxt}
                  </text>
                  {on && <circle cx={cx(i)} cy={base + 33} r={1.6} fill="var(--fg)" />}
                </g>
              );
            })}
          </svg>
        )}
      </ChartScrubTrack>

      <div className="flex items-center gap-3 mt-1.5 px-1 flex-wrap">
        <Swatch color={PROTEIN} label="Protein" />
        <Swatch color={CARBS} label="Carbs" />
        <Swatch color={FAT} label="Fat" />
        <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--fg-muted)" }}>
          <svg width="14" height="4" aria-hidden><line x1="0" x2="14" y1="2" y2="2" stroke={GOAL} strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          Target
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <StatTile label="Avg intake" value={logged.length ? avg((d) => d.intake.kcal).toLocaleString() : "—"} note="kcal / logged day" />
        <StatTile label="Avg protein" value={logged.length ? `${avg((d) => d.intake.proteinG)} g` : "—"} note={`target ${days[n - 1].targets.proteinTargetG} g`} />
        <StatTile label="On target" value={`${onTarget}/${closed.length || 0}`} note="finished days" />
      </div>
    </div>
  );
}

// ── Macros ──────────────────────────────────────────────────────────────────

/// Where the calories came from (a donut), then each macro against its target
/// as a bullet bar with the target marked.
export function MacroPanel({ day }: { day: FuelDayView }) {
  const i = day.intake;
  const t = day.targets;
  const parts = [
    { label: "Protein", g: i.proteinG, kcal: i.proteinG * 4, target: t.proteinTargetG, color: PROTEIN },
    { label: "Carbs", g: i.carbsG, kcal: i.carbsG * 4, target: t.carbTargetG, color: CARBS },
    { label: "Fat", g: i.fatG, kcal: i.fatG * 9, target: t.fatTargetG, color: FAT },
  ];
  const sum = parts.reduce((s, p) => s + p.kcal, 0) || 1;

  // Donut arcs with a small surface gap between them.
  const R = 44;
  const C = 2 * Math.PI * R;
  const gapLen = 3;
  let offset = 0;

  return (
    <div>
      <div className="flex items-center gap-5">
        <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0" aria-label="Calories by macro">
          <circle cx="56" cy="56" r={R} fill="none" stroke="var(--bg-elevated)" strokeWidth="12" />
          {parts.map((p) => {
            const len = (p.kcal / sum) * C;
            const seg = Math.max(0, len - gapLen);
            const el = (
              <circle
                key={p.label}
                cx="56"
                cy="56"
                r={R}
                fill="none"
                stroke={p.color}
                strokeWidth="12"
                strokeDasharray={`${seg} ${C - seg}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 56 56)"
              />
            );
            offset += len;
            return p.kcal > 0 ? el : null;
          })}
          <text x="56" y="56" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--fg)" style={{ fontVariantNumeric: "tabular-nums" }}>
            {i.kcal.toLocaleString()}
          </text>
          <text x="56" y="71" textAnchor="middle" fontSize="10" fill="var(--fg-muted)">kcal</text>
        </svg>
        <div className="flex-1 min-w-0 space-y-2">
          {parts.map((p) => (
            <div key={p.label} className="flex items-center gap-2 text-[13px]">
              <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: p.color }} />
              <span className="flex-1">{p.label}</span>
              <span className="tabular-nums font-semibold">{Math.round((p.kcal / sum) * 100)}%</span>
              <span className="tabular-nums text-[11px] w-[54px] text-right" style={{ color: "var(--fg-muted)" }}>
                {Math.round(p.kcal).toLocaleString()} kcal
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {parts.map((p) => {
          const scaleMax = Math.max(p.target * 1.25, p.g, 1);
          const fill = (Math.min(p.g, scaleMax) / scaleMax) * 100;
          const mark = (p.target / scaleMax) * 100;
          const over = p.g > p.target;
          const left = Math.round(p.target - p.g);
          return (
            <div key={p.label}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="font-semibold">{p.label}</span>
                <span className="tabular-nums text-[12px]">
                  <b>{Math.round(p.g)}</b>
                  <span style={{ color: "var(--fg-muted)" }}> / {p.target} g</span>
                </span>
              </div>
              <div className="relative h-[10px] rounded-full mt-1.5" style={{ background: "var(--bg-elevated)" }}>
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill}%`, background: p.color }} />
                <div
                  className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full"
                  style={{ left: `calc(${mark}% - 1px)`, background: "var(--fg)", boxShadow: "0 0 0 2px var(--bg-card)" }}
                  aria-hidden
                />
              </div>
              <p className="text-[11px] mt-1 tabular-nums" style={{ color: over ? OVER : "var(--fg-muted)" }}>
                {over ? `${Math.round(p.g - p.target)} g over target` : left > 0 ? `${left} g to go` : "On target"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Today's food ────────────────────────────────────────────────────────────

const MEAL_META: Record<string, { icon: string; label: string; order: number }> = {
  BREAKFAST: { icon: "☀️", label: "Breakfast", order: 0 },
  LUNCH: { icon: "🍽️", label: "Lunch", order: 1 },
  DINNER: { icon: "🌙", label: "Dinner", order: 2 },
  SNACK: { icon: "🍎", label: "Snack", order: 3 },
  ANYTIME: { icon: "🍴", label: "Anytime", order: 4 },
  OTHER: { icon: "🍴", label: "Other", order: 5 },
};
const mealMeta = (key: string) =>
  MEAL_META[key] ?? { icon: "🍴", label: key.charAt(0) + key.slice(1).toLowerCase(), order: 6 };

function MacroStrip({ p, c, f, height = 6 }: { p: number; c: number; f: number; height?: number }) {
  const parts = [
    { v: p * 4, col: PROTEIN },
    { v: c * 4, col: CARBS },
    { v: f * 9, col: FAT },
  ].filter((x) => x.v > 0);
  const sum = parts.reduce((s, x) => s + x.v, 0);
  if (sum <= 0) return <div className="rounded-full" style={{ height, background: "var(--bg-elevated)" }} />;
  return (
    <div className="flex rounded-full overflow-hidden" style={{ height, gap: GAP }}>
      {parts.map((x, i) => (
        <div key={i} style={{ flexGrow: x.v, flexBasis: 0, background: x.col }} />
      ))}
    </div>
  );
}

function Grams({ p, c, f }: { p: number; c: number; f: number }) {
  return (
    <span className="flex gap-2.5 text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
      {[
        ["P", p, PROTEIN],
        ["C", c, CARBS],
        ["F", f, FAT],
      ].map(([l, v, col]) => (
        <span key={l as string} className="flex items-center gap-1" style={{ opacity: (v as number) > 0 ? 1 : 0.45 }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: col as string }} />
          {l} {Math.round(v as number)}
        </span>
      ))}
    </span>
  );
}

/// The day's diary: each meal with its calories and macro split, each food
/// with a bar sized to its share of the day's biggest item.
export function FoodDiary({ foods, intake }: { foods: FoodRow[]; intake: FuelDayView["intake"] }) {
  const meals = [...new Set(foods.map((f) => f.meal))].sort((a, b) => mealMeta(a).order - mealMeta(b).order);
  const biggest = Math.max(1, ...foods.map((f) => f.kcal));

  return (
    <div>
      {meals.map((meal, mi) => {
        const list = foods.filter((f) => f.meal === meal);
        const m = mealMeta(meal);
        const sum = list.reduce(
          (a, f) => ({ kcal: a.kcal + f.kcal, p: a.p + f.proteinG, c: a.c + f.carbsG, f: a.f + f.fatG }),
          { kcal: 0, p: 0, c: 0, f: 0 },
        );
        return (
          <div key={meal} className={mi > 0 ? "mt-4 pt-4" : ""} style={mi > 0 ? { borderTop: "1px solid var(--border)" } : undefined}>
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-bold tracking-tight">
                <span aria-hidden>{m.icon}</span> {m.label}
              </p>
              <p className="text-[14px] font-bold tabular-nums">
                {Math.round(sum.kcal).toLocaleString()}
                <span className="text-[11px] font-medium ml-1" style={{ color: "var(--fg-muted)" }}>kcal</span>
              </p>
            </div>
            <div className="mt-2">
              <MacroStrip p={sum.p} c={sum.c} f={sum.f} />
            </div>
            <div className="mt-2.5 space-y-2.5">
              {list.map((f, fi) => (
                <div key={`${f.name}-${fi}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] truncate" title={f.name}>{f.name}</span>
                    <span className="text-[13px] tabular-nums shrink-0" style={{ color: "var(--fg-muted)" }}>
                      {Math.round(f.kcal).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="h-[4px] rounded-full overflow-hidden" style={{ width: "38%", background: "var(--bg-elevated)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(f.kcal / biggest) * 100}%`, background: "var(--fg-muted)" }} />
                    </div>
                    <Grams p={f.proteinG} c={f.carbsG} f={f.fatG} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-4 pt-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border-strong)" }}>
        <span className="text-[13px] font-bold">Total</span>
        <div className="flex items-center gap-3">
          <Grams p={intake.proteinG} c={intake.carbsG} f={intake.fatG} />
          <span className="text-[14px] font-bold tabular-nums">{Math.round(intake.kcal).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ── Fiber & the rest ────────────────────────────────────────────────────────

/// Below this share of the day's calories, a nutrient total is a floor.
const MICRO_COVERAGE_OK = 0.9;

function MicroTile({
  label,
  value,
  target,
  unit,
  kind,
  color,
  coverage,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  /// A goal to reach (fiber) or a limit to stay under (sugar, sat fat, sodium).
  kind: "goal" | "limit";
  color: string;
  coverage: number;
}) {
  const partial = coverage < MICRO_COVERAGE_OK;
  // Sodium runs to four digits; "2.1k" keeps the tile on one line.
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
  const scaleMax = Math.max(target * 1.3, value, 1);
  const fill = (value / scaleMax) * 100;
  const mark = (target / scaleMax) * 100;
  const over = kind === "limit" && value > target;
  const met = kind === "goal" && value >= target;
  const barColor = over ? OVER : color;
  const note = partial
    ? "partial — some foods didn't report it"
    : kind === "goal"
      ? met
        ? "✓ goal met"
        : `${Math.round(target - value).toLocaleString()} ${unit} to go`
      : over
        ? `${Math.round(value - target).toLocaleString()} ${unit} over limit`
        : "✓ under limit";

  return (
    <div className="rounded-2xl px-3.5 pt-3 pb-3" style={{ background: "var(--bg-elevated)" }}>
      <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>{label}</p>
      <p className="mt-1 leading-none tabular-nums whitespace-nowrap">
        <span className="text-[22px] font-bold" style={{ letterSpacing: "-0.02em" }}>
          {fmt(value)}
          {partial && <span style={{ color: "var(--fg-muted)" }}>+</span>}
        </span>
        <span className="text-[11px] ml-1" style={{ color: "var(--fg-muted)" }}>
          / {fmt(target)} {unit}
        </span>
      </p>
      <div className="relative h-[8px] rounded-full mt-2.5" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${fill}%`,
            // A partial total is striped so it can't read as a measurement.
            background: partial ? `repeating-linear-gradient(90deg, ${barColor} 0 4px, transparent 4px 7px)` : barColor,
            opacity: partial ? 0.7 : 1,
          }}
        />
        <div
          className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full"
          style={{ left: `calc(${mark}% - 1px)`, background: "var(--fg)", boxShadow: "0 0 0 2px var(--bg-elevated)" }}
          aria-hidden
        />
      </div>
      <p className="text-[10.5px] mt-1.5 leading-tight" style={{ color: over ? OVER : met ? "#4ade80" : "var(--fg-muted)" }}>
        {note}
      </p>
    </div>
  );
}

export function MicroGrid({ day, fiberTarget, sugarLimit, sodiumLimit }: {
  day: FuelDayView;
  fiberTarget: number;
  sugarLimit: number;
  sodiumLimit: number;
}) {
  const i = day.intake;
  const cov = (v: number) => (i.kcal > 0 ? v / i.kcal : 1);
  return (
    <div className="grid grid-cols-2 gap-2">
      <MicroTile label="Fiber" value={i.fiberG} target={fiberTarget} unit="g" kind="goal" color={FIBER} coverage={cov(i.microCoverageKcal.fiber)} />
      <MicroTile label="Sugar" value={i.sugarG} target={sugarLimit} unit="g" kind="limit" color="#71717a" coverage={cov(i.microCoverageKcal.sugar)} />
      <MicroTile
        label="Sat. fat"
        value={i.satFatG}
        target={Math.round((day.targets.calorieTargetKcal * 0.06) / 9)}
        unit="g"
        kind="limit"
        color="#71717a"
        coverage={cov(i.microCoverageKcal.satFat)}
      />
      <MicroTile label="Sodium" value={i.sodiumMg} target={sodiumLimit} unit="mg" kind="limit" color="#71717a" coverage={cov(i.microCoverageKcal.sodium)} />
    </div>
  );
}

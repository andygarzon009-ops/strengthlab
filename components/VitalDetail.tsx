"use client";

// One overnight vital in depth: last night against your usual, a trend you can
// switch between night / week / month / year, the range's low and high, and
// what the number means. Data comes live from Google Health via
// /api/health/vitals/[metric]; the month loads on open, the year on first tap.

import { useEffect, useMemo, useState } from "react";
import { useScrub } from "@/lib/useScrub";
import {
  fmtVital,
  vitalIsGood,
  VITALS,
  type VitalKey,
  type VitalPoint,
  type VitalSample,
} from "@/lib/vitals";

export type VitalNight = {
  date: string; // local wake date
  startUtc: string;
  endUtc: string;
  offsetSec: number;
};

type Range = "D" | "W" | "M" | "Y";
type Load = "loading" | "ready" | "error";

const GOOD = "#4ade80";
const WARN = "#fb923c";

const W = 320;
const H = 170;
const PAD_L = 6;
const PAD_R = 34;
const PAD_T = 12;
const PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

function dateOf(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}
function dayLabel(key: string): string {
  return dateOf(key).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
function weekday(key: string): string {
  return dateOf(key).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}
function clock(ms: number, offsetSec: number, short = false): string {
  const d = new Date(ms + offsetSec * 1000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return short ? `${h}${ampm}` : `${h}:${String(m).padStart(2, "0")}${ampm}`;
}
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/// Catmull-Rom through the points, same as the sleep and strength charts.
function curve(pts: { x: number; y: number }[]): string {
  const f = (n: number) => n.toFixed(2);
  if (pts.length === 0) return "";
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1.x + (p2.x - p0.x) / 6)},${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)},${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/// Three or four round-number gridlines covering [lo, hi].
function niceScale(lo: number, hi: number): { min: number; max: number; ticks: number[] } {
  const span = Math.max(hi - lo, 0.4);
  const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50];
  const step = steps.find((s) => span / s <= 4) ?? 100;
  const min = Math.floor((lo - span * 0.15) / step) * step;
  const max = Math.ceil((hi + span * 0.15) / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  return { min, max, ticks };
}

/// The year is too dense night by night: one point per week, by its Monday.
function weekly(points: VitalPoint[]): VitalPoint[] {
  const groups = new Map<string, VitalPoint[]>();
  for (const p of points) {
    const d = dateOf(p.date);
    const dow = (d.getUTCDay() + 6) % 7;
    const key = new Date(d.getTime() - dow * 86400e3).toISOString().slice(0, 10);
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, g]) => {
      const los = g.map((p) => p.lo).filter((x): x is number => x != null);
      return {
        date,
        v: g.reduce((s, p) => s + p.v, 0) / g.length,
        ...(los.length ? { lo: Math.min(...los) } : {}),
      };
    });
}

function Stat({ label, value, note, color }: { label: string; value: string; note: string; color?: string }) {
  return (
    <div className="rounded-xl py-2.5 px-2 text-center" style={{ background: "var(--bg-elevated)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>{label}</p>
      <p className="text-[16px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: color ?? "var(--fg)" }}>
        {value}
      </p>
      <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--fg-muted)" }}>{note}</p>
    </div>
  );
}

function TrendChart({
  metric,
  points,
  mode,
  usual,
}: {
  metric: VitalKey;
  points: VitalPoint[];
  mode: Range;
  usual: number | null;
}) {
  const cfg = VITALS[metric];
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  const n = points.length;
  const vals = points.flatMap((p) => (p.lo != null ? [p.v, p.lo] : [p.v]));
  if (usual != null) vals.push(usual);
  const { min, max, ticks } = niceScale(Math.min(...vals), Math.max(...vals));
  const x = (i: number) => PAD_L + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const y = (v: number) => PAD_T + PLOT_H * (1 - (v - min) / (max - min || 1));
  const line = points.map((p, i) => ({ x: x(i), y: y(p.v) }));
  const lows = points.every((p) => p.lo != null)
    ? points.map((p, i) => ({ x: x(i), y: y(p.lo!) }))
    : null;
  const base = PAD_T + PLOT_H;
  const area = `${curve(line)} L${x(n - 1).toFixed(2)},${base} L${x(0).toFixed(2)},${base} Z`;
  const id = `vt-${metric}`;

  const idx =
    frac == null
      ? null
      : Math.max(0, Math.min(n - 1, Math.round(((frac * W - PAD_L) / PLOT_W) * (n - 1))));
  const active = idx != null ? points[idx] : null;
  const labelEvery = mode === "W" ? 1 : Math.ceil(n / (mode === "Y" ? 6 : 5));
  const tickFmt = (t: number) =>
    metric === "temp" ? (t === 0 ? "0" : fmtVital("temp", t)) : cfg.decimals ? `${+t.toFixed(1)}` : `${Math.round(t)}`;

  return (
    <div className="select-none">
      <div className="h-9 flex items-center">
        {active ? (
          <div className="tabular-nums">
            <p className="text-[16px] font-bold leading-none">
              {fmtVital(metric, active.v)}
              <span className="text-[11px] font-normal ml-1" style={{ color: "var(--fg-muted)" }}>{cfg.unit}</span>
              {active.lo != null && (
                <span className="text-[11px] font-normal ml-2" style={{ color: "var(--fg-muted)" }}>
                  low {fmtVital(metric, active.lo)}
                  {cfg.unit}
                </span>
              )}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              {mode === "Y" ? `Week of ${dayLabel(active.date)}` : `${weekday(active.date)} ${dayLabel(active.date)}`}
            </p>
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            Hold and drag to read a {mode === "Y" ? "week" : "night"}
          </span>
        )}
      </div>

      <div ref={trackRef} className="relative touch-none cursor-ew-resize" {...handlers}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={0.6} />
              <text x={W - PAD_R + 5} y={y(t) + 3} fontSize="9" fill="var(--fg-muted)">
                {tickFmt(t)}
              </text>
            </g>
          ))}

          {usual != null && (
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(usual)}
              y2={y(usual)}
              stroke="var(--fg-muted)"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.8}
            />
          )}

          {n >= 2 && <path d={area} fill={`url(#${id})`} />}
          {lows && n >= 2 && (
            <path d={curve(lows)} fill="none" stroke={cfg.color} strokeWidth={1.2} strokeDasharray="2 3" opacity={0.6} />
          )}
          {n >= 2 && (
            <path
              d={curve(line)}
              fill="none"
              stroke={cfg.color}
              strokeWidth={2.2}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${hexA(cfg.color, 0.5)})` }}
            />
          )}

          {line.map((p, i) => {
            const good = vitalIsGood(metric, points[i].v, usual);
            return (
              <circle
                key={points[i].date}
                cx={p.x.toFixed(2)}
                cy={p.y.toFixed(2)}
                r={mode === "W" ? 3 : n > 40 ? 1.4 : 2}
                fill={good === false ? WARN : cfg.color}
                stroke="var(--bg-card)"
                strokeWidth={0.8}
              />
            );
          })}

          {points.map((p, i) =>
            (i % labelEvery === 0 && (i === 0 || n - 1 - i >= labelEvery * 0.6)) || i === n - 1 ? (
              <text
                key={p.date}
                x={x(i).toFixed(2)}
                y={H - 6}
                fontSize="9"
                fill="var(--fg-muted)"
                textAnchor={n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              >
                {mode === "W"
                  ? weekday(p.date)
                  : mode === "Y"
                    ? dateOf(p.date).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })
                    : dayLabel(p.date)}
              </text>
            ) : null,
          )}

          {idx != null && (
            <>
              <line x1={x(idx)} x2={x(idx)} y1={PAD_T} y2={base} stroke="var(--fg)" strokeWidth={1.2} />
              <circle cx={x(idx)} cy={y(points[idx].v)} r={4.5} fill="var(--bg-card)" stroke="var(--fg)" strokeWidth={2} />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

/// The readings inside one night on a clock axis, broken where the tracker
/// went quiet for more than half an hour.
function NightChart({
  metric,
  samples,
  night,
}: {
  metric: VitalKey;
  samples: VitalSample[];
  night: VitalNight;
}) {
  const cfg = VITALS[metric];
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  const t0 = Math.min(Date.parse(night.startUtc), samples[0].t);
  const t1 = Math.max(Date.parse(night.endUtc), samples[samples.length - 1].t);
  const span = Math.max(1, t1 - t0);
  const vs = samples.map((s) => s.v);
  const { min, max, ticks } = niceScale(Math.min(...vs), Math.max(...vs));
  const x = (t: number) => PAD_L + ((t - t0) / span) * PLOT_W;
  const y = (v: number) => PAD_T + PLOT_H * (1 - (v - min) / (max - min || 1));
  const base = PAD_T + PLOT_H;
  const id = `vn-${metric}`;

  const runs: VitalSample[][] = [];
  for (const s of samples) {
    const run = runs[runs.length - 1];
    if (run && s.t - run[run.length - 1].t <= 30 * 60_000) run.push(s);
    else runs.push([s]);
  }

  const HOUR = 3_600_000;
  const step = span > 7 * HOUR ? 2 * HOUR : HOUR;
  const hours: number[] = [];
  for (let t = Math.ceil((t0 + night.offsetSec * 1000) / step) * step - night.offsetSec * 1000; t < t1; t += step)
    hours.push(t);

  let active: VitalSample | null = null;
  if (frac != null) {
    const t = t0 + ((frac * W - PAD_L) / PLOT_W) * span;
    active = samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
  }
  const dip = metric === "spo2" ? 90 : null;

  return (
    <div className="select-none">
      <div className="h-9 flex items-center">
        {active ? (
          <div className="tabular-nums">
            <p className="text-[16px] font-bold leading-none">
              {fmtVital(metric, active.v)}
              <span className="text-[11px] font-normal ml-1" style={{ color: "var(--fg-muted)" }}>{cfg.unit}</span>
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              {clock(active.t, night.offsetSec)}
            </p>
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            Hold and drag to read the night
          </span>
        )}
      </div>

      <div ref={trackRef} className="relative touch-none cursor-ew-resize" {...handlers}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={0.6} />
              <text x={W - PAD_R + 5} y={y(t) + 3} fontSize="9" fill="var(--fg-muted)">
                {cfg.decimals ? `${+t.toFixed(1)}` : Math.round(t)}
              </text>
            </g>
          ))}
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(vs.reduce((a, b) => a + b, 0) / vs.length)}
            y2={y(vs.reduce((a, b) => a + b, 0) / vs.length)}
            stroke="var(--fg-muted)"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.8}
          />
          {dip != null && dip >= min && (
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(dip)}
              y2={y(dip)}
              stroke={WARN}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.8}
            />
          )}

          {runs.map((run, i) => {
            const pts = run.map((s) => ({ x: x(s.t), y: y(s.v) }));
            if (pts.length === 1)
              return <circle key={i} cx={pts[0].x.toFixed(2)} cy={pts[0].y.toFixed(2)} r={1.8} fill={cfg.color} />;
            const d = curve(pts);
            return (
              <g key={i}>
                <path
                  d={`${d} L${pts[pts.length - 1].x.toFixed(2)},${base} L${pts[0].x.toFixed(2)},${base} Z`}
                  fill={`url(#${id})`}
                />
                <path d={d} fill="none" stroke={cfg.color} strokeWidth={1.8} strokeLinejoin="round" />
              </g>
            );
          })}

          {dip != null &&
            samples
              .filter((s) => s.v < dip)
              .map((s) => <circle key={s.t} cx={x(s.t).toFixed(2)} cy={y(s.v).toFixed(2)} r={2.4} fill={WARN} />)}

          {hours.map((t) => {
            const px = x(t);
            if (px < PAD_L + 10 || px > W - PAD_R - 10) return null;
            return (
              <text key={t} x={px.toFixed(2)} y={H - 6} fontSize="9" fill="var(--fg-muted)" textAnchor="middle">
                {clock(t, night.offsetSec, true)}
              </text>
            );
          })}

          {active && (
            <>
              <line x1={x(active.t)} x2={x(active.t)} y1={PAD_T} y2={base} stroke="var(--fg)" strokeWidth={1.2} />
              <circle cx={x(active.t)} cy={y(active.v)} r={4.5} fill="var(--bg-card)" stroke="var(--fg)" strokeWidth={2} />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

function verdict(metric: VitalKey, v: number, usual: number | null): string {
  const cfg = VITALS[metric];
  if (metric === "temp") {
    if (Math.abs(v) < 0.3) return "Right at your normal";
    return v > 0 ? `Running warm` : `Running cool`;
  }
  if (usual == null) return "Building your usual";
  const d = v - usual;
  const unit = cfg.unit === "%" ? " pts" : ` ${cfg.unit}`;
  const tiny = cfg.decimals ? 0.2 : 1;
  if (Math.abs(d) < tiny) return "Right on your usual";
  return `${fmtVital(metric, Math.abs(d))}${unit} ${d > 0 ? "above" : "below"} usual`;
}

export default function VitalDetail({
  metric,
  nights,
}: {
  metric: VitalKey;
  nights: VitalNight[]; // newest first; only used by the night view
}) {
  const cfg = VITALS[metric];
  const hasNight = cfg.night && nights.length > 0;
  const [range, setRange] = useState<Range>("W");
  const [month, setMonth] = useState<VitalPoint[]>([]);
  const [monthState, setMonthState] = useState<Load>("loading");
  const [year, setYear] = useState<VitalPoint[] | null>(null);
  const [yearState, setYearState] = useState<Load | "idle">("idle");
  const [nightIdx, setNightIdx] = useState(0);
  const [samples, setSamples] = useState<Record<string, VitalSample[] | "error">>({});

  useEffect(() => {
    let live = true;
    fetch(`/api/health/vitals/${metric}?range=month`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) throw new Error();
        setMonth(Array.isArray(body.days) ? body.days : []);
        setMonthState("ready");
      })
      .catch(() => live && setMonthState("error"));
    return () => {
      live = false;
    };
  }, [metric]);

  const night = hasNight ? nights[Math.min(nightIdx, nights.length - 1)] : null;
  const nightSamples = night ? samples[night.date] : undefined;

  useEffect(() => {
    if (range !== "D" || !night || samples[night.date] !== undefined) return;
    const pad = 30 * 60_000;
    const start = new Date(Date.parse(night.startUtc) - pad).toISOString();
    const end = new Date(Date.parse(night.endUtc) + pad).toISOString();
    fetch(`/api/health/vitals/${metric}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => setSamples((s) => ({ ...s, [night.date]: Array.isArray(b.samples) ? b.samples : [] })))
      .catch(() => setSamples((s) => ({ ...s, [night.date]: "error" })));
  }, [range, night, metric, samples]);

  const pick = (r: Range) => {
    setRange(r);
    if (r !== "Y" || year || yearState === "loading") return;
    setYearState("loading");
    fetch(`/api/health/vitals/${metric}?range=year`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((b) => {
        setYear(Array.isArray(b.days) ? b.days : []);
        setYearState("ready");
      })
      .catch(() => setYearState("error"));
  };

  // Usual = the average of the nights before the latest one, once there are
  // enough of them. Skin temp is already relative to Google's own normal.
  const latest = month.length ? month[month.length - 1] : null;
  const usual = useMemo(() => {
    if (metric === "temp") return 0;
    const prior = month.slice(-31, -1);
    return prior.length >= 3 ? prior.reduce((s, p) => s + p.v, 0) / prior.length : null;
  }, [month, metric]);

  const points = useMemo(() => {
    if (range === "Y") return weekly(year ?? []);
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - (range === "W" ? 6 : 29));
    const key = cutoff.toISOString().slice(0, 10);
    return month.filter((p) => p.date >= key);
  }, [range, month, year]);
  const rangeNights = range === "Y" ? (year ?? []) : points;

  const good = latest ? vitalIsGood(metric, latest.v, usual) : null;
  const tone = good == null ? "var(--fg-muted)" : good ? GOOD : WARN;
  const recent = latest ? Date.now() - dateOf(latest.date).getTime() < 2 * 86400e3 : false;
  const ranges: Range[] = hasNight ? ["D", "W", "M", "Y"] : ["W", "M", "Y"];
  const unitSp = cfg.unit === "%" || cfg.unit === "°C" ? "" : " ";

  return (
    <>
      {/* hero */}
      <section
        className="relative rounded-3xl px-5 pt-5 pb-5 mb-4 overflow-hidden"
        style={{
          background: `radial-gradient(140% 90% at 0% 0%, ${hexA(cfg.color, 0.16)} 0%, transparent 60%), var(--bg-card)`,
          border: "1px solid var(--border-strong)",
        }}
      >
        <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          {latest && !recent ? `${weekday(latest.date)} ${dayLabel(latest.date)}` : "Last night"}
        </p>
        {monthState === "loading" ? (
          <div className="h-[92px] flex items-center">
            <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>Loading from Google Health…</span>
          </div>
        ) : latest ? (
          <>
            <p className="mt-1 leading-none">
              <span className="text-[56px] font-bold tabular-nums" style={{ letterSpacing: "-0.04em", color: cfg.color }}>
                {fmtVital(metric, latest.v)}
              </span>
              <span className="text-[16px] ml-1.5 font-semibold" style={{ color: "var(--fg-muted)" }}>
                {cfg.unit}
              </span>
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span
                className="text-[12px] font-bold px-3 py-1 rounded-full tabular-nums"
                style={{
                  color: tone,
                  background: good == null ? "var(--bg-elevated)" : good ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.12)",
                }}
              >
                {verdict(metric, latest.v, usual)}
              </span>
              {latest.lo != null && (
                <span className="text-[12px] tabular-nums" style={{ color: latest.lo < 90 ? WARN : "var(--fg-muted)" }}>
                  low {fmtVital(metric, latest.lo)}
                  {cfg.unit}
                </span>
              )}
              {usual != null && metric !== "temp" && (
                <span className="text-[12px] tabular-nums ml-auto" style={{ color: "var(--fg-muted)" }}>
                  usual {fmtVital(metric, usual)}
                  {unitSp}
                  {cfg.unit}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-[13px] py-6" style={{ color: "var(--fg-muted)" }}>
            {monthState === "error"
              ? "Couldn't reach Google Health. Try again in a bit."
              : "No readings yet. Wear your tracker to bed and this fills in."}
          </p>
        )}
      </section>

      {/* trend */}
      <section
        className="rounded-2xl p-4 mb-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold tracking-tight">
            {range === "D" ? "Through the night" : "Trend"}
          </h2>
          <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--bg-elevated)" }}>
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => pick(r)}
                className="text-[12px] px-2.5 py-1 rounded-full font-semibold"
                style={{
                  background: range === r ? "var(--bg-card)" : "transparent",
                  color: range === r ? "var(--fg)" : "var(--fg-muted)",
                  boxShadow: range === r ? "inset 0 0 0 1px var(--border-strong)" : undefined,
                }}
              >
                {r === "D" ? "Night" : r === "W" ? "Week" : r === "M" ? "Month" : "Year"}
              </button>
            ))}
          </div>
        </div>

        {range === "D" && night ? (
          <>
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                aria-label="Previous night"
                disabled={nightIdx >= nights.length - 1}
                onClick={() => setNightIdx((i) => Math.min(nights.length - 1, i + 1))}
                className="w-8 h-8 rounded-full text-[16px] disabled:opacity-30"
                style={{ background: "var(--bg-elevated)" }}
              >
                ‹
              </button>
              <div className="text-center">
                <p className="text-[13px] font-semibold">
                  {nightIdx === 0 ? "Last night" : `${weekday(night.date)} ${dayLabel(night.date)}`}
                </p>
                <p className="text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                  {clock(Date.parse(night.startUtc), night.offsetSec)} – {clock(Date.parse(night.endUtc), night.offsetSec)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Next night"
                disabled={nightIdx === 0}
                onClick={() => setNightIdx((i) => Math.max(0, i - 1))}
                className="w-8 h-8 rounded-full text-[16px] disabled:opacity-30"
                style={{ background: "var(--bg-elevated)" }}
              >
                ›
              </button>
            </div>
            {nightSamples === undefined ? (
              <p className="text-[12px] py-16 text-center" style={{ color: "var(--fg-muted)" }}>Loading the night…</p>
            ) : nightSamples === "error" ? (
              <p className="text-[12px] py-16 text-center" style={{ color: "var(--fg-muted)" }}>
                Couldn&apos;t load this night. Try again in a bit.
              </p>
            ) : nightSamples.length === 0 ? (
              <p className="text-[12px] py-16 text-center" style={{ color: "var(--fg-muted)" }}>
                No {cfg.label.toLowerCase()} readings this night.
              </p>
            ) : (
              <>
                <NightChart metric={metric} samples={nightSamples} night={night} />
                <NightStats metric={metric} samples={nightSamples} />
              </>
            )}
          </>
        ) : range === "Y" && yearState !== "ready" ? (
          <p className="text-[12px] py-16 text-center" style={{ color: "var(--fg-muted)" }}>
            {yearState === "error" ? "Couldn't load the year. Try again in a bit." : "Loading your year…"}
          </p>
        ) : monthState === "loading" ? (
          <p className="text-[12px] py-16 text-center" style={{ color: "var(--fg-muted)" }}>Loading…</p>
        ) : points.length === 0 ? (
          <p className="text-[12px] py-12 text-center" style={{ color: "var(--fg-muted)" }}>
            Nothing tracked in this range.
          </p>
        ) : (
          <>
            <div className="mt-1">
              <TrendChart metric={metric} points={points} mode={range} usual={range === "Y" ? null : usual} />
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: "var(--fg-muted)" }}>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded" style={{ background: cfg.color }} />
                {range === "Y" ? "Weekly average" : "Nightly"}
              </span>
              {points.some((p) => p.lo != null) && (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 border-t border-dashed" style={{ borderColor: cfg.color }} />
                  Lowest reading
                </span>
              )}
              {range !== "Y" && usual != null && (
                <span className="flex items-center gap-1.5 ml-auto">
                  <span className="w-3 border-t border-dashed" style={{ borderColor: "var(--fg-muted)" }} />
                  {metric === "temp" ? "Your normal" : "Your usual"}
                </span>
              )}
            </div>
            <RangeStats metric={metric} nights={rangeNights} />
          </>
        )}
      </section>

      {/* about */}
      <section
        className="rounded-2xl p-4 mb-8"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
      >
        <p className="text-[13px] font-bold">What it is</p>
        <p className="text-[13px] leading-snug mt-1" style={{ color: "var(--fg-muted)" }}>{cfg.about}</p>
        <p className="text-[13px] font-bold mt-3">What moves it</p>
        <p className="text-[13px] leading-snug mt-1" style={{ color: "var(--fg-muted)" }}>{cfg.moves}</p>
      </section>
    </>
  );
}

function RangeStats({ metric, nights }: { metric: VitalKey; nights: VitalPoint[] }) {
  if (nights.length === 0) return null;
  const cfg = VITALS[metric];
  const avg = nights.reduce((s, p) => s + p.v, 0) / nights.length;
  const lowOf = (p: VitalPoint) => p.lo ?? p.v;
  const lo = nights.reduce((a, b) => (lowOf(b) < lowOf(a) ? b : a));
  const hi = nights.reduce((a, b) => (b.v > a.v ? b : a));
  const u = metric === "temp" ? "°" : cfg.unit === "%" ? "%" : "";
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      <Stat label="Average" value={`${fmtVital(metric, avg)}${u}`} note={`${nights.length} night${nights.length === 1 ? "" : "s"}`} />
      <Stat label="Lowest" value={`${fmtVital(metric, lowOf(lo))}${u}`} note={dayLabel(lo.date)} />
      <Stat label="Highest" value={`${fmtVital(metric, hi.v)}${u}`} note={dayLabel(hi.date)} />
    </div>
  );
}

function NightStats({ metric, samples }: { metric: VitalKey; samples: VitalSample[] }) {
  const vs = samples.map((s) => s.v);
  const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
  const u = metric === "spo2" ? "%" : "";
  const dips = metric === "spo2" ? vs.filter((v) => v < 90).length : null;
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      <Stat label="Average" value={`${fmtVital(metric, avg)}${u}`} note={`${samples.length} readings`} />
      <Stat label="Lowest" value={`${fmtVital(metric, Math.min(...vs))}${u}`} note="this night" />
      {dips != null ? (
        <Stat label="Under 90%" value={`${dips}`} note="readings" color={dips > 0 ? WARN : GOOD} />
      ) : (
        <Stat label="Highest" value={`${fmtVital(metric, Math.max(...vs))}${u}`} note="this night" />
      )}
    </div>
  );
}

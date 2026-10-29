"use client";

import {
  bestValues,
  measurementLabel,
  moveStatus,
  wantFor,
  type CheckIn,
  type MeasurementKey,
} from "@/lib/bodyMeasurements";
import { STATUS_COLOR, STATUS_TEXT, fmtDelta, fmtValue, shownUnit, toShown } from "@/lib/measureDisplay";
import { useMeasureUnit } from "@/components/useMeasureUnit";

const W = 350;
const H = 170;
const TOP = 14;
const BOTTOM = 136;
const PAD = 16;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short" }).toUpperCase();

/// One measurement over time: where it stands, one line, every reading.
export default function BodyMeasureDetail({
  field,
  sex,
  phase,
  history,
}: {
  field: MeasurementKey;
  sex: string | null;
  phase: string | null;
  history: CheckIn[];
}) {
  const lengths = useMeasureUnit();
  const label = measurementLabel(field, sex);
  const unit = shownUnit(field, lengths);
  const want = wantFor(field, phase, sex);

  const points = history
    .filter((c) => typeof c.values[field] === "number")
    .map((c) => ({ at: c.takenAt, v: c.values[field] as number }));

  if (points.length === 0) {
    return (
      <div className="card p-5 space-y-2">
        <p className="text-[18px] font-semibold">{label}</p>
        <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
          Not measured yet — it&apos;s part of your next check-in.
        </p>
      </div>
    );
  }

  const now = points[points.length - 1].v;
  const first = points[0].v;
  const total = now - first;
  const totalStatus = moveStatus(field, total, want);
  const prior = bestValues(
    history.slice(0, history.findIndex((c) => c.takenAt === points[points.length - 1].at)),
    phase,
    sex,
  )[field];
  const isBest = prior !== undefined && (want > 0 ? now > prior : now < prior);

  const shown = points.map((p) => toShown(field, p.v, lengths));
  const lo = Math.min(...shown);
  const hi = Math.max(...shown);
  const span = hi - lo || 1;
  const xy = shown.map((v, i) => ({
    x: points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - PAD * 2),
    y: TOP + (1 - (v - lo) / span) * (BOTTOM - TOP) * 0.9 + (BOTTOM - TOP) * 0.05,
  }));
  const line = xy.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
  const area = `${line} ${xy[xy.length - 1].x.toFixed(1)},${BOTTOM} ${xy[0].x.toFixed(1)},${BOTTOM}`;
  const tickEvery = Math.ceil(points.length / 6);

  const log = points
    .map((p, i) => {
      const before = points[i - 1];
      if (!before) return { ...p, dt: "start", color: "var(--fg-dim)" };
      const d = p.v - before.v;
      const s = moveStatus(field, d, want);
      return { ...p, dt: fmtDelta(field, d, lengths), color: STATUS_TEXT[s] };
    })
    .reverse();

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-[18px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          {label}
        </p>
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-[56px] leading-none font-semibold tracking-tight tabular-nums">
            {fmtValue(field, now, lengths)}
          </span>
          <span className="text-[16px]" style={{ color: "var(--fg-dim)" }}>
            {unit}
          </span>
        </p>
        {points.length > 1 && (
          <p className="text-[14px]" style={{ color: STATUS_TEXT[totalStatus] }}>
            {fmtDelta(field, total, lengths)} {unit} since {fmtDate(points[0].at)}
            {isBest ? " — your best yet" : ""}
          </p>
        )}
      </div>

      {points.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${label} by check-in`}>
          <defs>
            <linearGradient id="sl-measure-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={STATUS_COLOR[totalStatus]} stopOpacity="0.25" />
              <stop offset="1" stopColor={STATUS_COLOR[totalStatus]} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#sl-measure-area)" />
          <polyline
            points={line}
            fill="none"
            stroke={STATUS_COLOR[totalStatus]}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={xy[xy.length - 1].x} cy={xy[xy.length - 1].y} r={5} fill={STATUS_COLOR[totalStatus]} />
          {points.map((p, i) =>
            i % tickEvery === 0 || i === points.length - 1 ? (
              <text
                key={p.at}
                x={xy[i].x}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fill="#8a8a93"
                className="font-mono"
              >
                {fmtMonth(p.at)}
              </text>
            ) : null,
          )}
        </svg>
      )}

      <div>
        {log.map((r) => (
          <div
            key={r.at}
            className="flex items-center gap-3 min-h-12 px-1"
            style={{ borderBottom: "1px solid #161618" }}
          >
            <span className="flex-1 text-[14px]" style={{ color: "var(--fg-muted)" }}>
              {fmtDate(r.at)}
            </span>
            <span className="font-mono text-[15px] font-semibold tabular-nums">
              {fmtValue(field, r.v, lengths)}
            </span>
            <span className="w-14 text-right font-mono text-[12px]" style={{ color: r.color }}>
              {r.dt}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

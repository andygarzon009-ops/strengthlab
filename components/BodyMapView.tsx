"use client";

import Link from "next/link";
import { useState } from "react";
import { FIGURES } from "@/lib/bodyPaths";
import {
  CHECK_IN_INTERVAL_DAYS,
  firstValues,
  interpret,
  latestValues,
  measurementLabel,
  moveStatus,
  verdictWord,
  wantFor,
  type CheckIn,
  type MeasurementKey,
  type MoveStatus,
} from "@/lib/bodyMeasurements";
import { tapeSpots } from "@/lib/bodyMapGeometry";
import {
  STATUS_COLOR,
  STATUS_TEXT,
  fmtDelta,
  fmtValue,
  shownUnit,
} from "@/lib/measureDisplay";
import { useMeasureUnit } from "@/components/useMeasureUnit";

// The map's drawing box. The figure (100 × 200) is scaled 2.2× and centred,
// leaving a 76px gutter each side for the labels.
const W = 350;
const H = 460;
const FX = 65;
const FY = 10;
const S = 2.2;
const LABEL_W = 76;
const MIRROR = "translate(100,0) scale(-1,1)";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const monthName = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long" });

export default function BodyMapView({
  sex,
  phase,
  history,
}: {
  sex: string | null;
  phase: string | null;
  history: CheckIn[];
}) {
  const lengths = useMeasureUnit();
  const [mode, setMode] = useState<"last" | "start">("last");
  const [now] = useState(() => Date.now());

  if (history.length === 0) {
    return (
      <div className="card p-5 space-y-3">
        <p className="text-[22px] font-bold tracking-tight">Take your first tape</p>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          Ten spots, about two minutes. We&apos;ll show you exactly where to measure, and every
          month after this one shows what your training built.
        </p>
        <Link
          href="/body/check-in"
          className="btn-accent rounded-xl h-12 flex items-center justify-center text-[15px]"
        >
          Start
        </Link>
      </div>
    );
  }

  const n = history.length;
  const latest = latestValues(history);
  const prev = n > 1 ? latestValues(history, n - 2) : null;
  const first = firstValues(history);
  const base = n > 1 ? (mode === "last" ? prev! : first) : null;

  const lastAt = history[n - 1].takenAt;
  const nextAt = new Date(Date.parse(lastAt) + CHECK_IN_INTERVAL_DAYS * 86_400_000);
  const due = now >= nextAt.getTime();
  const word = prev ? verdictWord(prev, latest) : null;
  const reading = prev ? interpret(prev, latest) : null;

  const read = (key: MeasurementKey) => {
    const now = latest[key];
    if (typeof now !== "number") return null;
    const from = base?.[key];
    if (typeof from !== "number") {
      return { text: fmtValue(key, now, lengths), status: "held" as MoveStatus, isDelta: false };
    }
    const d = now - from;
    return {
      text: fmtDelta(key, d, lengths),
      status: moveStatus(key, d, wantFor(key, phase, sex)),
      isDelta: true,
    };
  };

  const fig = FIGURES[sex === "FEMALE" ? "female" : "male"];
  const spots = tapeSpots(sex)
    .map((s) => ({ ...s, r: read(s.key) }))
    .filter((s) => s.r !== null);

  const sinceLabel = `Since ${shortDate(history[0].takenAt)}`;

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            {monthName(lastAt)} check-in
          </p>
          <p
            className="text-[22px] font-bold tracking-tight"
            style={{ color: word ? STATUS_TEXT.good : "var(--fg)" }}
          >
            {word ?? (n === 1 ? "Baseline set" : "Logged")}
          </p>
          <p className="text-[12px]" style={{ color: due ? STATUS_TEXT.good : "var(--fg-dim)" }}>
            {due ? "Next tape is due" : `Next one ${shortDate(nextAt.toISOString())}`}
          </p>
        </div>
        <Link
          href="/body/check-in"
          className="btn-accent rounded-xl h-11 px-4 flex items-center text-[14px]"
        >
          Check in
        </Link>
      </div>
      {reading && (
        <p className="text-[13px] leading-relaxed px-1" style={{ color: "var(--fg-muted)" }}>
          {reading}
        </p>
      )}

      {n > 1 && (
        <div
          className="flex gap-1 p-1 rounded-full mx-auto w-fit"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          role="group"
          aria-label="Compare against"
        >
          {(
            [
              ["last", "Last check-in"],
              ["start", sinceLabel],
            ] as const
          ).map(([m, label]) => {
            const on = m === mode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={on}
                className="h-9 px-4 rounded-full text-[12px] font-semibold transition-colors"
                style={{
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "#052e14" : "var(--fg-muted)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative mx-auto w-full" style={{ maxWidth: W, aspectRatio: `${W} / ${H}` }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="sl-body-skin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1d1d20" />
              <stop offset="1" stopColor="#131315" />
            </linearGradient>
          </defs>
          <g transform={`translate(${FX},${FY}) scale(${S})`}>
            <path d={fig.silhouette} fill="url(#sl-body-skin)" stroke="#2e2e33" strokeWidth={0.5} />
            <path
              d={fig.silhouette}
              transform={MIRROR}
              fill="url(#sl-body-skin)"
              stroke="#2e2e33"
              strokeWidth={0.5}
            />
          </g>
          {spots.map((s) => {
            const y = FY + s.y * S;
            const x1 = FX + s.x1 * S;
            const x2 = FX + s.x2 * S;
            const left = s.side === "l";
            return (
              <g key={s.key}>
                <line
                  x1={left ? LABEL_W : x2}
                  x2={left ? x1 : W - LABEL_W}
                  y1={y}
                  y2={y}
                  stroke="#2a2a2e"
                />
                <line
                  x1={x1}
                  x2={x2}
                  y1={y}
                  y2={y}
                  stroke={STATUS_COLOR[s.r!.status]}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              </g>
            );
          })}
        </svg>
        {spots.map((s) => {
          const left = s.side === "l";
          return (
            <Link
              key={s.key}
              href={`/body/${s.key}`}
              className="absolute flex flex-col justify-center px-2 rounded-[10px]"
              style={{
                left: left ? 0 : undefined,
                right: left ? undefined : 0,
                top: `${((FY + s.y * S) / H) * 100}%`,
                transform: "translateY(-50%)",
                width: `${(LABEL_W / W) * 100}%`,
                minWidth: 68,
                height: 44,
                alignItems: left ? "flex-start" : "flex-end",
                background: "#0f0f10",
                border: "1px solid #232326",
              }}
            >
              <span
                className="text-[10px] uppercase tracking-[0.06em]"
                style={{ color: "var(--fg-muted)" }}
              >
                {measurementLabel(s.key, sex)}
              </span>
              <span
                className="font-mono text-[14px] font-semibold tabular-nums"
                style={{ color: s.r!.isDelta ? STATUS_TEXT[s.r!.status] : "var(--fg)" }}
              >
                {s.r!.text}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {(["bodyweight", "bodyFat"] as const).map((key) => {
          const now = latest[key];
          if (typeof now !== "number") return <div key={key} />;
          const r = read(key)!;
          return (
            <Link key={key} href={`/body/${key}`} className="card p-3.5 flex flex-col gap-1">
              <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                {measurementLabel(key, sex)}
              </span>
              <span className="font-mono text-[22px] font-semibold tabular-nums">
                {fmtValue(key, now, lengths)}
                <span className="text-[11px] ml-1" style={{ color: "var(--fg-dim)" }}>
                  {shownUnit(key, lengths)}
                </span>
              </span>
              {r.isDelta && (
                <span
                  className="font-mono text-[13px] font-semibold"
                  style={{ color: STATUS_TEXT[r.status] }}
                >
                  {r.text}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

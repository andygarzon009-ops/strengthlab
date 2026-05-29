"use client";

import { useState } from "react";

export type MuscleCoverage = {
  muscle: string;
  thisWeek: number; // working sets this week
  lastWeek: number; // working sets last week
  lastTrainedIso: string | null;
};

// --- Geometry ---------------------------------------------------------------
// Two stylized figures share one viewBox: front (centered x≈60) and back
// (centered x≈180). Each muscle owns one or more shapes; tapping any shape
// selects the whole muscle and highlights every shape that belongs to it.
type Shape =
  | { k: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { k: "rect"; x: number; y: number; w: number; h: number; r: number };

const REGIONS: { muscle: string; shapes: Shape[] }[] = [
  // Front
  {
    muscle: "Shoulders",
    shapes: [
      { k: "ellipse", cx: 41, cy: 45, rx: 10, ry: 7 },
      { k: "ellipse", cx: 79, cy: 45, rx: 10, ry: 7 },
      // rear delts (back view)
      { k: "ellipse", cx: 161, cy: 45, rx: 10, ry: 7 },
      { k: "ellipse", cx: 199, cy: 45, rx: 10, ry: 7 },
    ],
  },
  {
    muscle: "Chest",
    shapes: [
      { k: "ellipse", cx: 52, cy: 57, rx: 9, ry: 8 },
      { k: "ellipse", cx: 68, cy: 57, rx: 9, ry: 8 },
    ],
  },
  {
    muscle: "Biceps",
    shapes: [
      { k: "ellipse", cx: 35, cy: 66, rx: 6, ry: 14 },
      { k: "ellipse", cx: 85, cy: 66, rx: 6, ry: 14 },
    ],
  },
  {
    muscle: "Core",
    shapes: [{ k: "rect", x: 50, y: 66, w: 20, h: 46, r: 7 }],
  },
  {
    muscle: "Forearms",
    shapes: [
      { k: "ellipse", cx: 33, cy: 91, rx: 5, ry: 14 },
      { k: "ellipse", cx: 87, cy: 91, rx: 5, ry: 14 },
      { k: "ellipse", cx: 153, cy: 91, rx: 5, ry: 14 },
      { k: "ellipse", cx: 207, cy: 91, rx: 5, ry: 14 },
    ],
  },
  {
    muscle: "Quads",
    shapes: [
      { k: "rect", x: 43, y: 114, w: 15, h: 58, r: 7 },
      { k: "rect", x: 62, y: 114, w: 15, h: 58, r: 7 },
    ],
  },
  {
    muscle: "Calves",
    shapes: [
      { k: "rect", x: 45, y: 176, w: 11, h: 52, r: 6 },
      { k: "rect", x: 64, y: 176, w: 11, h: 52, r: 6 },
      { k: "rect", x: 165, y: 184, w: 11, h: 52, r: 6 },
      { k: "rect", x: 184, y: 184, w: 11, h: 52, r: 6 },
    ],
  },
  // Back
  {
    muscle: "Back",
    shapes: [
      { k: "rect", x: 165, y: 44, w: 30, h: 46, r: 9 },
      { k: "rect", x: 171, y: 90, w: 18, h: 16, r: 5 },
    ],
  },
  {
    muscle: "Triceps",
    shapes: [
      { k: "ellipse", cx: 155, cy: 66, rx: 6, ry: 14 },
      { k: "ellipse", cx: 205, cy: 66, rx: 6, ry: 14 },
    ],
  },
  {
    muscle: "Glutes",
    shapes: [
      { k: "ellipse", cx: 172, cy: 113, rx: 10, ry: 10 },
      { k: "ellipse", cx: 188, cy: 113, rx: 10, ry: 10 },
    ],
  },
  {
    muscle: "Hamstrings",
    shapes: [
      { k: "rect", x: 163, y: 126, w: 15, h: 54, r: 7 },
      { k: "rect", x: 182, y: 126, w: 15, h: 54, r: 7 },
    ],
  },
];

// --- Volume → status --------------------------------------------------------
type Status = "none" | "light" | "solid" | "high";

function statusFor(sets: number): Status {
  if (sets <= 0) return "none";
  if (sets < 6) return "light";
  if (sets < 15) return "solid";
  return "high";
}

const STATUS_FILL: Record<Status, string> = {
  none: "var(--bg-elevated)",
  light: "rgba(34,197,94,0.20)",
  solid: "rgba(34,197,94,0.45)",
  high: "rgba(34,197,94,0.80)",
};
const STATUS_STROKE: Record<Status, string> = {
  none: "var(--border-strong)",
  light: "rgba(34,197,94,0.45)",
  solid: "rgba(34,197,94,0.7)",
  high: "#22c55e",
};
const STATUS_LABEL: Record<Status, string> = {
  none: "Not trained",
  light: "Light",
  solid: "On target",
  high: "High volume",
};

function suggestionFor(status: Status, muscle: string, sets: number): string {
  switch (status) {
    case "none":
      return `No direct ${muscle.toLowerCase()} work this week — add a session that targets it.`;
    case "light":
      return `${sets} set${sets === 1 ? "" : "s"} so far — below the ~10/week growth range. Add a couple more.`;
    case "solid":
      return `${sets} sets — right in the effective range for growth. Keep it steady.`;
    case "high":
      return `${sets} sets — high volume. Make sure recovery is keeping pace.`;
  }
}

function relativeDay(iso: string | null): string {
  if (!iso) return "never logged";
  const day = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (day <= 0) return "today";
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  if (day < 14) return "last week";
  if (day < 28) return `${Math.floor(day / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function BodyScan({
  coverage,
  note,
}: {
  coverage: MuscleCoverage[];
  note?: string;
}) {
  const byMuscle = new Map(coverage.map((c) => [c.muscle, c]));
  const [selected, setSelected] = useState<string | null>(null);

  const sel = selected ? byMuscle.get(selected) : null;

  return (
    <div>
      <svg
        viewBox="0 0 240 270"
        width="100%"
        style={{ display: "block", maxWidth: 360, margin: "0 auto" }}
        role="img"
        aria-label="Weekly muscle coverage body scan"
      >
        {/* Neutral head + neck to anchor each figure. */}
        <circle cx={60} cy={18} r={11} fill="var(--bg-elevated)" />
        <rect x={55} y={26} width={10} height={8} rx={3} fill="var(--bg-elevated)" />
        <circle cx={180} cy={18} r={11} fill="var(--bg-elevated)" />
        <rect x={175} y={26} width={10} height={8} rx={3} fill="var(--bg-elevated)" />

        {REGIONS.map(({ muscle, shapes }) => {
          const cov = byMuscle.get(muscle);
          const sets = cov?.thisWeek ?? 0;
          const status = statusFor(sets);
          const isSel = selected === muscle;
          const fill = STATUS_FILL[status];
          const stroke = isSel ? "#4ade80" : STATUS_STROKE[status];
          const strokeWidth = isSel ? 2.2 : 1;
          return (
            <g
              key={muscle}
              onClick={() => setSelected((s) => (s === muscle ? null : muscle))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected((s) => (s === muscle ? null : muscle));
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`${muscle}: ${sets} sets this week, ${STATUS_LABEL[status]}`}
              style={{ cursor: "pointer", outline: "none" }}
            >
              {shapes.map((sh, i) =>
                sh.k === "ellipse" ? (
                  <ellipse
                    key={i}
                    cx={sh.cx}
                    cy={sh.cy}
                    rx={sh.rx}
                    ry={sh.ry}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                  />
                ) : (
                  <rect
                    key={i}
                    x={sh.x}
                    y={sh.y}
                    width={sh.w}
                    height={sh.h}
                    rx={sh.r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                  />
                ),
              )}
            </g>
          );
        })}

        {/* Figure captions */}
        <text x={60} y={258} fontSize="9" fill="var(--fg-dim)" textAnchor="middle">
          FRONT
        </text>
        <text x={180} y={258} fontSize="9" fill="var(--fg-dim)" textAnchor="middle">
          BACK
        </text>
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-1 mb-3 flex-wrap">
        {(["none", "light", "solid", "high"] as Status[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{
                background: STATUS_FILL[s],
                border: `1px solid ${STATUS_STROKE[s]}`,
              }}
            />
            <span className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
              {STATUS_LABEL[s]}
            </span>
          </span>
        ))}
      </div>

      {/* Detail panel */}
      {sel ? (
        <MuscleDetail cov={sel} onClear={() => setSelected(null)} />
      ) : (
        <p
          className="text-[12px] text-center py-2"
          style={{ color: "var(--fg-dim)" }}
        >
          Tap a muscle to see its weekly volume and status.
        </p>
      )}

      {note && (
        <p className="text-[12px] mt-2" style={{ color: "var(--fg-dim)" }}>
          {note}
        </p>
      )}
    </div>
  );
}

function MuscleDetail({
  cov,
  onClear,
}: {
  cov: MuscleCoverage;
  onClear: () => void;
}) {
  const status = statusFor(cov.thisWeek);
  const delta = cov.thisWeek - cov.lastWeek;
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-bold">{cov.muscle}</h3>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: `${STATUS_STROKE[status]}22`,
              border: `1px solid ${STATUS_STROKE[status]}`,
              color: status === "none" ? "var(--fg-muted)" : "#22c55e",
            }}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] underline"
          style={{ color: "var(--fg-dim)" }}
        >
          Close
        </button>
      </div>

      <div className="flex items-baseline gap-4 mb-2">
        <div>
          <span className="text-[20px] font-bold tabular-nums">
            {cov.thisWeek}
          </span>
          <span className="text-[11px] ml-1" style={{ color: "var(--fg-dim)" }}>
            sets this week
          </span>
        </div>
        {cov.lastWeek > 0 || cov.thisWeek > 0 ? (
          <span
            className="text-[11px] tabular-nums"
            style={{
              color: delta > 0 ? "#22c55e" : delta < 0 ? "#f97316" : "var(--fg-dim)",
            }}
          >
            {delta === 0
              ? "= last week"
              : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs last week`}
          </span>
        ) : null}
      </div>

      <p className="text-[12px] leading-relaxed mb-1.5">
        {suggestionFor(status, cov.muscle, cov.thisWeek)}
      </p>
      <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
        Last trained: {relativeDay(cov.lastTrainedIso)}
      </p>
    </div>
  );
}

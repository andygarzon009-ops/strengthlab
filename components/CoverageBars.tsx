"use client";

import { useState } from "react";

export type MuscleCoverage = {
  muscle: string;
  thisWeek: number; // working sets this week
  lastWeek: number; // working sets last week
  lastTrainedIso: string | null;
};

// --- Volume → status -------------------------------------------------------
type Status = "none" | "light" | "solid" | "high";

function statusFor(sets: number): Status {
  if (sets <= 0) return "none";
  if (sets < 6) return "light";
  if (sets < 15) return "solid";
  return "high";
}

const STATUS_FILL: Record<Status, string> = {
  none: "var(--border-strong)",
  light: "rgba(34,197,94,0.40)",
  solid: "#22c55e",
  high: "#4ade80",
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

export default function CoverageBars({
  coverage,
  note,
}: {
  coverage: MuscleCoverage[];
  note?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const max = Math.max(1, ...coverage.map((c) => c.thisWeek));
  const trained = coverage.filter((c) => c.thisWeek > 0);
  const total = coverage.length;

  // Trained muscles ranked by volume; untrained sink to the bottom so gaps
  // are obvious without hunting.
  const sorted = [...coverage].sort(
    (a, b) => b.thisWeek - a.thisWeek || a.muscle.localeCompare(b.muscle),
  );

  return (
    <div>
      {/* Summary header with a coverage meter */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
          Muscle groups trained
        </span>
        <span className="text-[12px] font-semibold tabular-nums">
          {trained.length}/{total}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden mb-4 flex gap-0.5"
        style={{ background: "var(--bg-elevated)" }}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className="flex-1 h-full"
            style={{
              background:
                i < trained.length ? "var(--accent)" : "transparent",
            }}
          />
        ))}
      </div>

      {/* Ranked volume bars */}
      <div className="space-y-0.5">
        {sorted.map((c) => {
          const status = statusFor(c.thisWeek);
          const isOpen = open === c.muscle;
          const widthPct =
            c.thisWeek > 0 ? Math.max(6, (c.thisWeek / max) * 100) : 0;
          const dim = c.thisWeek === 0;
          return (
            <div key={c.muscle}>
              <button
                type="button"
                onClick={() => setOpen((o) => (o === c.muscle ? null : c.muscle))}
                className="w-full flex items-center gap-3 py-1.5 px-1.5 rounded-lg transition-colors text-left"
                style={{ background: isOpen ? "var(--bg-elevated)" : "transparent" }}
                aria-expanded={isOpen}
                aria-label={`${c.muscle}: ${c.thisWeek} sets this week, ${STATUS_LABEL[status]}`}
              >
                <span
                  className="text-[12px] font-medium w-[74px] flex-shrink-0"
                  style={{ color: dim ? "var(--fg-dim)" : "var(--fg)" }}
                >
                  {c.muscle}
                </span>
                <span
                  className="flex-1 h-2.5 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  {widthPct > 0 && (
                    <span
                      className="block h-full rounded-full transition-all"
                      style={{
                        width: `${widthPct}%`,
                        background: STATUS_FILL[status],
                      }}
                    />
                  )}
                </span>
                <span
                  className="text-[12px] font-semibold tabular-nums w-6 text-right flex-shrink-0"
                  style={{ color: dim ? "var(--fg-dim)" : "var(--fg)" }}
                >
                  {c.thisWeek}
                </span>
              </button>

              {isOpen && <MuscleDetail cov={c} status={status} />}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {(["light", "solid", "high", "none"] as Status[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: STATUS_FILL[s] }}
            />
            <span className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
              {STATUS_LABEL[s]}
            </span>
          </span>
        ))}
      </div>

      {note && (
        <p className="text-[12px] mt-3" style={{ color: "var(--fg-dim)" }}>
          {note}
        </p>
      )}
    </div>
  );
}

function MuscleDetail({
  cov,
  status,
}: {
  cov: MuscleCoverage;
  status: Status;
}) {
  const delta = cov.thisWeek - cov.lastWeek;
  return (
    <div
      className="mx-1.5 mb-1 px-3 py-2.5 rounded-lg"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{
            background:
              status === "none" ? "var(--bg-elevated)" : "rgba(34,197,94,0.15)",
            border: `1px solid ${status === "none" ? "var(--border-strong)" : "rgba(34,197,94,0.4)"}`,
            color: status === "none" ? "var(--fg-muted)" : "#22c55e",
          }}
        >
          {STATUS_LABEL[status]}
        </span>
        {(cov.thisWeek > 0 || cov.lastWeek > 0) && (
          <span
            className="text-[11px] tabular-nums"
            style={{
              color:
                delta > 0 ? "#22c55e" : delta < 0 ? "#f97316" : "var(--fg-dim)",
            }}
          >
            {delta === 0
              ? "= last week"
              : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs last week`}
          </span>
        )}
      </div>
      <p className="text-[12px] leading-relaxed mb-1">
        {suggestionFor(status, cov.muscle, cov.thisWeek)}
      </p>
      <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
        Last trained: {relativeDay(cov.lastTrainedIso)}
      </p>
    </div>
  );
}

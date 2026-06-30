"use client";

import { useMemo, useRef, useState } from "react";

type SleepStageType = "deep" | "rem" | "light" | "awake" | "restless";

export type StageSeg = {
  type: SleepStageType;
  startMs: number;
  endMs: number;
};

const STAGE: Record<SleepStageType, { label: string; color: string }> = {
  awake: { label: "Awake", color: "#ef5a6f" },
  rem: { label: "REM", color: "#38bdf8" },
  light: { label: "Light", color: "#3b82f6" },
  deep: { label: "Deep", color: "#4338ca" },
  restless: { label: "Restless", color: "#f59e0b" },
};

// Top→bottom lane order, matching common sleep-app hypnograms.
const LANES: SleepStageType[] = ["awake", "rem", "light", "deep"];

const TARGET: Record<SleepStageType, [number, number] | null> = {
  deep: [13, 23],
  rem: [20, 25],
  light: [45, 60],
  awake: null,
  restless: null,
};

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtClockMs(ms: number, offsetSec: number): string {
  const d = new Date(ms + offsetSec * 1000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

function RangePill({ pct, target }: { pct: number; target: [number, number] }) {
  const inRange = pct >= target[0] && pct <= target[1];
  const below = pct < target[0];
  const color = inRange ? "#22c55e" : "#f59e0b";
  const text = inRange ? "In range" : below ? "Low" : "High";
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ color, background: `${color}1f` }}
    >
      {text}
    </span>
  );
}

export default function SleepHypnogram({
  stages,
  startUtc,
  endUtc,
  offsetSec,
  deepMin,
  remMin,
  lightMin,
  awakeMin,
  totalSleep,
}: {
  stages: StageSeg[];
  startUtc: string;
  endUtc: string;
  offsetSec: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  totalSleep: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Scrub fraction 0..1 along the night, or null when not scrubbing.
  const [frac, setFrac] = useState<number | null>(null);

  const { spanStart, span, hourMarks } = useMemo(() => {
    const starts = stages.map((s) => s.startMs);
    const ends = stages.map((s) => s.endMs);
    const start = Math.min(Date.parse(startUtc), ...starts);
    const end = Math.max(Date.parse(endUtc), ...ends);
    const sp = Math.max(1, end - start);
    // Faint vertical line at each local hour boundary inside the span.
    const marks: number[] = [];
    const HOUR = 3_600_000;
    const firstHour =
      Math.ceil((start + offsetSec * 1000) / HOUR) * HOUR - offsetSec * 1000;
    for (let t = firstHour; t < end; t += HOUR) marks.push((t - start) / sp);
    return { spanStart: start, span: sp, hourMarks: marks };
  }, [stages, startUtc, endUtc, offsetSec]);

  const restlessSegs = useMemo(
    () => stages.filter((s) => s.type === "restless"),
    [stages],
  );
  const awakeCount = useMemo(
    () => stages.filter((s) => s.type === "awake").length,
    [stages],
  );
  // Dedicated restlessness strip only when the device actually reports it —
  // otherwise the Awake lane already covers awakenings (we just count them).
  const restlessMin = restlessSegs.reduce(
    (s, x) => s + (x.endMs - x.startMs) / 60000,
    0,
  );

  // Stage active at the scrubbed instant (searches every type incl. restless).
  const scrubMs = frac == null ? null : spanStart + frac * span;
  const activeSeg =
    scrubMs == null
      ? null
      : (stages.find((s) => scrubMs >= s.startMs && scrubMs < s.endMs) ?? null);

  function updateFromClientX(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setFrac(f);
  }

  return (
    <div className="mb-1 select-none">
      {/* scrub readout */}
      <div className="h-6 mb-1 flex items-center">
        {scrubMs != null ? (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold tabular-nums">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: activeSeg
                  ? STAGE[activeSeg.type].color
                  : "var(--fg-dim)",
              }}
            />
            {fmtClockMs(scrubMs, offsetSec)}
            <span style={{ color: "var(--fg-muted)" }}>
              {activeSeg ? STAGE[activeSeg.type].label : "—"}
            </span>
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            Drag across the timeline to read exact times
          </span>
        )}
      </div>

      {/* lanes + shared scrub overlay */}
      <div
        ref={trackRef}
        className="relative touch-pan-y cursor-ew-resize"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType === "mouse") return;
          if (frac != null || e.buttons !== 0) updateFromClientX(e.clientX);
        }}
        onPointerUp={() => setFrac(null)}
        onPointerCancel={() => setFrac(null)}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setFrac(null);
        }}
      >
        <div className="space-y-2.5">
          {LANES.map((lane) => {
            const min =
              lane === "awake"
                ? awakeMin
                : lane === "rem"
                  ? remMin
                  : lane === "light"
                    ? lightMin
                    : deepMin;
            const pct = totalSleep > 0 ? (min / totalSleep) * 100 : 0;
            const target = TARGET[lane];
            const laneSegs = stages.filter((s) => s.type === lane);
            return (
              <div key={lane}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px]">
                    <span className="font-semibold">{STAGE[lane].label}</span>
                    <span
                      className="ml-1.5 tabular-nums"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {fmtDur(min)}
                      {lane === "awake" && awakeCount > 0 && (
                        <> · {awakeCount}×</>
                      )}
                    </span>
                  </span>
                  {target && <RangePill pct={pct} target={target} />}
                </div>
                <div
                  className="relative w-full rounded-lg overflow-hidden"
                  style={{ height: 22, background: "var(--bg-elevated)" }}
                >
                  {/* hour gridlines */}
                  {hourMarks.map((m, i) => (
                    <div
                      key={`g${i}`}
                      className="absolute top-0 bottom-0"
                      style={{
                        left: `${m * 100}%`,
                        width: 1,
                        background: "var(--border)",
                      }}
                    />
                  ))}
                  {laneSegs.map((s, i) => {
                    const left = ((s.startMs - spanStart) / span) * 100;
                    const width = ((s.endMs - s.startMs) / span) * 100;
                    return (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 rounded-md"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          minWidth: 3,
                          background: STAGE[lane].color,
                          boxShadow: `0 0 0 1px ${STAGE[lane].color}`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* scrub cursor spanning all lanes */}
        {frac != null && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${frac * 100}%`,
              width: 2,
              marginLeft: -1,
              background: "var(--fg)",
              opacity: 0.85,
            }}
          />
        )}
      </div>

      {/* restlessness strip — only when the device reports restless segments */}
      {restlessSegs.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px]">
              <span className="font-semibold">Restlessness</span>
              <span
                className="ml-1.5 tabular-nums"
                style={{ color: "var(--fg-muted)" }}
              >
                {fmtDur(restlessMin)} · {restlessSegs.length}×
              </span>
            </span>
          </div>
          <div
            className="relative w-full rounded-lg overflow-hidden"
            style={{ height: 14, background: "var(--bg-elevated)" }}
          >
            {restlessSegs.map((s, i) => {
              const left = ((s.startMs - spanStart) / span) * 100;
              const width = ((s.endMs - s.startMs) / span) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 rounded-sm"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    minWidth: 2,
                    background: STAGE.restless.color,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* time axis */}
      <div className="flex justify-between mt-2">
        {[0, 0.5, 1].map((f, i) => (
          <span
            key={i}
            className="text-[10px] tabular-nums"
            style={{ color: "var(--fg-dim)" }}
          >
            {fmtClockMs(spanStart + f * span, offsetSec)}
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

// The night as one stepped chart: a row per stage (Awake on top, Deep at the
// bottom), each segment a block on its row, with thin risers joining one stage
// to the next — the shape every sleep app has taught people to read. Press and
// drag anywhere on it to read the stage at an exact time.

import { useMemo } from "react";
import { useScrub } from "@/lib/useScrub";
import { STAGE_STYLE, type SleepStageType, type StageSeg } from "@/lib/sleepStages";

export type { StageSeg };


// Top→bottom.
const ROWS: Exclude<SleepStageType, "restless">[] = ["awake", "rem", "light", "deep"];
const ROW_H = 30;
const BLOCK_H = 18;
const PLOT_H = ROWS.length * ROW_H;

function fmtClockMs(ms: number, offsetSec: number, short = false): string {
  const d = new Date(ms + offsetSec * 1000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  if (short) return `${h}${ampm}`;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

export default function SleepHypnogram({
  stages,
  startUtc,
  endUtc,
  offsetSec,
}: {
  stages: StageSeg[];
  startUtc: string;
  endUtc: string;
  offsetSec: number;
}) {
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();

  const { spanStart, span, ticks, main, restless } = useMemo(() => {
    const starts = stages.map((s) => s.startMs);
    const ends = stages.map((s) => s.endMs);
    const start = Math.min(Date.parse(startUtc), ...starts);
    const end = Math.max(Date.parse(endUtc), ...ends);
    const sp = Math.max(1, end - start);
    // Hour ticks, thinned to every 2h on a long night so labels don't collide.
    const HOUR = 3_600_000;
    const step = sp > 7 * HOUR ? 2 * HOUR : HOUR;
    const first =
      Math.ceil((start + offsetSec * 1000) / step) * step - offsetSec * 1000;
    const t: number[] = [];
    for (let x = first; x < end; x += step) t.push(x);
    return {
      spanStart: start,
      span: sp,
      ticks: t,
      main: stages
        .filter((s) => s.type !== "restless")
        .sort((a, b) => a.startMs - b.startMs),
      restless: stages.filter((s) => s.type === "restless"),
    };
  }, [stages, startUtc, endUtc, offsetSec]);

  const x = (ms: number) => ((ms - spanStart) / span) * 100;
  const rowCenter = (t: SleepStageType) =>
    ROWS.indexOf(t as (typeof ROWS)[number]) * ROW_H + ROW_H / 2;

  const scrubMs = frac == null ? null : spanStart + frac * span;
  const active =
    scrubMs == null
      ? null
      : (main.find((s) => scrubMs >= s.startMs && scrubMs < s.endMs) ?? null);

  return (
    <div className="select-none">
      {/* readout */}
      <div className="h-5 mb-2 flex items-center justify-between">
        {scrubMs != null ? (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold tabular-nums">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: active ? STAGE_STYLE[active.type].color : "var(--fg-dim)",
              }}
            />
            {fmtClockMs(scrubMs, offsetSec)}
            <span style={{ color: "var(--fg-muted)" }}>
              {active ? STAGE_STYLE[active.type].label : "—"}
            </span>
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            Press and drag to read the night
          </span>
        )}
      </div>

      <div className="flex">
        {/* row labels */}
        <div className="shrink-0 pr-2" style={{ width: 46 }}>
          {ROWS.map((r) => (
            <div
              key={r}
              className="flex items-center text-[11px] font-semibold"
              style={{ height: ROW_H, color: STAGE_STYLE[r].top }}
            >
              {STAGE_STYLE[r].label}
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div
            ref={trackRef}
            // touch-none: with pan-y the browser stole the drag as soon as the
            // thumb drifted vertically and the scrub died mid-gesture.
            className="relative touch-none cursor-ew-resize"
            style={{ height: PLOT_H }}
            {...handlers}
          >
            {/* row guides */}
            {ROWS.map((r, i) => (
              <div
                key={r}
                className="absolute left-0 right-0"
                style={{
                  top: i * ROW_H + ROW_H / 2,
                  height: 1,
                  background: "var(--border)",
                  opacity: 0.6,
                }}
              />
            ))}
            {/* hour gridlines */}
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${x(t)}%`,
                  width: 1,
                  background: "var(--border)",
                  opacity: 0.5,
                }}
              />
            ))}

            {/* risers between consecutive stages */}
            {main.slice(1).map((s, i) => {
              const prev = main[i];
              if (prev.type === s.type) return null;
              const a = rowCenter(prev.type);
              const b = rowCenter(s.type);
              return (
                <div
                  key={`r${i}`}
                  className="absolute"
                  style={{
                    left: `${x(s.startMs)}%`,
                    top: Math.min(a, b),
                    height: Math.abs(a - b),
                    width: 1.5,
                    marginLeft: -0.75,
                    background: "rgba(255,255,255,0.22)",
                  }}
                />
              );
            })}

            {/* stage blocks */}
            {main.map((s, i) => {
              const st = STAGE_STYLE[s.type];
              const dim = active != null && active !== s;
              return (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: `${x(s.startMs)}%`,
                    width: `${x(s.endMs) - x(s.startMs)}%`,
                    minWidth: 2,
                    top: rowCenter(s.type) - BLOCK_H / 2,
                    height: BLOCK_H,
                    borderRadius: 4,
                    background: `linear-gradient(180deg, ${st.top} 0%, ${st.color} 100%)`,
                    opacity: dim ? 0.45 : 1,
                    transition: "opacity 120ms",
                  }}
                />
              );
            })}

            {/* scrub cursor */}
            {frac != null && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: `${frac * 100}%`,
                  width: 2,
                  marginLeft: -1,
                  background: "var(--fg)",
                  borderRadius: 1,
                }}
              />
            )}
          </div>

          {/* restlessness ticks, only when the device reports them */}
          {restless.length > 0 && (
            <div
              className="relative mt-2 rounded-full overflow-hidden"
              style={{ height: 6, background: "var(--bg-elevated)" }}
              aria-label="Restless moments"
            >
              {restless.map((s, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${x(s.startMs)}%`,
                    width: `${x(s.endMs) - x(s.startMs)}%`,
                    minWidth: 2,
                    background: STAGE_STYLE.restless.color,
                  }}
                />
              ))}
            </div>
          )}

          {/* time axis */}
          <div className="relative mt-1.5" style={{ height: 14 }}>
            {ticks.map((t) => {
              const p = x(t);
              if (p < 4 || p > 96) return null;
              return (
                <span
                  key={t}
                  className="absolute text-[11px] tabular-nums -translate-x-1/2"
                  style={{ left: `${p}%`, color: "var(--fg-muted)" }}
                >
                  {fmtClockMs(t, offsetSec, true)}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

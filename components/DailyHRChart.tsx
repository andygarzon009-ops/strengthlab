"use client";

import { useEffect, useMemo, useState } from "react";

type Sample = { t: string; bpm: number };
type Bucket = { startMin: number; min: number; max: number };

const BUCKET_MIN = 30;
const Y_MIN = 50;
const Y_MAX = 200;

export default function DailyHRChart({
  initial,
}: {
  initial: {
    connected: boolean;
    samples: Sample[];
    tz: string;
    dateKey: string;
  };
}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  // Re-poll every 60s so the chart stays roughly fresh on the user's
  // landing visit. Cheap because Google Health returns paged JSON.
  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/health/daily-hr", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setData(body);
      } catch {
        // ignore — keep last snapshot
      }
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const buckets = useMemo<Bucket[]>(() => {
    if (!data.samples?.length) return [];
    // Bucket samples by tz-local minute-of-day. Avoid creating Date objects
    // per sample — parse the ISO once and shift by tz offset using the same
    // technique as the server.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: data.tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const map = new Map<number, { min: number; max: number }>();
    for (const s of data.samples) {
      const d = new Date(s.t);
      const parts = fmt.formatToParts(d);
      const hh = Number(parts.find((p) => p.type === "hour")?.value);
      const mm = Number(parts.find((p) => p.type === "minute")?.value);
      const minuteOfDay = (hh === 24 ? 0 : hh) * 60 + mm;
      const startMin = Math.floor(minuteOfDay / BUCKET_MIN) * BUCKET_MIN;
      const cur = map.get(startMin);
      if (!cur) map.set(startMin, { min: s.bpm, max: s.bpm });
      else {
        if (s.bpm < cur.min) cur.min = s.bpm;
        if (s.bpm > cur.max) cur.max = s.bpm;
      }
    }
    return Array.from(map.entries())
      .map(([startMin, v]) => ({ startMin, min: v.min, max: v.max }))
      .sort((a, b) => a.startMin - b.startMin);
  }, [data]);

  const dayRange = useMemo(() => {
    if (!data.samples?.length) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const s of data.samples) {
      if (s.bpm < min) min = s.bpm;
      if (s.bpm > max) max = s.bpm;
    }
    return { min, max };
  }, [data]);

  const latest = data.samples?.length
    ? data.samples[data.samples.length - 1]
    : null;

  if (!data.connected) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <p style={{ color: "var(--fg-dim)" }}>
          Connect Fitbit on the Health page to see your heart rate.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        className="rounded-2xl p-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-baseline justify-between mb-1">
          <p
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: "var(--fg-dim)" }}
          >
            Range
          </p>
          {loading && (
            <span
              className="text-[10px]"
              style={{ color: "var(--fg-dim)" }}
            >
              updating…
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2 mb-2 tabular-nums">
          {dayRange ? (
            <>
              <span className="text-[28px] font-bold">
                {dayRange.min}–{dayRange.max}
              </span>
              <span
                className="text-[12px]"
                style={{ color: "var(--fg-dim)" }}
              >
                BPM
              </span>
            </>
          ) : (
            <span
              className="text-[14px]"
              style={{ color: "var(--fg-dim)" }}
            >
              No samples yet today
            </span>
          )}
        </div>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--fg-dim)" }}
        >
          Today
        </p>

        <ChartSvg buckets={buckets} />

        {latest && (
          <div
            className="mt-3 pt-3 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span
              className="text-[12px]"
              style={{ color: "var(--fg-dim)" }}
            >
              Latest:{" "}
              {new Date(latest.t).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <span className="text-[14px] font-bold tabular-nums">
              {latest.bpm} BPM
            </span>
          </div>
        )}
      </div>
      {/* placeholder to silence unused setLoading warning until we add
          range switching in Phase 2 */}
      <span className="hidden">{loading ? setLoading.length : 0}</span>
    </div>
  );
}

function ChartSvg({ buckets }: { buckets: Bucket[] }) {
  const W = 320;
  const H = 200;
  const padL = 8;
  const padR = 32;
  const padT = 8;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const minutesInDay = 24 * 60;

  const yFor = (bpm: number) => {
    const clamped = Math.max(Y_MIN, Math.min(Y_MAX, bpm));
    return padT + plotH * (1 - (clamped - Y_MIN) / (Y_MAX - Y_MIN));
  };

  const bucketWidth = (plotW / minutesInDay) * BUCKET_MIN - 1;
  const xFor = (startMin: number) =>
    padL + (startMin / minutesInDay) * plotW + 0.5;

  const yTicks = [50, 100, 150, 200];
  const xTicks = [0, 6 * 60, 12 * 60, 18 * 60, 24 * 60];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block" }}
      preserveAspectRatio="none"
    >
      {/* grid */}
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
          {y}
        </text>
      ))}

      {/* x labels */}
      {xTicks.map((m) => {
        const label =
          m === 0 ? "12 AM" : m === 12 * 60 ? "12 PM" : m === 24 * 60 ? "" : m < 12 * 60 ? `${m / 60}` : `${m / 60 - 12}`;
        return (
          <text
            key={`xl-${m}`}
            x={padL + (m / minutesInDay) * plotW}
            y={H - padB + 14}
            fontSize="9"
            fill="var(--fg-dim)"
            textAnchor="middle"
          >
            {label}
          </text>
        );
      })}

      {/* bars */}
      {buckets.map((b) => {
        const y1 = yFor(b.max);
        const y2 = yFor(b.min);
        const h = Math.max(2, y2 - y1);
        return (
          <rect
            key={b.startMin}
            x={xFor(b.startMin)}
            y={y1}
            width={Math.max(2, bucketWidth)}
            height={h}
            rx={1.5}
            fill="#ef4444"
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

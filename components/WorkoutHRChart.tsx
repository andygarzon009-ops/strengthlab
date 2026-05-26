"use client";

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

type Sample = { timestamp: string; bpm: number };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WorkoutHRChart({ samples }: { samples: Sample[] }) {
  if (samples.length === 0) return null;

  const bpms = samples.map((s) => s.bpm);
  const min = Math.min(...bpms);
  const max = Math.max(...bpms);
  const avg = Math.round(bpms.reduce((s, n) => s + n, 0) / bpms.length);

  // Pad the Y axis a few bpm above/below so bars aren't flush against the edges.
  const yMin = Math.max(0, min - 5);
  const yMax = max + 5;

  // X-axis tick labels: just the first, middle, and last sample times — keeps
  // the chart legible at mobile widths instead of a dense smear of timestamps.
  const data = samples.map((s) => ({
    time: s.timestamp,
    bpm: s.bpm,
  }));
  const firstTs = data[0].time;
  const midTs = data[Math.floor(data.length / 2)].time;
  const lastTs = data[data.length - 1].time;

  return (
    <section className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-semibold">Heart Rate</h2>
        <div className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          {samples.length} samples
        </div>
      </div>

      <div style={{ width: "100%", height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 28, bottom: 4, left: 0 }}>
            <YAxis
              domain={[yMin, yMax]}
              hide
            />
            <XAxis
              dataKey="time"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              ticks={[firstTs, midTs, lastTs]}
              tickFormatter={formatTime}
            />
            <Bar dataKey="bpm" fill="#ef4444" radius={[1, 1, 0, 0]} maxBarSize={6} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-end justify-between mt-2">
        <div>
          <div
            className="text-[11px] font-semibold tracking-wider uppercase"
            style={{ color: "#ef4444", letterSpacing: "0.08em" }}
          >
            {avg} BPM AVG
          </div>
        </div>
        <div className="text-right">
          <div className="text-[16px] font-bold tabular-nums leading-none">
            {max}
          </div>
          <div
            className="text-[12px] tabular-nums mt-0.5"
            style={{ color: "var(--fg-dim)" }}
          >
            {min}
          </div>
        </div>
      </div>
    </section>
  );
}

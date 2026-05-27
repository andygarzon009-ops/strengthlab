"use client";

import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

type Sample = { timestamp: string; bpm: number };
type SetMarker = { timestamp: string; label: string };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WorkoutHRChart({
  samples,
  setMarkers = [],
}: {
  samples: Sample[];
  setMarkers?: SetMarker[];
}) {
  if (samples.length === 0) return null;

  const bpms = samples.map((s) => s.bpm);
  const min = Math.min(...bpms);
  const max = Math.max(...bpms);
  const avg = Math.round(bpms.reduce((s, n) => s + n, 0) / bpms.length);
  const minIdx = bpms.indexOf(min);
  const maxIdx = bpms.indexOf(max);

  const yMin = Math.max(0, min - 10);
  const yMax = max + 10;

  const data = samples.map((s) => ({ time: s.timestamp, bpm: s.bpm }));

  const firstTs = data[0].time;
  const midTs = data[Math.floor(data.length / 2)].time;
  const lastTs = data[data.length - 1].time;

  // Y-axis ticks: keep only min and max — drawing avg as a separate tick
  // ended up overlapping the dashed "avg N" reference line label. Padded
  // values are rounded so the axis reads as 50/100/150 etc.
  const yTicks = [min, max];

  return (
    <section className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-semibold">Heart Rate</h2>
        <div className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          {samples.length} samples
        </div>
      </div>

      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 24, right: 16, bottom: 8, left: 0 }}>
            <defs>
              <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <YAxis
              domain={[yMin, yMax]}
              ticks={yTicks}
              tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              ticks={[firstTs, midTs, lastTs]}
              tickFormatter={formatTime}
              height={20}
            />
            <ReferenceLine
              y={avg}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="3 3"
            />
            <Area
              type="monotone"
              dataKey="bpm"
              stroke="#ef4444"
              strokeWidth={1.5}
              fill="url(#hrFill)"
              isAnimationActive={false}
              activeDot={false}
            />
            <ReferenceDot
              x={data[maxIdx].time}
              y={max}
              r={3.5}
              fill="#ef4444"
              stroke="var(--surface)"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{
                value: `${max}`,
                position: "top",
                offset: 8,
                fill: "#ef4444",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <ReferenceDot
              x={data[minIdx].time}
              y={min}
              r={3.5}
              fill="rgba(255,255,255,0.45)"
              stroke="var(--surface)"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{
                value: `${min}`,
                position: "bottom",
                offset: 8,
                fill: "rgba(255,255,255,0.75)",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            {setMarkers.map((m, i) => {
              const target = new Date(m.timestamp).getTime();
              let nearestIdx = 0;
              let nearestDiff = Infinity;
              for (let j = 0; j < data.length; j++) {
                const diff = Math.abs(new Date(data[j].time).getTime() - target);
                if (diff < nearestDiff) {
                  nearestDiff = diff;
                  nearestIdx = j;
                }
              }
              return (
                <ReferenceDot
                  key={`${m.timestamp}-${i}`}
                  x={data[nearestIdx].time}
                  y={data[nearestIdx].bpm}
                  r={3}
                  fill="#22c55e"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                  ifOverflow="extendDomain"
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-end justify-between mt-2">
        <div
          className="text-[11px] font-semibold tracking-wider uppercase"
          style={{ color: "#ef4444", letterSpacing: "0.08em" }}
        >
          {avg} BPM AVG
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
              MAX
            </div>
            <div className="text-[14px] font-bold tabular-nums">{max}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
              MIN
            </div>
            <div
              className="text-[14px] font-bold tabular-nums"
              style={{ color: "var(--fg-dim)" }}
            >
              {min}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

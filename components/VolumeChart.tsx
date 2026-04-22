"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type DataPoint = { date: string; volume: number; sets: number };

export default function VolumeChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: "#52525b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#52525b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,90,31,0.06)" }}
          contentStyle={{
            background: "#0a0a0a",
            border: "1px solid #1f1f1f",
            borderRadius: "10px",
            color: "#f5f5f5",
            fontSize: "12px",
            padding: "8px 10px",
          }}
          formatter={(value) => {
            const n = Number(value);
            return [
              `${n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n} lb`,
              "Volume",
            ];
          }}
          labelStyle={{ color: "#71717a", marginBottom: "4px" }}
        />
        <Bar dataKey="volume" fill="#ff5a1f" radius={[3, 3, 0, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

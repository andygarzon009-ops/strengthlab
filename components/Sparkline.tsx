// A bare trend line — no axes, no labels. The numbers next to it carry the
// meaning; this only shows direction. Plain (no "use client") so both server
// cards and the client workout card can render it.
export default function Sparkline({
  values,
  width = 96,
  height = 36,
  color,
  strokeWidth = 2,
  dot = false,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  color: string;
  strokeWidth?: number;
  /// Mark the latest point.
  dot?: boolean;
  label?: string;
}) {
  if (values.length < 2) return null;
  const pad = Math.max(strokeWidth, dot ? 4 : 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    // Flat series sits mid-height rather than on the floor.
    const y =
      max === min
        ? height / 2
        : pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const last = pts[pts.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? "Trend"}
      className="shrink-0"
    >
      <polyline
        points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot && <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} />}
    </svg>
  );
}

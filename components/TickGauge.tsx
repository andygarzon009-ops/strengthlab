// Tick-mark readiness gauge: a 270° arc of ticks filling red→amber→green up
// to the score, with a glowing knob at the value. Shared by the readiness page
// hero and the feed's Today card. No directive and no hooks, so it renders on
// the server or inside a client component alike; pass a unique `id` per page.

/// 0–100 → red (0) → amber (50) → green (100).
export function scaleColor(score: number, alpha = 1): string {
  const p = Math.max(0, Math.min(100, score));
  return `hsl(${Math.round((p / 100) * 130)} 78% 50% / ${alpha})`;
}

const SWEEP = 270; // degrees of arc, open at the bottom
const START = 135; // SVG degrees (0 = 3 o'clock, clockwise)

function polar(c: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  // Rounded: server and browser trig can differ in the last digits, and a
  // client component re-renders this SVG on hydration.
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { x: r2(c + r * Math.cos(a)), y: r2(c + r * Math.sin(a)) };
}

export default function TickGauge({
  score,
  size,
  id,
  ticks = 54,
  tint,
}: {
  score: number | null;
  size: number;
  id: string;
  ticks?: number;
  /// One colour for the whole fill instead of the red→green scale — for a
  /// value that's progress rather than a verdict.
  tint?: string;
}) {
  const k = size / 240; // geometry is drawn for 240 and scaled
  const c = size / 2;
  const s = score == null ? 0 : Math.max(0, Math.min(100, score));
  const filled = score == null ? 0 : Math.round((s / 100) * ticks);
  const knob = polar(c, 101 * k, START + (s / 100) * SWEEP);
  const color = score == null ? "#3f3f46" : (tint ?? scaleColor(s));
  const majorEvery = Math.round(ticks / 6);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block" aria-hidden>
      <defs>
        <radialGradient id={id} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="70%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      {score != null && <circle cx={c} cy={c} r={92 * k} fill={`url(#${id})`} />}
      {Array.from({ length: ticks }, (_, i) => {
        const deg = START + (i / (ticks - 1)) * SWEEP;
        const major = i % majorEvery === 0;
        const a = polar(c, (major ? 90 : 93) * k, deg);
        const b = polar(c, 110 * k, deg);
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={i < filled ? (tint ?? scaleColor((i / (ticks - 1)) * 100)) : "#26262b"}
            strokeWidth={Math.round(Math.max(1.6, (major ? 3.2 : 2.6) * Math.max(k, 0.62)) * 100) / 100}
            strokeLinecap="round"
          />
        );
      })}
      {score != null && (
        <circle
          cx={knob.x}
          cy={knob.y}
          r={Math.max(4, 7 * k)}
          fill="#fff"
          stroke={color}
          strokeWidth={Math.max(2, 3 * k)}
          style={{ filter: `drop-shadow(0 0 ${Math.max(3, 6 * k)}px ${color})` }}
        />
      )}
    </svg>
  );
}

import { BACK, FRONT, SILHOUETTE_HALF, type BodyShape } from "@/lib/bodyPaths";
import { heatColor, muscleHeat, type MuscleStat } from "@/lib/bodyScan";

// Per specific muscle: days since it was last trained, effective working
// sets in the last 7 days (half credit when it was a helper muscle), and how
// many days in a row it has been hit up to today. Missing = never trained.
export type MuscleLoad = Record<string, MuscleStat | undefined>;

/// The words under the map still need buckets: what's past its limit, and
/// what's gone untouched. The colour itself is continuous (lib/bodyScan).
export function muscleLevel(m: MuscleStat | undefined): "cold" | "over" | "ok" {
  if (!m || m.days >= 7) return "cold";
  if (m.sets > 20 || m.streak >= 3) return "over";
  return "ok";
}

const MIRROR = "translate(100,0) scale(-1,1)";
const SHADE_ID = "sl-muscle-shade";

// A drawn shape can stand for several muscles (the front delt cap carries
// side-delt work too); it shows the hottest of them.
function fillFor(m: BodyShape["m"], load: MuscleLoad): string {
  const names = Array.isArray(m) ? m : [m];
  return heatColor(Math.max(...names.map((n) => muscleHeat(load[n]))));
}

function Figure({
  shapes,
  load,
  label,
  width,
}: {
  shapes: BodyShape[];
  load: MuscleLoad;
  label: string;
  width: number;
}) {
  const half = (flip: boolean) => (
    <g transform={flip ? MIRROR : undefined}>
      {shapes.map((s, i) => (
        <g key={i}>
          <path
            d={s.d}
            fill={fillFor(s.m, load)}
            stroke="var(--bg-card)"
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
          {/* Light from above: each muscle reads as a rounded form. */}
          <path d={s.d} fill={`url(#${SHADE_ID})`} />
        </g>
      ))}
    </g>
  );
  return (
    <svg
      viewBox="0 0 100 200"
      width={width}
      height={width * 2}
      role="img"
      aria-label={label}
    >
      <path d={SILHOUETTE_HALF} fill="var(--bg-elevated)" />
      <path d={SILHOUETTE_HALF} transform={MIRROR} fill="var(--bg-elevated)" />
      {half(false)}
      {half(true)}
    </svg>
  );
}

export default function MuscleMap({
  load,
  width = 74,
}: {
  load: MuscleLoad;
  /// Width of each figure; height is double.
  width?: number;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Shared shading, defined once for both figures. */}
      <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
        <defs>
          <linearGradient id={SHADE_ID} x1="0.2" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.35" />
          </linearGradient>
        </defs>
      </svg>
      <Figure shapes={FRONT} load={load} label="Muscle scan, front" width={width} />
      <Figure shapes={BACK} load={load} label="Muscle scan, back" width={width} />
    </div>
  );
}

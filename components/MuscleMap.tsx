// Per specific muscle: days since it was last trained, effective working
// sets in the last 7 days (half credit when it was a helper muscle), and how
// many days in a row it has been hit up to today. Missing = never trained.
export type MuscleLoad = Record<
  string,
  { days: number; sets: number; streak: number } | undefined
>;

export type MuscleLevel = "cold" | "stale" | "fresh" | "built" | "peak" | "over";

/// Dim to bright as a muscle gets more recent work, then red past what it can
/// recover from. Set bands follow the hypertrophy spec's 10–20 weekly sets per
/// muscle: past 20, or three days running, is more than it can use.
export function muscleLevel(m: MuscleLoad[string]): MuscleLevel {
  if (!m || m.days >= 7) return "cold";
  if (m.sets > 20 || m.streak >= 3) return "over";
  if (m.days >= 4) return "stale";
  if (m.sets >= 13) return "peak";
  if (m.sets >= 6) return "built";
  return "fresh";
}

export const LEVELS: { level: MuscleLevel; label: string; color: string }[] = [
  { level: "cold", label: "Cold", color: "var(--bg-elevated)" },
  { level: "stale", label: "Stale", color: "rgba(96,165,250,0.55)" },
  { level: "fresh", label: "Fresh", color: "rgba(34,197,94,0.4)" },
  { level: "built", label: "Built", color: "rgba(34,197,94,0.8)" },
  { level: "peak", label: "Peak", color: "#a3e635" },
  { level: "over", label: "Overworked", color: "#ef4444" },
];

const COLOR: Record<MuscleLevel, string> = Object.fromEntries(
  LEVELS.map((l) => [l.level, l.color]),
) as Record<MuscleLevel, string>;
const RANK: Record<MuscleLevel, number> = Object.fromEntries(
  LEVELS.map((l, i) => [l.level, i]),
) as Record<MuscleLevel, number>;

// A drawn region can stand for more than one muscle (the front delt ellipse
// carries side delt work too); it shows the hottest of them.
const paint = (m: string | string[], r: MuscleLoad): string => {
  const names = Array.isArray(m) ? m : [m];
  let best: MuscleLevel = "cold";
  for (const n of names) {
    const lv = muscleLevel(r[n]);
    if (RANK[lv] > RANK[best]) best = lv;
  }
  return COLOR[best];
};

const OUTLINE = "var(--border)";
const stroke = 0.6;

function FrontBody({ r }: { r: MuscleLoad }) {
  // viewBox 60x120 — roughly 1:2 aspect ratio mirrors a human silhouette.
  return (
    <svg
      viewBox="0 0 60 120"
      width="64"
      height="128"
      style={{ overflow: "visible" }}
    >
      {/* Head */}
      <ellipse cx="30" cy="8" rx="5.5" ry="6.5" fill="var(--bg-elevated)" stroke={OUTLINE} strokeWidth={stroke} />
      {/* Neck */}
      <rect x="27.5" y="13.5" width="5" height="3" fill="var(--bg-elevated)" />

      {/* Traps (upper) */}
      <path
        d="M20 17 Q30 14 40 17 L38 20 Q30 18 22 20 Z"
        fill={paint("Traps", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Front delts */}
      <ellipse cx="19" cy="22" rx="4.5" ry="3.5" fill={paint(["Front Delts", "Side Delts"], r)} stroke={OUTLINE} strokeWidth={stroke} />
      <ellipse cx="41" cy="22" rx="4.5" ry="3.5" fill={paint(["Front Delts", "Side Delts"], r)} stroke={OUTLINE} strokeWidth={stroke} />

      {/* Pec major (L / R) */}
      <path
        d="M22 22 Q30 24 30 28 L30 33 Q25 35 22 33 Z"
        fill={paint("Pec Major", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />
      <path
        d="M38 22 Q30 24 30 28 L30 33 Q35 35 38 33 Z"
        fill={paint("Pec Major", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Biceps (L / R) — upper arm */}
      <ellipse cx="15" cy="30" rx="3.5" ry="6" fill={paint("Biceps", r)} stroke={OUTLINE} strokeWidth={stroke} />
      <ellipse cx="45" cy="30" rx="3.5" ry="6" fill={paint("Biceps", r)} stroke={OUTLINE} strokeWidth={stroke} />

      {/* Forearms */}
      <ellipse cx="13" cy="44" rx="3" ry="6" fill={paint("Forearms", r)} stroke={OUTLINE} strokeWidth={stroke} />
      <ellipse cx="47" cy="44" rx="3" ry="6" fill={paint("Forearms", r)} stroke={OUTLINE} strokeWidth={stroke} />

      {/* Abs — center column */}
      <rect
        x="27"
        y="34"
        width="6"
        height="18"
        rx="2"
        fill={paint("Abs", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Obliques (L / R) */}
      <path
        d="M22 35 L26 35 L26 52 L22 49 Z"
        fill={paint("Obliques", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />
      <path
        d="M38 35 L34 35 L34 52 L38 49 Z"
        fill={paint("Obliques", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Adductors (inner thigh) */}
      <path
        d="M27 56 L30 56 L30 74 L28 74 Z"
        fill={paint("Adductors", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />
      <path
        d="M33 56 L30 56 L30 74 L32 74 Z"
        fill={paint("Adductors", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Quads (L / R) */}
      <path
        d="M20 56 Q26 55 26 60 L26 80 Q23 82 20 80 Z"
        fill={paint("Quads", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />
      <path
        d="M40 56 Q34 55 34 60 L34 80 Q37 82 40 80 Z"
        fill={paint("Quads", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Tibialis (front calf strip) */}
      <rect x="21" y="86" width="4" height="22" rx="1.5" fill={paint("Tibialis", r)} stroke={OUTLINE} strokeWidth={stroke} />
      <rect x="35" y="86" width="4" height="22" rx="1.5" fill={paint("Tibialis", r)} stroke={OUTLINE} strokeWidth={stroke} />
    </svg>
  );
}

function BackBody({ r }: { r: MuscleLoad }) {
  return (
    <svg
      viewBox="0 0 60 120"
      width="64"
      height="128"
      style={{ overflow: "visible" }}
    >
      {/* Head (back) */}
      <ellipse cx="30" cy="8" rx="5.5" ry="6.5" fill="var(--bg-elevated)" stroke={OUTLINE} strokeWidth={stroke} />
      <rect x="27.5" y="13.5" width="5" height="3" fill="var(--bg-elevated)" />

      {/* Traps (upper + mid) */}
      <path
        d="M20 17 Q30 14 40 17 L40 27 Q30 29 20 27 Z"
        fill={paint("Traps", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Rear delts */}
      <ellipse cx="18" cy="22" rx="4.5" ry="3.5" fill={paint("Rear Delts", r)} stroke={OUTLINE} strokeWidth={stroke} />
      <ellipse cx="42" cy="22" rx="4.5" ry="3.5" fill={paint("Rear Delts", r)} stroke={OUTLINE} strokeWidth={stroke} />

      {/* Rhomboids (inner upper back) */}
      <rect
        x="26"
        y="27"
        width="8"
        height="6"
        rx="1"
        fill={paint("Rhomboids", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Lats (wide mid back) */}
      <path
        d="M22 27 Q20 35 22 44 L26 44 L26 30 Z"
        fill={paint("Lats", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />
      <path
        d="M38 27 Q40 35 38 44 L34 44 L34 30 Z"
        fill={paint("Lats", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Lower back */}
      <rect
        x="26"
        y="44"
        width="8"
        height="8"
        rx="1.5"
        fill={paint("Lower Back", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Triceps (back of upper arm) */}
      <ellipse cx="15" cy="30" rx="3.5" ry="6" fill={paint("Triceps", r)} stroke={OUTLINE} strokeWidth={stroke} />
      <ellipse cx="45" cy="30" rx="3.5" ry="6" fill={paint("Triceps", r)} stroke={OUTLINE} strokeWidth={stroke} />

      {/* Forearms back */}
      <ellipse cx="13" cy="44" rx="3" ry="6" fill={paint("Forearms", r)} stroke={OUTLINE} strokeWidth={stroke} />
      <ellipse cx="47" cy="44" rx="3" ry="6" fill={paint("Forearms", r)} stroke={OUTLINE} strokeWidth={stroke} />

      {/* Glutes */}
      <path
        d="M22 54 Q26 52 30 54 L30 62 Q26 64 22 62 Z"
        fill={paint("Glutes", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />
      <path
        d="M38 54 Q34 52 30 54 L30 62 Q34 64 38 62 Z"
        fill={paint("Glutes", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Hamstrings */}
      <path
        d="M20 64 Q26 63 26 68 L26 84 Q23 86 20 84 Z"
        fill={paint("Hamstrings", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />
      <path
        d="M40 64 Q34 63 34 68 L34 84 Q37 86 40 84 Z"
        fill={paint("Hamstrings", r)}
        stroke={OUTLINE}
        strokeWidth={stroke}
      />

      {/* Calves (gastroc) */}
      <ellipse cx="22.5" cy="96" rx="3" ry="9" fill={paint("Calves", r)} stroke={OUTLINE} strokeWidth={stroke} />
      <ellipse cx="37.5" cy="96" rx="3" ry="9" fill={paint("Calves", r)} stroke={OUTLINE} strokeWidth={stroke} />
    </svg>
  );
}

export default function MuscleMap({ load }: { load: MuscleLoad }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <FrontBody r={load} />
      <BackBody r={load} />
    </div>
  );
}

type State = "fresh" | "stale" | "cold";

// Specific muscle → days since last hit. Missing = never hit.
export type MuscleRecency = Record<string, number | undefined>;

function stateFor(days: number | undefined): State {
  if (days === undefined) return "cold";
  if (days <= 3) return "fresh";
  if (days <= 6) return "stale";
  return "cold";
}

function fill(state: State): string {
  if (state === "fresh") return "var(--accent)";
  if (state === "stale") return "rgba(234,179,8,0.55)";
  return "var(--bg-elevated)";
}

// Map a specific muscle to a fill color via the recency table.
const paint = (m: string, r: MuscleRecency): string =>
  fill(stateFor(r[m]));

const OUTLINE = "var(--border)";
const stroke = 0.6;

function FrontBody({ r }: { r: MuscleRecency }) {
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
      <ellipse cx="19" cy="22" rx="4.5" ry="3.5" fill={paint("Front Delts", r)} stroke={OUTLINE} strokeWidth={stroke} />
      <ellipse cx="41" cy="22" rx="4.5" ry="3.5" fill={paint("Front Delts", r)} stroke={OUTLINE} strokeWidth={stroke} />

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

function BackBody({ r }: { r: MuscleRecency }) {
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

export default function MuscleMap({ recency }: { recency: MuscleRecency }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <FrontBody r={recency} />
      <BackBody r={recency} />
    </div>
  );
}

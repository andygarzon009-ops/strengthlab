// Each meal's colour and glyph on Fuel: sun, bowl, moon, apple. No "use
// client" — it's plain SVG, so server and client components can both use it.

export const MEAL_TINT: Record<string, { ink: string; rgb: string; from: string; to: string }> = {
  BREAKFAST: { ink: "#fbbf24", rgb: "245,158,11", from: "#3a2a0c", to: "#22190a" },
  LUNCH: { ink: "#4ade80", rgb: "34,197,94", from: "#0f3a22", to: "#0a2216" },
  DINNER: { ink: "#c4b5fd", rgb: "167,139,250", from: "#2e2152", to: "#1a1430" },
  SNACK: { ink: "#f472b6", rgb: "244,114,182", from: "#3a0f2a", to: "#220a19" },
};

const tintOf = (meal: string) => MEAL_TINT[meal] ?? MEAL_TINT.SNACK;

function Glyph({ meal, size, color }: { meal: string; size: number; color: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (meal) {
    case "BREAKFAST":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case "LUNCH":
      return (
        <svg {...common}>
          <path d="M3 11h18a9 9 0 0 1-18 0Z" />
          <path d="M8 7c.8-1 .8-2.5 0-3.5M12 7c.8-1 .8-2.5 0-3.5M16 7c.8-1 .8-2.5 0-3.5" />
        </svg>
      );
    case "DINNER":
      return (
        <svg {...common}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 7c-2-2-6-1.5-7 2s1 10 4 11c1 .3 2-.3 3-.3s2 .6 3 .3c3-1 5-8 4-11s-5-4-7-2Z" />
          <path d="M12 7c0-2 1-3 3-4" />
        </svg>
      );
  }
}

/// The meal's glyph on its glowing tile.
export default function MealIcon({ meal, size = 40 }: { meal: string; size?: number }) {
  const t = tintOf(meal);
  return (
    <span
      className="shrink-0 flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.33,
        background: `linear-gradient(145deg, ${t.from}, ${t.to})`,
        border: `1px solid rgba(${t.rgb},0.4)`,
        boxShadow: `0 0 ${Math.round(size * 0.45)}px rgba(${t.rgb},${size > 44 ? 0.35 : 0.18})`,
      }}
    >
      <Glyph meal={meal} size={Math.round(size * 0.47)} color={t.ink} />
    </span>
  );
}

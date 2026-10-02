/// How fast each muscle recovers, and how much weekly work it can recover
/// from. The body scan turns red from these, not from one number for every
/// muscle.
///
/// `hours` — time to recover strength after a hard session (sets near
/// failure). What the research shows:
///  - Chest: pec peak torque stayed below baseline for 72 h and total work
///    for 96 h after 8 sets of bench to failure; triceps were back by ~48 h
///    (Ferreira et al., Muscle & Nerve 2017).
///  - Multi-joint lifts recover slower than single-joint ones; at 48 h only
///    70% of lifters had their bench and 60% their deadlift back, vs 80% for
///    the rest; upper vs lower body didn't differ by itself (Korak, Green &
///    O'Neal, Int J Exerc Sci 2015).
///  - Hamstrings take more damage than quads from the same eccentric work,
///    and elbow flexors/extensors more than either (Chen et al., Eur J Appl
///    Physiol 2011) — so biceps are not "tougher" than legs; they recover
///    faster in practice because they are trained with smaller doses.
///  - Slow-twitch-dominant muscle recovers far faster than fast-twitch
///    (Lievens et al., J Appl Physiol 2020) — calves (soleus) and the core.
///  - Muscle protein synthesis stays raised ~24–48 h after a session, the
///    usual basis for 48–72 h between hard sessions for one muscle.
///
/// `mrv` — weekly working sets past which recovery typically falls behind
/// (maximum recoverable volume). This is coaching guidance built on the
/// dose-response evidence (more sets → more growth, flattening past ~20),
/// not a measured constant — individuals vary a lot.
export type Recovery = { hours: number; mrv: number };

export const MUSCLE_RECOVERY: Record<string, Recovery> = {
  // Legs — big, multi-joint, heavily loaded
  Quads: { hours: 60, mrv: 20 },
  Hamstrings: { hours: 72, mrv: 18 },
  Glutes: { hours: 60, mrv: 16 },
  Adductors: { hours: 60, mrv: 16 },
  Calves: { hours: 36, mrv: 16 },
  Tibialis: { hours: 36, mrv: 16 },
  // Torso
  "Pec Major": { hours: 72, mrv: 22 },
  Lats: { hours: 60, mrv: 25 },
  Rhomboids: { hours: 48, mrv: 25 },
  Traps: { hours: 48, mrv: 26 },
  "Lower Back": { hours: 72, mrv: 12 },
  // Shoulders and arms
  "Front Delts": { hours: 48, mrv: 16 },
  "Side Delts": { hours: 48, mrv: 26 },
  "Rear Delts": { hours: 48, mrv: 26 },
  Biceps: { hours: 48, mrv: 20 },
  Triceps: { hours: 48, mrv: 18 },
  Forearms: { hours: 36, mrv: 20 },
  // Core — fatigue-resistant, light absolute loads
  Abs: { hours: 36, mrv: 25 },
  Obliques: { hours: 36, mrv: 25 },
};

const DEFAULT_RECOVERY: Recovery = { hours: 48, mrv: 20 };

/// Women fatigue less at the same relative load and recover faster between
/// sessions — a larger share of type I fibre and less muscle damage after
/// the same work (Hunter, Med Sci Sports Exerc 2014; Judge & Burke, J
/// Strength Cond Res 2010) — so they tolerate more weekly volume. A sixth
/// faster recovery and a fifth more sets than the table above.
const FEMALE_HOURS = 0.85;
const FEMALE_MRV = 1.2;

/// Glutes get their own number: female glute-focused programmes routinely
/// run 20–25+ direct sets a week, and the squats, RDLs and lunges around
/// them add half-sets on top — 16 painted a normal glute week red.
const FEMALE_OVERRIDES: Record<string, Recovery> = {
  Glutes: { hours: 48, mrv: 26 },
};

export function isFemale(sex: string | null | undefined): boolean {
  return (sex ?? "").trim().toUpperCase().startsWith("F");
}

export function recoveryFor(muscle: string, sex?: string | null): Recovery {
  const base = MUSCLE_RECOVERY[muscle] ?? DEFAULT_RECOVERY;
  if (!isFemale(sex)) return base;
  return (
    FEMALE_OVERRIDES[muscle] ?? {
      hours: Math.round(base.hours * FEMALE_HOURS),
      mrv: Math.round(base.mrv * FEMALE_MRV),
    }
  );
}

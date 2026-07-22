/// Goal-aware nutrition targets + a 0–100 daily "Fuel Score" for athletes.
///
/// Pure module (no IO) so the logic is easy to reason about and test. The score
/// answers "did I eat right *for my goal* today?" — not just "how much did I
/// eat." Protein is the heaviest lever (it's what protects muscle on a cut and
/// builds it on a bulk), so it carries half the score; the other half is how
/// well calories fit the phase's intended direction (deficit / surplus / hold).
///
/// Goal source is the athlete's profile `trainingPhase`
/// (CUT | BULK | MAINTAIN | RECOMP | PEAK). Targets are grounded in the ISSN
/// protein position stand (1.6–2.2 g/kg ≈ 0.7–1.0 g/lb for trained lifters,
/// pushed higher in a deficit to spare lean mass) — not invented numbers.

export type TrainingPhase = "CUT" | "BULK" | "MAINTAIN" | "RECOMP" | "PEAK";

export function normalizePhase(raw: string | null | undefined): TrainingPhase {
  const p = (raw ?? "").trim().toUpperCase();
  if (p === "CUT" || p === "BULK" || p === "MAINTAIN" || p === "RECOMP" || p === "PEAK")
    return p;
  // Unset / unknown → treat as maintenance so the score still works; callers
  // can surface a "set your phase for tailored targets" nudge separately.
  return "MAINTAIN";
}

const PHASE_LABEL: Record<TrainingPhase, string> = {
  CUT: "Cutting",
  BULK: "Lean Bulk",
  MAINTAIN: "Maintaining",
  RECOMP: "Recomp",
  PEAK: "Peaking",
};
export const phaseLabel = (p: TrainingPhase) => PHASE_LABEL[p];

/// Protein target in grams/day, from bodyweight and phase. g/lb chosen per
/// phase: highest on a cut (preserve muscle in a deficit), still high on a bulk.
export function proteinTargetG(phase: TrainingPhase, bodyweightLb: number): number {
  const perLb =
    phase === "CUT" ? 1.1 : phase === "RECOMP" ? 1.05 : phase === "BULK" ? 0.9 : 1.0;
  return Math.round(bodyweightLb * perLb);
}

/// Mifflin–St Jeor BMR (kcal/day). Falls back to per-sex average height and
/// age 30 when those profile fields are missing, so the estimate still runs.
export function estimateBmr(opts: {
  bodyweightLb: number;
  heightIn: number | null;
  age: number | null;
  sex: string | null;
}): number {
  const kg = opts.bodyweightLb * 0.453592;
  const female = (opts.sex ?? "").trim().toUpperCase().startsWith("F");
  const cm = (opts.heightIn ?? (female ? 64 : 70)) * 2.54;
  const age = opts.age ?? 30;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (female ? -161 : 5);
  return Math.round(bmr);
}

/// Maintenance (TDEE) ≈ BMR × baseline-NEAT factor + the day's *active* energy
/// burned (logged movement/exercise, layered on top). 1.2 covers resting + the
/// thermic effect of food + light non-exercise activity; active energy from
/// Google Health is the exercise on top. Approximate by design — good enough to
/// score against, and the score leans on protein anyway.
export function maintenanceKcal(bmr: number, activeEnergyKcal: number): number {
  return Math.round(bmr * 1.2 + Math.max(0, activeEnergyKcal));
}

/// Calorie target for the phase, relative to maintenance: a deficit on a cut,
/// a modest surplus on a bulk, at-maintenance otherwise.
export function calorieTargetKcal(phase: TrainingPhase, maintenance: number): number {
  const mult =
    phase === "CUT" ? 0.8 : phase === "BULK" ? 1.12 : 1.0; // recomp/maintain/peak ≈ hold
  return Math.round(maintenance * mult);
}

/// 1.0 inside [fullLow, fullHigh], ramping linearly to 0 at the zero bounds.
function bandScore(
  r: number,
  fullLow: number,
  fullHigh: number,
  zeroLow: number,
  zeroHigh: number,
): number {
  if (r >= fullLow && r <= fullHigh) return 1;
  if (r < fullLow) return Math.max(0, (r - zeroLow) / (fullLow - zeroLow));
  return Math.max(0, (zeroHigh - r) / (zeroHigh - fullHigh));
}

/// Calorie fit (0..1): rewards landing in the phase's intended direction.
/// On a cut, at/under target is good and overshooting is punished fast; on a
/// bulk it's mirrored; maintenance/recomp/peak want to sit near target.
function calorieFit(phase: TrainingPhase, intakeKcal: number, targetKcal: number): number {
  if (targetKcal <= 0) return 0;
  const r = intakeKcal / targetKcal;
  switch (phase) {
    case "CUT":
      // ideal 0.85–1.00 of the (already-reduced) target; severe under-eating
      // and going over both cost points, over faster.
      return bandScore(r, 0.85, 1.0, 0.6, 1.15);
    case "BULK":
      return bandScore(r, 1.0, 1.15, 0.8, 1.35);
    default:
      return bandScore(r, 0.95, 1.05, 0.75, 1.25);
  }
}

/// Carb and fat targets, derived rather than prescribed. Protein is set first
/// (it's the one target grounded in the literature), fat takes a percentage of
/// total calories, and carbs absorb whatever is left — so the three always
/// reconcile to the calorie target. Fat runs higher on a cut, where calories
/// are scarce and dietary fat does more for satiety and hormones; a bulk skews
/// the remainder toward carbs to fuel training volume.
export function fatPctOfCalories(phase: TrainingPhase): number {
  if (phase === "CUT") return 0.3;
  if (phase === "BULK") return 0.22;
  return 0.25; // maintain / recomp / peak
}

export function macroTargets(
  phase: TrainingPhase,
  calorieTargetKcal: number,
  proteinTargetG: number,
): { proteinG: number; carbsG: number; fatG: number } {
  const fatKcal = calorieTargetKcal * fatPctOfCalories(phase);
  const proteinKcal = proteinTargetG * 4;
  const carbKcal = Math.max(0, calorieTargetKcal - proteinKcal - fatKcal);
  return {
    proteinG: proteinTargetG,
    carbsG: Math.round(carbKcal / 4),
    fatG: Math.round(fatKcal / 9),
  };
}

export type FuelTargets = {
  phase: TrainingPhase;
  phaseLabel: string;
  proteinTargetG: number;
  carbTargetG: number;
  fatTargetG: number;
  calorieTargetKcal: number;
  maintenanceKcal: number;
  phaseSet: boolean; // false when the athlete hasn't picked a phase
};

export function fuelTargets(opts: {
  rawPhase: string | null | undefined;
  bodyweightLb: number;
  heightIn: number | null;
  age: number | null;
  sex: string | null;
  activeEnergyKcal: number;
}): FuelTargets {
  const phase = normalizePhase(opts.rawPhase);
  const bmr = estimateBmr(opts);
  const maint = maintenanceKcal(bmr, opts.activeEnergyKcal);
  const calTarget = calorieTargetKcal(phase, maint);
  const protein = proteinTargetG(phase, opts.bodyweightLb);
  const macros = macroTargets(phase, calTarget, protein);
  return {
    phase,
    phaseLabel: PHASE_LABEL[phase],
    proteinTargetG: protein,
    carbTargetG: macros.carbsG,
    fatTargetG: macros.fatG,
    calorieTargetKcal: calTarget,
    maintenanceKcal: maint,
    phaseSet: (opts.rawPhase ?? "").trim() !== "",
  };
}

export type FuelScore = {
  score: number; // 0–100
  rating: "on track" | "good" | "off target" | "needs work";
  proteinPct: number; // 0–100, capped
  caloriePct: number; // 0–100, fit to phase
  netKcal: number; // intake − maintenance (− = deficit, + = surplus)
  direction: string; // human note, e.g. "on a cut, in a deficit ✓"
};

export function fuelScore(opts: {
  targets: FuelTargets;
  intakeKcal: number;
  proteinG: number;
}): FuelScore {
  const { targets, intakeKcal, proteinG } = opts;
  const proteinFrac = Math.min(1, proteinG / Math.max(1, targets.proteinTargetG));
  const calFrac = calorieFit(targets.phase, intakeKcal, targets.calorieTargetKcal);
  const score = Math.round(proteinFrac * 50 + calFrac * 50);

  const rating: FuelScore["rating"] =
    score >= 85 ? "on track" : score >= 65 ? "good" : score >= 45 ? "off target" : "needs work";

  const netKcal = Math.round(intakeKcal - targets.maintenanceKcal);
  const over = intakeKcal > targets.calorieTargetKcal;
  let direction: string;
  switch (targets.phase) {
    case "CUT":
      direction = netKcal < 0 ? "in a deficit ✓" : "over — no deficit today";
      break;
    case "BULK":
      direction = intakeKcal >= targets.calorieTargetKcal ? "in a surplus ✓" : "under — short of surplus";
      break;
    default:
      direction = over ? "slightly over maintenance" : "near maintenance ✓";
  }

  return {
    score,
    rating,
    proteinPct: Math.round(proteinFrac * 100),
    caloriePct: Math.round(calFrac * 100),
    netKcal,
    direction,
  };
}

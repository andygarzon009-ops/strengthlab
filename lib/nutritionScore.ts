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

export type MaintenanceCalibration = {
  maintenanceKcal: number;
  avgIntakeKcal: number;
  lbPerWeek: number; // observed trend, + = gaining
  loggedDays: number;
  spanDays: number;
};

/// Fewer logged days than this and the average intake isn't trustworthy enough
/// to solve against — a handful of days is as likely to reflect which days got
/// logged as what was actually eaten.
export const MIN_DAYS_FOR_CALIBRATION = 10;

/// Least-squares slope of y over x. Used on the weight series rather than
/// first-minus-last, because day-to-day scale noise (water, food in transit)
/// dwarfs a real 0.45 lb/week trend — two endpoints would mostly measure noise.
function slope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/// Solves maintenance from what actually happened: energy balance says weight
/// change is intake minus expenditure, so expenditure is average intake minus
/// the energy the scale says was banked or spent.
///
///   maintenance = avg daily intake − (lb/day gained × 3500)
///
/// Returns null when there isn't enough data to trust — too few logged days,
/// too short a weight span, or a result so far from plausible that something
/// other than energy balance is going on (an unlogged week, a new scale).
export function observedMaintenance(opts: {
  intakeByDay: { date: string; kcal: number }[]; // logged days only
  weightByDay: { date: string; lb: number }[];
  minDays?: number;
}): MaintenanceCalibration | null {
  const minDays = opts.minDays ?? MIN_DAYS_FOR_CALIBRATION;
  const logged = opts.intakeByDay.filter((d) => d.kcal > 0);
  if (logged.length < minDays) return null;
  if (opts.weightByDay.length < 2) return null;

  const dayNum = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86_400_000;
  const weights = opts.weightByDay.map((w) => ({ x: dayNum(w.date), y: w.lb }));
  const spanDays =
    weights[weights.length - 1].x - weights[0].x;
  if (spanDays < 7) return null; // too short for a trend to outrun scale noise

  const lbPerDay = slope(weights);
  if (lbPerDay == null) return null;

  const avgIntakeKcal =
    logged.reduce((s, d) => s + d.kcal, 0) / logged.length;
  const maintenanceKcal = Math.round(avgIntakeKcal - lbPerDay * KCAL_PER_LB);

  // Sanity band. A real adult maintenance sits well inside this; anything
  // outside means the inputs are lying (gaps in logging, a bad scale reading).
  if (maintenanceKcal < 1200 || maintenanceKcal > 5000) return null;

  return {
    maintenanceKcal,
    avgIntakeKcal: Math.round(avgIntakeKcal),
    lbPerWeek: Math.round(lbPerDay * 7 * 100) / 100,
    loggedDays: logged.length,
    spanDays: Math.round(spanDays),
  };
}

/// Intended rate of bodyweight change per week, as a fraction of bodyweight.
/// Expressing the goal as a rate — rather than as an arbitrary multiple of
/// maintenance — means the target is falsifiable: if the scale isn't moving at
/// this rate, maintenance was wrong, and observedMaintenance corrects it.
/// −0.5%/wk on a cut is the standard ceiling before lean mass starts going with
/// the fat; +0.25%/wk is the lean-bulk rate that keeps fat gain minimal.
export const PHASE_RATE_PCT_PER_WEEK: Record<TrainingPhase, number> = {
  CUT: -0.005,
  BULK: 0.0025,
  RECOMP: 0,
  MAINTAIN: 0,
  PEAK: 0,
};

/// ~3,500 kcal per pound of bodyweight change — the standard energy-balance
/// approximation used to convert a target rate into a daily calorie offset.
const KCAL_PER_LB = 3500;

/// Calorie target: maintenance plus whatever daily surplus or deficit produces
/// the phase's intended rate of weight change for this athlete's bodyweight.
export function calorieTargetKcal(
  phase: TrainingPhase,
  maintenance: number,
  bodyweightLb: number,
): number {
  const lbPerWeek = PHASE_RATE_PCT_PER_WEEK[phase] * bodyweightLb;
  const dailyOffset = (lbPerWeek * KCAL_PER_LB) / 7;
  return Math.round(maintenance + dailyOffset);
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

/// Fat is set in grams per pound of bodyweight, not as a share of calories.
/// Grams are how fat intake is actually prescribed, and tying it to bodyweight
/// rather than to a moving calorie number means it self-adjusts: on a cut the
/// same 0.4 g/lb lands at a *higher* share of a smaller target, which is the
/// direction you want when calories are scarce and fat is doing work for
/// satiety and hormones.
export const FAT_G_PER_LB = 0.4;

/// Carb and fat targets, derived rather than prescribed. Protein first (the one
/// target grounded in the literature), then fat by bodyweight, and carbs absorb
/// whatever calories are left — so the three always reconcile to the calorie
/// target.
export function macroTargets(
  calorieTargetKcal: number,
  proteinTargetG: number,
  bodyweightLb: number,
): { proteinG: number; carbsG: number; fatG: number } {
  const fatG = Math.round(bodyweightLb * FAT_G_PER_LB);
  const carbKcal = Math.max(0, calorieTargetKcal - proteinTargetG * 4 - fatG * 9);
  return { proteinG: proteinTargetG, carbsG: Math.round(carbKcal / 4), fatG };
}

export type FuelTargets = {
  phase: TrainingPhase;
  phaseLabel: string;
  proteinTargetG: number;
  carbTargetG: number;
  fatTargetG: number;
  calorieTargetKcal: number;
  maintenanceKcal: number;
  /// Where maintenance came from: "observed" means it was solved from the
  /// athlete's own intake and weight trend, "estimated" means Mifflin–St Jeor.
  maintenanceSource: "observed" | "estimated";
  /// Intended weight change, lb/week — the goal the calorie target encodes.
  targetLbPerWeek: number;
  phaseSet: boolean; // false when the athlete hasn't picked a phase
};

export function fuelTargets(opts: {
  rawPhase: string | null | undefined;
  bodyweightLb: number;
  heightIn: number | null;
  age: number | null;
  sex: string | null;
  activeEnergyKcal: number;
  /// Maintenance solved from the athlete's own intake vs weight trend. When
  /// present it replaces the Mifflin estimate outright — measured beats modelled.
  observedMaintenanceKcal?: number | null;
}): FuelTargets {
  const phase = normalizePhase(opts.rawPhase);
  const observed = opts.observedMaintenanceKcal ?? null;
  const maint =
    observed ?? maintenanceKcal(estimateBmr(opts), opts.activeEnergyKcal);
  const calTarget = calorieTargetKcal(phase, maint, opts.bodyweightLb);
  const protein = proteinTargetG(phase, opts.bodyweightLb);
  const macros = macroTargets(calTarget, protein, opts.bodyweightLb);
  return {
    phase,
    phaseLabel: PHASE_LABEL[phase],
    proteinTargetG: protein,
    carbTargetG: macros.carbsG,
    fatTargetG: macros.fatG,
    calorieTargetKcal: calTarget,
    maintenanceKcal: maint,
    maintenanceSource: observed != null ? "observed" : "estimated",
    targetLbPerWeek:
      Math.round(PHASE_RATE_PCT_PER_WEEK[phase] * opts.bodyweightLb * 100) / 100,
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

/// How much of the athlete's eating day has passed, 0..1. fuelScore grades a
/// *finished* day, so applying it at 3pm reads as failure when nothing is wrong
/// — half the calories are simply still ahead. Scoring the day so far against a
/// proportionally smaller target answers the question people actually have
/// mid-day: "am I on pace?" Window is 7am–9pm; before breakfast we hold a small
/// floor so the first meal doesn't divide by ~zero and read as a wild surplus.
const EAT_START_H = 7;
const EAT_END_H = 21;

export function eatingDayProgress(localHour: number, localMinute = 0): number {
  const t = localHour + localMinute / 60;
  if (t <= EAT_START_H) return 0.08;
  if (t >= EAT_END_H) return 1;
  return (t - EAT_START_H) / (EAT_END_H - EAT_START_H);
}

/// The pace score for a day still in progress: identical to fuelScore, but
/// graded against the share of the day's targets that should be met by now.
/// netKcal and direction still describe the *whole* day, since those are
/// statements about the day's plan rather than about progress through it.
export function fuelScoreSoFar(opts: {
  targets: FuelTargets;
  intakeKcal: number;
  proteinG: number;
  progress: number; // 0..1 from eatingDayProgress
}): FuelScore {
  const { targets, intakeKcal, proteinG } = opts;
  const p = Math.max(0.05, Math.min(1, opts.progress));
  const pacedProtein = Math.max(1, targets.proteinTargetG * p);
  const pacedKcal = Math.max(1, targets.calorieTargetKcal * p);

  const proteinFrac = Math.min(1, proteinG / pacedProtein);

  // Three states, and only two of them are failures. Behind pace is graded on
  // the phase band against the smaller target. Ahead of pace but still inside
  // the day's allowance is simply front-loading — full credit, so logging more
  // food can never lower the score. Past the *full* day's target is a real
  // overshoot and is graded as one.
  const calFrac =
    intakeKcal <= pacedKcal
      ? calorieFit(targets.phase, intakeKcal, pacedKcal)
      : intakeKcal <= targets.calorieTargetKcal
        ? 1
        : calorieFit(targets.phase, intakeKcal, targets.calorieTargetKcal);

  const score = Math.round(proteinFrac * 50 + calFrac * 50);
  const rating: FuelScore["rating"] =
    score >= 85 ? "on track" : score >= 65 ? "good" : score >= 45 ? "off target" : "needs work";

  // netKcal and direction describe the whole day's plan, not progress through it.
  const full = fuelScore({ targets, intakeKcal, proteinG });
  return {
    score,
    rating,
    proteinPct: Math.round(proteinFrac * 100),
    caloriePct: Math.round(calFrac * 100),
    netKcal: full.netKcal,
    direction: full.direction,
  };
}

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

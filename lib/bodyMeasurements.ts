// Reading a set of tape measurements against an earlier one.
//
// A measurement on its own says nothing — 32 inches is neither good nor bad.
// The only useful statement is a comparison, so everything here is about
// turning two snapshots into sentences an athlete and the coach can act on.
//
// Units match what the database stores: lengths in inches, bodyweight in
// pounds, body fat in percent. The profile's cm switch is a display layer and
// never reaches this file.

export type MeasurementKey =
  | "bodyweight"
  | "neck"
  | "shoulders"
  | "chest"
  | "arm"
  | "forearm"
  | "waist"
  | "hips"
  | "thigh"
  | "calf"
  | "bodyFat";

export type MeasurementUnit = "in" | "lb" | "%";

/// A snapshot as it comes off a BodyMeasurement row (or the User row, which
/// carries the same fields). Height is deliberately absent from the comparison
/// keys — an adult's height doesn't change, and a correction to it isn't news.
export type Snapshot = Partial<Record<MeasurementKey, number | null>> & {
  takenAt?: Date | string | null;
};

export const MEASUREMENT_KEYS: MeasurementKey[] = [
  "bodyweight",
  "waist",
  "chest",
  "shoulders",
  "arm",
  "forearm",
  "neck",
  "hips",
  "thigh",
  "calf",
  "bodyFat",
];

export const MEASUREMENT_LABELS: Record<MeasurementKey, string> = {
  bodyweight: "Bodyweight",
  neck: "Neck",
  shoulders: "Shoulders",
  chest: "Chest",
  arm: "Arm",
  forearm: "Forearm",
  waist: "Waist",
  hips: "Hips",
  thigh: "Thigh",
  calf: "Calf",
  bodyFat: "Body fat",
};

export function unitFor(key: MeasurementKey): MeasurementUnit {
  if (key === "bodyweight") return "lb";
  if (key === "bodyFat") return "%";
  return "in";
}

// What counts as a real change rather than tape wobble. A cloth tape pulled by
// hand repeats to roughly a quarter inch, and bodyweight swings a couple of
// pounds across a day on water and food alone — so anything under these is
// noise and reporting it would teach the athlete to distrust the readout.
const NOISE_FLOOR: Record<MeasurementUnit, number> = {
  in: 0.25,
  lb: 1.5,
  "%": 0.5,
};

export type MeasurementDelta = {
  key: MeasurementKey;
  label: string;
  unit: MeasurementUnit;
  from: number;
  to: number;
  /// Signed change in the stored unit. Positive means the number went up,
  /// which is not the same as "better" — that depends on the field and on what
  /// the athlete is training for.
  delta: number;
};

const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/// Every field present in both snapshots that moved more than its noise floor,
/// ordered the way an athlete reads them: bodyweight and waist first, since
/// those two carry the interpretation, then the rest by size of change.
export function diffSnapshots(
  prev: Snapshot,
  next: Snapshot,
): MeasurementDelta[] {
  const out: MeasurementDelta[] = [];
  for (const key of MEASUREMENT_KEYS) {
    const from = num(prev[key]);
    const to = num(next[key]);
    if (from === null || to === null) continue;
    const delta = +(to - from).toFixed(2);
    const unit = unitFor(key);
    if (Math.abs(delta) < NOISE_FLOOR[unit]) continue;
    out.push({ key, label: MEASUREMENT_LABELS[key], unit, from, to, delta });
  }
  const rank = (k: MeasurementKey) =>
    k === "bodyweight" ? 0 : k === "waist" ? 1 : 2;
  return out.sort(
    (a, b) => rank(a.key) - rank(b.key) || Math.abs(b.delta) - Math.abs(a.delta),
  );
}

/// Did the tape move at all between these two readings?
export function hasChanged(prev: Snapshot, next: Snapshot): boolean {
  return diffSnapshots(prev, next).length > 0;
}

const signed = (n: number, digits = 1): string =>
  `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

/// How a caller wants lengths rendered. Pounds and percent are never
/// converted — only the tape has two units.
export type LengthDisplay = {
  convert: (inches: number) => number;
  label: string;
};

const INCHES: LengthDisplay = { convert: (v) => v, label: "in" };

/// One delta as text: "Waist −1.2 in", or "Waist −3.0 cm" for a caller showing
/// centimetres.
export function formatDelta(
  d: MeasurementDelta,
  lengths: LengthDisplay = INCHES,
): string {
  if (d.unit === "in") {
    const shown = lengths.convert(Math.abs(d.delta));
    return `${d.label} ${d.delta > 0 ? "+" : "−"}${shown.toFixed(1)} ${lengths.label}`;
  }
  if (d.unit === "lb") return `${d.label} ${signed(d.delta)} lb`;
  return `${d.label} ${signed(d.delta)}%`;
}

/// The reading a single number can't give you. Bodyweight alone can't tell
/// lean gain from fat gain, and a waist alone can't tell fat loss from losing
/// the muscle underneath it — but the pair separates every case, which is the
/// whole reason the waist is worth measuring next to the scale.
///
/// "Held" and "not measured" are different claims, so this takes the snapshots
/// rather than the deltas: a field missing from the diff either sat inside the
/// noise floor or was never recorded, and only the snapshots know which.
/// Returns null when there's nothing honest to say.
export function interpret(prev: Snapshot, next: Snapshot): string | null {
  const known = (k: MeasurementKey) =>
    num(prev[k]) !== null && num(next[k]) !== null;
  const deltas = diffSnapshots(prev, next);
  const moveOf = (k: MeasurementKey) => {
    if (!known(k)) return "unknown" as const;
    const d = deltas.find((x) => x.key === k);
    if (!d) return "held" as const;
    return d.delta > 0 ? ("up" as const) : ("down" as const);
  };

  const weight = moveOf("bodyweight");
  const waist = moveOf("waist");

  if (weight === "unknown" && waist === "unknown") return null;

  if (weight !== "unknown" && waist !== "unknown") {
    if (weight === "up" && waist === "up")
      return "Weight and waist both up — part of that gain is fat. Ease the surplus.";
    if (weight === "up" && waist === "down")
      return "Heavier with a smaller waist. That's recomposition — the surplus is landing where you want it.";
    if (weight === "up" && waist === "held")
      return "Weight up, waist holding. That's lean gain; keep the surplus where it is.";
    if (weight === "down" && waist === "down")
      return "Weight and waist coming down together — that's what a cut should look like.";
    if (weight === "down" && waist === "held")
      return "Lighter but the waist held. Check you're not giving back muscle — protein and hard sets.";
    if (weight === "down" && waist === "up")
      return "Weight down while the waist went up. One of those readings is off — worth measuring again.";
    if (weight === "held" && waist === "down")
      return "Waist down at a steady weight — you're recomposing.";
    if (weight === "held" && waist === "up")
      return "Waist up at a steady weight. Worth a look at the surplus.";
    return null; // both held
  }

  // Only the waist on file. Weaker, but a waist moving is still a real signal.
  if (waist === "down") return "Waist down — that's coming off your middle.";
  if (waist === "up") return "Waist up. Log your bodyweight too and this gets a lot more useful.";

  // Only bodyweight on file — nothing about composition can be claimed from it.
  return null;
}

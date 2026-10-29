// Rendering tape numbers for the /body pages. Storage is always inches; the
// profile's in/cm switch (localStorage "sl:measureUnit") only changes what's
// shown, so every conversion happens here at the last moment.

import { unitFor, type MeasurementKey, type MoveStatus } from "@/lib/bodyMeasurements";

export type LengthUnit = "in" | "cm";

export const MEASURE_UNIT_KEY = "sl:measureUnit";

const CM = 2.54;

const trim = (n: number, digits: number): string => {
  const s = n.toFixed(digits);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, ".0") : s;
};

export function shownUnit(key: MeasurementKey, lengths: LengthUnit): string {
  const u = unitFor(key);
  return u === "in" ? lengths : u;
}

/// A stored value in the unit the athlete reads.
export function toShown(key: MeasurementKey, v: number, lengths: LengthUnit): number {
  return unitFor(key) === "in" && lengths === "cm" ? v * CM : v;
}

export function fromShown(key: MeasurementKey, v: number, lengths: LengthUnit): number {
  return unitFor(key) === "in" && lengths === "cm" ? v / CM : v;
}

export function fmtValue(key: MeasurementKey, v: number, lengths: LengthUnit): string {
  const shown = toShown(key, v, lengths);
  return trim(shown, unitFor(key) === "in" && lengths === "in" ? 2 : 1);
}

/// "+0.5", "−1.25", "±0" — a real minus sign, so columns of deltas line up.
export function fmtDelta(key: MeasurementKey, d: number, lengths: LengthUnit): string {
  const shown = toShown(key, Math.abs(d), lengths);
  const digits = unitFor(key) === "in" && lengths === "in" ? 2 : 1;
  if (Number(shown.toFixed(digits)) === 0) return "±0";
  return `${d > 0 ? "+" : "−"}${trim(shown, digits)}`;
}

/// One nudge of the − / + buttons: a quarter inch is what a hand-pulled tape
/// can actually resolve; half a centimetre is the same in metric.
export function stepFor(key: MeasurementKey, lengths: LengthUnit): number {
  const u = unitFor(key);
  if (u === "lb") return 0.2;
  if (u === "%") return 0.1;
  return lengths === "cm" ? 0.5 / CM : 0.25;
}

export function stepLabel(key: MeasurementKey, lengths: LengthUnit): string {
  const u = unitFor(key);
  if (u === "lb") return "0.2";
  if (u === "%") return "0.1";
  return lengths === "cm" ? "0.5" : "¼";
}

export const STATUS_COLOR: Record<MoveStatus, string> = {
  good: "#22c55e",
  bad: "#f59e0b",
  held: "#71717a",
};

/// Brighter text shades of the same three, for numbers on dark cards.
export const STATUS_TEXT: Record<MoveStatus, string> = {
  good: "#4ade80",
  bad: "#fbbf24",
  held: "#a1a1aa",
};

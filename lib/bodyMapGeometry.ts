// Where the tape goes on the body-map figure. Coordinates are in the 100 × 200
// figure box of lib/bodyPaths (the viewer's left half, x ≤ 50, mirrored for
// the rest), measured off each silhouette at the height the tape sits.

import type { MeasurementKey } from "@/lib/bodyMeasurements";

export type TapeSpot = {
  key: MeasurementKey;
  /// Height of the tape line.
  y: number;
  /// Where the line starts and ends across the body.
  x1: number;
  x2: number;
  /// Which side its label sits on. Chosen so no two labels on a side collide.
  side: "l" | "r";
};

const MALE: TapeSpot[] = [
  { key: "shoulders", y: 33.5, x1: 16.8, x2: 83.2, side: "l" },
  { key: "chest", y: 44, x1: 29, x2: 71, side: "r" },
  { key: "arm", y: 56, x1: 18, x2: 27, side: "l" },
  { key: "forearm", y: 75, x1: 15, x2: 24, side: "l" },
  { key: "waist", y: 80, x1: 35, x2: 65, side: "r" },
  { key: "hips", y: 98, x1: 34, x2: 66, side: "r" },
  { key: "thigh", y: 118, x1: 51, x2: 67, side: "r" },
  { key: "calf", y: 165, x1: 35, x2: 46, side: "l" },
];

const FEMALE: TapeSpot[] = [
  { key: "shoulders", y: 34, x1: 23, x2: 77, side: "l" },
  { key: "chest", y: 44, x1: 31, x2: 69, side: "r" },
  { key: "arm", y: 56, x1: 22.5, x2: 31, side: "l" },
  { key: "forearm", y: 75, x1: 20, x2: 29, side: "l" },
  { key: "waist", y: 78, x1: 36.5, x2: 63.5, side: "r" },
  { key: "hips", y: 100, x1: 31, x2: 69, side: "r" },
  { key: "thigh", y: 118, x1: 51, x2: 68, side: "r" },
  { key: "calf", y: 165, x1: 36, x2: 46, side: "l" },
];

export function tapeSpots(sex: string | null | undefined): TapeSpot[] {
  return sex === "FEMALE" ? FEMALE : MALE;
}

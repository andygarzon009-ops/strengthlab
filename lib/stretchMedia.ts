// Real demonstration clips for the live stretch player.
//
// The drawn figures in lib/stretchPoses.ts cover every drill, but they're
// diagrams — they can't show you what a position actually looks like on a
// body. Where a genuine animated demonstration exists we play that instead,
// but ONLY during the live hold. The routine overview keeps the drawn figures:
// they recolor per modality, they're consistent across all 34 drills, and a
// grid of photo-real clips would fight the list layout.
//
// Every pairing below was checked by eye, frame by frame — name matching alone
// put a medicine-ball throw against "cat-cow" and paired several drills with
// *assisted* stretches that need a second person. Anything not in this map has
// no trustworthy match and falls back to its drawn figure, which is why this
// is a deliberately short list rather than a best-effort guess for all 34.
//
// Source: ExerciseGymGifsDB (github.com/JahelCuadrado/ExerciseGymGifsDB).
// Media is © Gym Visual, redistributed via that dataset — see
// public/stretch/NOTICE.txt. Converted to animated WebP (~5x smaller than the
// source GIFs; the whole set is under 1 MB).

import type { StretchPose } from "./stretchPoses";

// Pose slug → clip in public/stretch. Only poses with a verified match appear.
const MEDIA: Partial<Record<StretchPose, true>> = {
  "hamstring-hinge": true,
  "figure-4": true,
  "hip-flexor-lunge": true,
  "child-pose": true,
  "chest-doorway": true,
  "overhead-triceps": true,
  "neck-lateral": true,
  "calf-wall": true,
  butterfly: true,
  "supine-twist": true,
  "side-bend": true,
  "worlds-greatest": true,
  "deep-squat": true,
  "glute-bridge": true,
  "foamroll-quad": true,
  "foamroll-itband": true,
  "foamroll-back": true,
};

export const STRETCH_MEDIA_CREDIT = "Exercise animations © Gym Visual";

// The clip for a pose, or null when we only have the drawn figure. Callers
// should treat null as "render StretchFigure instead" rather than as an error.
export function stretchMediaSrc(pose: StretchPose | null | undefined): string | null {
  if (!pose || !MEDIA[pose]) return null;
  return `/stretch/${pose}.webp`;
}

// True when at least one item in a routine will play a real clip — used to
// decide whether the credit line is worth showing at all.
export function routineUsesMedia(poses: (StretchPose | null | undefined)[]): boolean {
  return poses.some((p) => !!p && !!MEDIA[p]);
}

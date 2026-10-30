"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { CHECK_IN_KEYS, type MeasurementKey } from "@/lib/bodyMeasurements";

// Wide enough for any adult, narrow enough to catch a slipped decimal
// (a 155 in waist, a 1.8 lb bodyweight) before it lands in the history.
const BOUNDS: Partial<Record<MeasurementKey, [number, number]>> = {
  bodyweight: [60, 700],
  bodyFat: [2, 70],
};
const TAPE_BOUNDS: [number, number] = [4, 90];

/// Save one guided check-in. Values are in the stored units (inches, pounds,
/// percent); a spot the athlete skipped is simply absent.
///
/// Unlike a profile save, a check-in always writes a history row — even when
/// nothing moved, "I measured on the 29th and it held" is itself the record.
/// Skipped spots stay null in that row rather than carrying the old number
/// forward, so the history never shows a reading nobody took. The User row
/// keeps the latest known value of each, which is what the coach reads.
export async function saveCheckIn(
  values: Partial<Record<MeasurementKey, number>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireAuth();

  const clean: Partial<Record<MeasurementKey, number>> = {};
  for (const key of CHECK_IN_KEYS) {
    const v = values[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const [lo, hi] = BOUNDS[key] ?? TAPE_BOUNDS;
    if (v < lo || v > hi) return { ok: false, error: `That ${key} looks off — check the number.` };
    clean[key] = Math.round(v * 100) / 100;
  }
  if (Object.keys(clean).length === 0) {
    return { ok: false, error: "Nothing to save yet." };
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: clean }),
    prisma.bodyMeasurement.create({ data: { userId, ...clean } }),
  ]);

  revalidatePath("/body");
  revalidatePath("/profile");
  return { ok: true };
}

/// Wipe the tape history: every check-in row, plus the current tape and
/// body-fat values on the User row. Bodyweight and height stay — they're
/// profile basics the rest of the app runs on, not check-in readings.
export async function clearBodyMeasurements(): Promise<void> {
  const userId = await requireAuth();
  await prisma.$transaction([
    prisma.bodyMeasurement.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        neck: null,
        shoulders: null,
        chest: null,
        arm: null,
        forearm: null,
        waist: null,
        hips: null,
        thigh: null,
        calf: null,
        bodyFat: null,
      },
    }),
  ]);
  revalidatePath("/body");
  revalidatePath("/profile");
}

import "server-only";
import { prisma } from "@/lib/db";
import {
  listRestingHeartRate,
  listHeartRateBetween,
  type HeartRateSample,
} from "@/lib/googleHealth";

function computeRestingFromSamples(samples: HeartRateSample[]): number | null {
  if (samples.length < 10) return null;
  const sorted = [...samples].sort((a, b) => a.bpm - b.bpm);
  // Average the lowest 10 readings — robust to a single low outlier and
  // tracks the watch's own resting algorithm reasonably well.
  const lowestTen = sorted.slice(0, 10);
  const avg = lowestTen.reduce((sum, s) => sum + s.bpm, 0) / lowestTen.length;
  return Math.round(avg);
}

/// Pull resting HR from Google Health and persist it on the user's
/// HealthAccount. Runs during SYNC (or post-response via `after`), never on the
/// feed render path. Fully non-throwing, and only overwrites the stored value
/// when it gets a real reading — so "last known" survives an empty sync.
export async function refreshRestingHr(userId: string): Promise<void> {
  try {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    let samples: Awaited<ReturnType<typeof listRestingHeartRate>> = [];
    try {
      samples = await listRestingHeartRate(
        userId,
        fourteenDaysAgo.toISOString(),
        now.toISOString(),
      );
    } catch {
      samples = [];
    }

    let restingNow: number | null = null;
    let restingDelta: number | null = null;
    let restingSource: "fitbit" | "computed" = "fitbit";

    if (samples.length > 0) {
      restingNow = samples[samples.length - 1].bpm;
      const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      const prior = samples.filter((s) => s.date.getTime() < cutoff);
      if (prior.length > 0) {
        const priorAvg =
          prior.reduce((sum, s) => sum + s.bpm, 0) / prior.length;
        restingDelta = restingNow - Math.round(priorAvg);
      }
    } else {
      try {
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const raw = await listHeartRateBetween(
          userId,
          dayAgo.toISOString(),
          now.toISOString(),
        );
        const computed = computeRestingFromSamples(raw);
        if (computed !== null) {
          restingNow = computed;
          restingSource = "computed";
        }
      } catch {
        // leave null
      }
    }

    // Don't clobber the last-known value with a null/empty sync.
    if (restingNow === null) return;

    await prisma.healthAccount.update({
      where: { userId },
      data: {
        restingHr: restingNow,
        restingDelta,
        restingSource,
        restingHrAt: now,
      },
    });
  } catch {
    // Sync is best-effort; never surface errors to the caller.
  }
}

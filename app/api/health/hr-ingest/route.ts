import { prisma } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/apiAuth";

type Sample = { bpm?: number; recordedAt?: string; sourceApp?: string };
type Body = { samples?: Sample[] };

const MAX_BATCH = 2000;

/// Ingests ambient heart-rate samples streamed from the StrengthLab Android app
/// (Health Connect). Auth via bearer token (see /api/auth/token). Idempotent:
/// duplicate (userId, timestamp) rows are skipped, so the device can safely
/// re-send overlapping windows.
export async function POST(req: Request) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.samples;
  if (!Array.isArray(raw) || raw.length === 0) {
    return Response.json({ error: "No samples" }, { status: 400 });
  }
  if (raw.length > MAX_BATCH) {
    return Response.json(
      { error: `Batch too large (max ${MAX_BATCH})` },
      { status: 413 },
    );
  }

  // Validate + normalize. Drop anything malformed rather than failing the batch.
  const seen = new Set<number>();
  const rows = raw
    .map((s) => {
      const bpm = Math.round(Number(s.bpm));
      const t = s.recordedAt ? new Date(s.recordedAt) : null;
      if (!t || Number.isNaN(t.getTime())) return null;
      if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) return null;
      return { timestamp: t, bpm, sourceApp: s.sourceApp ?? null };
    })
    .filter((r): r is { timestamp: Date; bpm: number; sourceApp: string | null } => {
      if (!r) return false;
      // De-dupe within the batch itself before hitting the DB.
      const key = r.timestamp.getTime();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (rows.length === 0) {
    return Response.json({ error: "No valid samples" }, { status: 400 });
  }

  // createMany + skipDuplicates relies on the @@unique([userId, timestamp])
  // index to drop samples already stored from an earlier overlapping sync.
  const result = await prisma.ambientHeartRateSample.createMany({
    data: rows.map((r) => ({
      userId,
      timestamp: r.timestamp,
      bpm: r.bpm,
      sourceApp: r.sourceApp,
    })),
    skipDuplicates: true,
  });

  return Response.json({ received: rows.length, inserted: result.count });
}

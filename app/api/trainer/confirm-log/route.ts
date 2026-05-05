import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/session";
import { appendLiveSets } from "@/lib/appendLiveSets";
import type { LiveParsedExercise, LiveParsedSet } from "@/lib/parseLiveLog";

// Commit sets the athlete reported in chat after they tap ✓ on the
// pending-log chip. The trainer stream sends back a parsed payload but
// does NOT log it; this endpoint is the only path that writes to the DB
// for chat-reported sets, so accidental "talking about a set" messages
// stay unlogged.
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = (await req.json()) as { parsed?: unknown };
    const sanitized = sanitize(body.parsed);
    if (sanitized.length === 0) {
      return Response.json({ error: "Nothing to log" }, { status: 400 });
    }
    const result = await appendLiveSets(userId, sanitized);
    if (!result) {
      return Response.json({ error: "Nothing to log" }, { status: 400 });
    }
    return Response.json(result);
  } catch (err) {
    console.error("confirm-log error:", err);
    const msg = err instanceof Error ? err.message : "Failed to log";
    return Response.json({ error: msg }, { status: 500 });
  }
}

function sanitize(raw: unknown): LiveParsedExercise[] {
  if (!Array.isArray(raw)) return [];
  const out: LiveParsedExercise[] = [];
  for (const ex of raw) {
    if (!ex || typeof ex !== "object") continue;
    const e = ex as Record<string, unknown>;
    const exerciseId = typeof e.exerciseId === "string" ? e.exerciseId : "";
    const exerciseName = typeof e.exerciseName === "string" ? e.exerciseName : "";
    if (!exerciseId || !exerciseName) continue;
    if (!Array.isArray(e.sets)) continue;
    const sets: LiveParsedSet[] = [];
    for (const s of e.sets) {
      if (!s || typeof s !== "object") continue;
      const sr = s as Record<string, unknown>;
      const type = sr.type === "WARMUP" ? "WARMUP" : "WORKING";
      const weight = typeof sr.weight === "string" ? sr.weight : "";
      const reps = typeof sr.reps === "string" ? sr.reps : "";
      const rir = typeof sr.rir === "string" ? sr.rir : "";
      if (!weight && !reps) continue;
      sets.push({ type, weight, reps, rir });
    }
    if (sets.length === 0) continue;
    out.push({ exerciseId, exerciseName, sets });
  }
  return out;
}

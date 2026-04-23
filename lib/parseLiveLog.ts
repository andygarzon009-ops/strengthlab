import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/db";
import { findExistingExerciseByName } from "@/lib/exerciseIdentity";

export type LiveParsedSet = {
  type: "WARMUP" | "WORKING";
  weight: string;
  reps: string;
  rir: string;
};

export type LiveParsedExercise = {
  exerciseId: string;
  exerciseName: string;
  sets: LiveParsedSet[];
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const PARSE_INSTRUCTIONS = `You convert a SINGLE chat message from an athlete into structured workout sets, ONLY if the message is reporting a set they actually did. Most messages are questions or chit-chat and should return an empty exercises array.

Return sets ONLY when the athlete is reporting completed work. Examples (all should produce sets):
- "just hit bench 225 for 5"                        → 1 set, Bench, 225×5
- "3 sets of squats at 315 for 5"                   → 3 identical sets, Squat, 315×5
- "finished pull-ups, 4 sets of 8"                  → 4 sets, Pull-Up, bodyweight ×8
- "leg press 4 plates a side, 10 reps"              → 1 set, Leg Press, weight=360
- "225×5, 235×3, 245×1 on bench"                    → 3 sets, Bench, different weights
- "bench 135 warmup 10, 185×5, 225×5×3"             → 1 warmup 135×10 + 1 working 185×5 + 3 working 225×5
- "bulgarian split squats, 45 lb DBs for 10 each side" → 1 set, Bulgarian Split Squat, 45×10 (the 10 is per side, that's the expected notation)
- "dumbbell curl drop set 50×10 then 40×8 then 30×8" → 3 working sets, DB Curl, different weights
- "L-sit 30 seconds, 3 sets"                         → 3 sets, L-Sit Hold, reps=30
- "just the bar for 10"                              → 1 set, weight=45, reps=10
- "pull-up with 45 for 3"                            → 1 set, Pull-Up, weight=45 (added), reps=3

Do NOT log when the athlete is:
- Asking a question ("what should I do next?", "what's my bench PR?")
- Asking for advice ("should I add weight?")
- Describing feelings without a set ("feeling tired today")
- Discussing plans ("planning to squat tomorrow", "thinking about hitting 225")
- Reporting effort without numbers ("that last set was brutal")

Rules:
- Weights in pounds. "Bar" / "empty bar" / "just the bar" = 45 lb.
- "Plates per side" on a barbell lift = 45 lb × plates × 2 + 45 bar. E.g. "bench 2 plates for 5" = 225, reps=5.
- "Plates per side" on a plate-loaded machine (no bar) = 45 × plates × 2. E.g. "leg press 4 plates a side" = 360.
- Use context to decide if a bar is involved.
- Bodyweight-capable lifts (pull-up, chin-up, push-up, dip, muscle-up, pistol squat, etc.): "weight" is ADDED load. Leave "" for clean bodyweight sets.
- Time holds (L-sit, plank, front lever, handstand, front lever): put held seconds in "reps", weight "".
- Each set is WORKING by default; mark WARMUP only when the athlete explicitly says warmup / ramp / working-up.
- Different weights across sets → emit each set individually. "225×5, 235×3, 245×1" = 3 sets with distinct weights.
- "Each side" / "per side" / "each leg" in unilateral work: reps given is the per-side rep count. Emit it as-is in reps (that's the convention).
- Numeric fields are strings of digits ("225", "5") or "" when unknown.

Sanity clamps (drop the set if violated — do NOT log garbage):
- reps between 1 and 200 (200+ is almost certainly a misparse).
- weight between 0 and 2000 lb.
- If you can only detect ONE of weight/reps for a lift that normally has both, still emit it — the user can correct.

Output ONLY minified JSON of the form:
{ "exercises": [ { "exerciseName": string, "sets": [ { "type": "WARMUP" | "WORKING", "weight": string, "reps": string, "rir": string } ] } ] }

If no sets reported, return: {"exercises":[]}`;

export async function parseLiveLog(
  message: string,
  context?: { role: string; content: string }[]
): Promise<LiveParsedExercise[]> {
  if (!process.env.GEMINI_API_KEY) return [];

  // Fast path: set reports always contain digits (weights, reps, or
  // set counts). Conversational messages without digits can skip the
  // parse call entirely, saving 500–2000ms per message.
  if (!/\d/.test(message)) return [];

  const exercises = await prisma.exercise.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const contextBlock =
    context && context.length > 0
      ? `RECENT CONVERSATION (oldest first — use ONLY to infer the exercise when the athlete mentions weight/reps without naming the lift; do NOT create sets from this context, only from MESSAGE):
${context
  .slice(-6)
  .map(
    (m) => `${m.role === "assistant" ? "Coach" : "Athlete"}: ${m.content.slice(0, 500)}`
  )
  .join("\n")}

`
      : "";

  const prompt = `${PARSE_INSTRUCTIONS}

Canonical exercise names (map spoken names to closest match; otherwise return the spoken name and a custom entry will be created):
${exercises.map((e) => `  - ${e.name}`).join("\n")}

${contextBlock}MESSAGE:
${message.trim()}

EXERCISE INFERENCE RULE:
- If MESSAGE reports numbers but does not name the lift (e.g. "just did 225 for 1", "got it for 5"), check the RECENT CONVERSATION above. If the coach or athlete was clearly discussing a specific lift in the last 1–2 turns, use that lift. Otherwise return empty — never guess wildly.

Output ONLY the JSON object. No prose, no code fences.`;

  const tryOnce = async (modelName: string) => {
    const m = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json" },
    });
    return m.generateContent(prompt);
  };

  let result;
  try {
    result = await tryOnce("gemini-2.5-flash-lite");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/503|overload|unavailable|quota/i.test(msg)) {
      result = await tryOnce("gemini-2.5-flash");
    } else {
      console.error("parseLiveLog error:", err);
      return [];
    }
  }

  let parsed: { exercises: { exerciseName: string; sets: LiveParsedSet[] }[] };
  try {
    parsed = JSON.parse(result.response.text().trim());
  } catch {
    return [];
  }

  const raw = parsed.exercises ?? [];
  if (raw.length === 0) return [];

  // Server-side safety clamps — even if the LLM ignores its instructions,
  // we never persist garbage like "1000×200" or "9999×1".
  const isPlausible = (s: LiveParsedSet) => {
    const w = s.weight ? parseFloat(s.weight) : 0;
    const r = s.reps ? parseInt(s.reps) : 0;
    if (!Number.isFinite(w) || !Number.isFinite(r)) return false;
    if (w < 0 || w > 2000) return false;
    if (r < 0 || r > 200) return false;
    return (r >= 1) || (w > 0 && r === 0);
  };

  const resolved: LiveParsedExercise[] = [];
  for (const ex of raw) {
    const name = ex.exerciseName?.trim();
    if (!name) continue;
    const sets = (ex.sets ?? [])
      .filter((s) => (s.reps && s.reps !== "") || (s.weight && s.weight !== ""))
      .filter(isPlausible);
    if (sets.length === 0) continue;

    let match = findExistingExerciseByName(name, exercises) ?? undefined;
    if (!match) {
      match = await prisma.exercise.create({
        data: { name, isCustom: true },
      });
    }
    resolved.push({
      exerciseId: match.id,
      exerciseName: match.name,
      sets: sets.map((s) => ({
        type: s.type === "WARMUP" ? "WARMUP" : "WORKING",
        weight: s.weight ?? "",
        reps: s.reps ?? "",
        rir: s.rir ?? "",
      })),
    });
  }
  return resolved;
}

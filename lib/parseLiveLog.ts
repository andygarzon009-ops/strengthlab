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

Return sets ONLY when the athlete is reporting completed work, e.g.:
- "just hit bench 225 for 5"
- "3 sets of squats at 315 for 5"
- "finished pull-ups, 4 sets of 8"
- "leg press 4 plates a side, 10 reps"
- "225×5, then 225×5, then 225×4 on bench"

Do NOT log when the athlete is:
- Asking a question ("what should I do next?")
- Asking for advice ("should I add weight?")
- Describing feelings without a set ("feeling tired today")
- Discussing plans ("planning to squat tomorrow")
- Asking about their data ("what's my bench PR?")

Rules:
- Weights in pounds. "Bar" = 45 lb. "Plates per side" = 45 lb each × 2 (+ 45 bar on barbell lifts). "2 plates on leg press" = 180 lb.
- Bodyweight-capable lifts (pull-up, chin-up, push-up, dip, muscle-up, pistol squat, etc.): weight is ADDED load. Leave "" for clean bodyweight sets.
- Time holds (L-sit, plank, front lever, handstand): put held seconds in "reps", weight "".
- Each set WORKING by default; mark WARMUP only if athlete explicitly says warmup.
- Numeric fields are strings of digits ("225", "5") or "" when unknown.
- "three sets of 225 for 5" → three identical sets.

Output ONLY minified JSON of the form:
{ "exercises": [ { "exerciseName": string, "sets": [ { "type": "WARMUP" | "WORKING", "weight": string, "reps": string, "rir": string } ] } ] }

If no sets reported, return: {"exercises":[]}`;

export async function parseLiveLog(message: string): Promise<LiveParsedExercise[]> {
  if (!process.env.GEMINI_API_KEY) return [];

  const exercises = await prisma.exercise.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const prompt = `${PARSE_INSTRUCTIONS}

Canonical exercise names (map spoken names to closest match; otherwise return the spoken name and a custom entry will be created):
${exercises.map((e) => `  - ${e.name}`).join("\n")}

MESSAGE:
${message.trim()}

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

  const resolved: LiveParsedExercise[] = [];
  for (const ex of raw) {
    const name = ex.exerciseName?.trim();
    if (!name) continue;
    const sets = (ex.sets ?? []).filter(
      (s) => (s.reps && s.reps !== "") || (s.weight && s.weight !== "")
    );
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

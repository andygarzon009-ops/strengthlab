import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";
import { WORKOUT_TYPES, STRENGTH_SPLITS } from "@/lib/exercises";
import { findExistingExerciseByName } from "@/lib/exerciseIdentity";

export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

type ParsedSet = {
  type: "WARMUP" | "WORKING";
  setNumber: number;
  weight: string;
  reps: string;
  rir: string;
  notes: string;
};

type ParsedExercise = {
  exerciseName: string;
  notes: string;
  sets: ParsedSet[];
};

type ParsedWorkout = {
  type: string;
  split: string | null;
  title: string;
  notes: string;
  feeling: string;
  exercises: ParsedExercise[];
  duration: number | null;
  distance: number | null;
  pace: string | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  rounds: number | null;
  elevation: number | null;
  rpe: number | null;
};

export async function POST(req: NextRequest) {
  await requireAuth();

  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "Voice parsing is not configured" },
      { status: 500 }
    );
  }

  const { transcript } = await req.json();
  if (typeof transcript !== "string" || !transcript.trim()) {
    return Response.json({ error: "Empty transcript" }, { status: 400 });
  }

  const exercises = await prisma.exercise.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const prompt = `You are converting a spoken workout log into structured JSON. The athlete speaks informally — interpret their words faithfully and emit ONE JSON object, nothing else.

Rules:
- "type" must be one of: ${WORKOUT_TYPES.map((t) => t.value).join(", ")}.
- If type === "WEIGHT_TRAINING", "split" must be one of: ${STRENGTH_SPLITS.map((s) => s.value).join(", ")} (or null if not stated).
- Weights are in pounds (lb). Distances are in kilometers (km). Durations are total seconds.
- Map spoken exercise names to the closest match from this canonical list if possible (otherwise return the spoken name exactly and the server will create a custom entry):
${exercises.map((e) => `  - ${e.name}`).join("\n")}
- Each set has type "WORKING" by default; mark "WARMUP" only if the athlete explicitly calls it a warmup.
- Numeric fields ("weight", "reps", "rir") must be strings of digits — e.g. "225", "5", "2". Use "" when unknown.
- If the athlete says "three sets of 225 for 5" emit three identical WORKING sets with weight="225", reps="5".
- "title" should be short (e.g. "Push Day", "Morning Run"); derive from content.
- For distance activities populate "distance" (number km) and "duration" (seconds).
- For duration/combat activities populate "duration" (seconds), optional "rounds", "rpe".
- Emit null for fields the athlete didn't mention — do NOT hallucinate.
- Output VALID minified JSON matching this TypeScript type:

{
  "type": "${WORKOUT_TYPES.map((t) => t.value).join('" | "')}",
  "split": ${STRENGTH_SPLITS.map((s) => `"${s.value}"`).join(" | ")} | null,
  "title": string,
  "notes": string,
  "feeling": "",
  "exercises": [
    {
      "exerciseName": string,
      "notes": string,
      "sets": [
        { "type": "WARMUP" | "WORKING", "setNumber": number, "weight": string, "reps": string, "rir": string, "notes": string }
      ]
    }
  ],
  "duration": number | null,
  "distance": number | null,
  "pace": string | null,
  "avgHeartRate": number | null,
  "maxHeartRate": number | null,
  "rounds": number | null,
  "elevation": number | null,
  "rpe": number | null
}

ATHLETE TRANSCRIPT:
${transcript.trim()}

Output ONLY the JSON object. No prose, no markdown, no code fences.`;

  const callModel = async (name: string) => {
    const m = genAI.getGenerativeModel({
      model: name,
      generationConfig: { responseMimeType: "application/json" },
    });
    return m.generateContent(prompt);
  };

  try {
    let result;
    try {
      result = await callModel("gemini-2.5-flash-lite");
    } catch (primaryErr) {
      const msg = primaryErr instanceof Error ? primaryErr.message : "";
      if (/503|overload|unavailable|quota/i.test(msg)) {
        result = await callModel("gemini-2.5-flash");
      } else {
        throw primaryErr;
      }
    }
    const text = result.response.text().trim();

    let parsed: ParsedWorkout;
    try {
      parsed = JSON.parse(text);
    } catch {
      // try stripping code fences
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      parsed = JSON.parse(cleaned);
    }

    // Resolve exercise names → ids (create custom entries only for
    // genuinely new lifts; fuzzy-match so misspellings don't create
    // parallel duplicates of the same lift).
    const resolvedExercises = await Promise.all(
      (parsed.exercises ?? []).map(async (ex) => {
        const name = ex.exerciseName?.trim();
        if (!name) return null;
        let match = findExistingExerciseByName(name, exercises) ?? undefined;
        if (!match) {
          match = await prisma.exercise.create({
            data: { name, isCustom: true },
          });
        }
        return {
          exerciseId: match.id,
          exerciseName: match.name,
          notes: ex.notes ?? "",
          sets: (ex.sets ?? []).map((s, i) => ({
            type: s.type === "WARMUP" ? ("WARMUP" as const) : ("WORKING" as const),
            setNumber: s.setNumber || i + 1,
            weight: String(s.weight ?? ""),
            reps: String(s.reps ?? ""),
            rir: String(s.rir ?? ""),
            notes: s.notes ?? "",
          })),
        };
      })
    );

    const validSplits = new Set(STRENGTH_SPLITS.map((s) => s.value));
    const normalizedSplit =
      parsed.split && validSplits.has(parsed.split) ? parsed.split : null;

    const draft = {
      id: "",
      title: parsed.title || "Voice-logged workout",
      type: parsed.type || "WEIGHT_TRAINING",
      split: normalizedSplit,
      date: new Date().toISOString(),
      notes: parsed.notes ?? "",
      feeling: parsed.feeling ?? "",
      isDeload: false,
      exercises: resolvedExercises.filter(
        (e): e is NonNullable<typeof e> => !!e
      ),
      duration: parsed.duration ?? null,
      distance: parsed.distance ?? null,
      pace: parsed.pace ?? null,
      avgHeartRate: parsed.avgHeartRate ?? null,
      maxHeartRate: parsed.maxHeartRate ?? null,
      rounds: parsed.rounds ?? null,
      elevation: parsed.elevation ?? null,
      rpe: parsed.rpe ?? null,
    };

    return Response.json({ draft });
  } catch (err) {
    console.error("Voice parse error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Parse failed" },
      { status: 500 }
    );
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { shapeForType } from "@/lib/exercises";

export const maxDuration = 60;

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Auto-analysis triggered when an athlete logs a workout that came from a
// coach-prescribed plan. Drops two TrainerMessages — a synthetic user line
// reporting the session and the coach's review — so the next time the
// athlete opens the trainer chat, the review is waiting for them.
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { workoutId } = (await req.json()) as { workoutId?: string };
    if (!workoutId) {
      return Response.json({ error: "workoutId required" }, { status: 400 });
    }

    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        exercises: {
          include: {
            exercise: true,
            sets: { orderBy: { setNumber: "asc" } },
          },
          orderBy: { order: "asc" },
        },
      },
    });
    if (!workout || workout.userId !== userId) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const formatSet = (s: {
      type: string;
      weight: number | null;
      reps: number | null;
      rir: number | null;
    }) => {
      const base = `${s.weight ?? 0}lb×${s.reps ?? 0}`;
      const rir = s.rir != null ? `@RIR${s.rir}` : "";
      return `${base}${rir}`;
    };

    const isStrength = shapeForType(workout.type) === "STRENGTH";
    const exerciseLines = workout.exercises
      .map((e) => {
        const warmups = e.sets.filter((s) => s.type === "WARMUP");
        const working = e.sets.filter((s) => (s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET"));
        const parts: string[] = [];
        if (warmups.length)
          parts.push(`warmup ${warmups.map(formatSet).join(", ")}`);
        if (working.length)
          parts.push(`working ${working.map(formatSet).join(", ")}`);
        return `• ${e.exercise.name}: ${parts.join(" | ")}`;
      })
      .join("\n");

    const userReport =
      `I just finished the workout you wrote me — "${workout.title}". Here's the log:\n\n` +
      (exerciseLines || "(no sets logged)") +
      (workout.feeling ? `\n\nFelt: ${workout.feeling}` : "") +
      (workout.notes?.trim() ? `\nNotes: ${workout.notes.trim()}` : "");

    const analysisInstruction = isStrength
      ? "Review this session like a coach reviewing game film. Quick judgment first (was it a strong session, fatigue-managed, on-target, or a regression). Then call out the standout sets, anything that beat their previous numbers, anything that came in under, and what to adjust next session. Be specific with the actual numbers above. Keep it tight — 4–8 short paragraphs or a few clean sections, no walls of text. Do NOT emit a workout-plan block — this is review, not prescription."
      : "Review this session as a coach. Quick judgment first, then the standout numbers, then what to adjust next time. Tight and specific.";

    const prompt = `${userReport}\n\n[Auto-analysis: ${analysisInstruction}]`;

    let reply = "";
    let usedModel = "";

    const tryGemini = async () => {
      if (!genAI) throw new Error("Gemini not configured");
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const r = await model.generateContent(prompt);
      const text = (r.response.text() ?? "").trim();
      if (!text) throw new Error("Empty Gemini reply");
      reply = text;
      usedModel = "gemini-2.5-flash";
    };

    const tryClaude = async () => {
      if (!anthropic) throw new Error("Anthropic not configured");
      const r = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const text = r.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("")
        .trim();
      if (!text) throw new Error("Empty Claude reply");
      reply = text;
      usedModel = "claude-haiku-4-5";
    };

    try {
      await tryGemini();
    } catch (err) {
      console.warn("analyze-workout Gemini failed:", err);
      await tryClaude();
    }

    if (!reply) {
      return Response.json({ error: "No reply" }, { status: 500 });
    }

    await prisma.trainerMessage.createMany({
      data: [
        { userId, role: "user", content: userReport },
        { userId, role: "assistant", content: reply },
      ],
    });

    return Response.json({ ok: true, model: usedModel });
  } catch (err) {
    console.error("analyze-workout error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

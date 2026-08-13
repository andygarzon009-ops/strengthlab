import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { shapeForType } from "@/lib/exercises";
import { ageFromBirthDate, estimateMaxHr } from "@/lib/hrZones";
import { readSetHeartRate, formatSetHr, type HrSample } from "@/lib/setHeartRate";

export const maxDuration = 60;

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/// Read this workout's HR trace, giving the in-flight /sync-hr call a short
/// grace period to land first. Only waits when there's reason to expect
/// samples — a connected health account and a timed session — so an athlete
/// without a watch pays nothing. Returns whatever exists when time is up.
async function waitForHeartRate(
  userId: string,
  workoutId: string,
  opts: { expected: boolean },
): Promise<HrSample[]> {
  const GRACE_MS = 15_000;
  const POLL_MS = 1_500;

  const read = () =>
    prisma.workoutHeartRateSample.findMany({
      where: { workoutId },
      select: { timestamp: true, bpm: true },
      orderBy: { timestamp: "asc" },
    });

  let samples = await read();
  if (samples.length > 0 || !opts.expected) return samples;

  const connected =
    (await prisma.healthAccount.count({ where: { userId } })) > 0;
  if (!connected) return samples;

  const deadline = Date.now() + GRACE_MS;
  while (samples.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    samples = await read();
  }
  return samples;
}

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

    // This route fires the instant the workout is saved, in parallel with the
    // /sync-hr call that pulls the session's heart rate from Google Health —
    // so the samples usually aren't in the DB yet. Give that sync a short head
    // start rather than reviewing the session blind, and only for athletes who
    // actually have a watch connected and a timed window to pull.
    const samples = await waitForHeartRate(userId, workout.id, {
      expected: workout.startedAt != null,
    });

    const maxHr = await (async () => {
      if (samples.length === 0) return 0;
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { birthDate: true },
      });
      const observed = samples.reduce((m, s) => Math.max(m, s.bpm), 0);
      return estimateMaxHr(ageFromBirthDate(owner?.birthDate), observed || null);
    })();

    // Every tick in the session, so a set's recovery window stops where the
    // next set begins — including when that next set is on another exercise.
    const ticks = workout.exercises
      .flatMap((e) => e.sets)
      .map((s) => s.loggedAt?.getTime())
      .filter((t): t is number => t != null)
      .sort((a, b) => a - b);

    const setHr = (loggedAt: Date | null): string => {
      if (!loggedAt || samples.length === 0) return "";
      const next = ticks.find((x) => x > loggedAt.getTime());
      return formatSetHr(
        readSetHeartRate(loggedAt, samples, maxHr, next ? new Date(next) : null),
      );
    };

    const formatSet = (
      s: {
        type: string;
        weight: number | null;
        reps: number | null;
        rir: number | null;
      },
      hr = "",
    ) => {
      const base = `${s.weight ?? 0}lb×${s.reps ?? 0}`;
      const rir = s.rir != null ? `@RIR${s.rir}` : "";
      return `${base}${rir}${hr}`;
    };

    const isStrength = shapeForType(workout.type) === "STRENGTH";
    const exerciseLines = workout.exercises
      .map((e) => {
        const warmups = e.sets.filter((s) => s.type === "WARMUP");
        const working = e.sets.filter((s) => (s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET"));
        const parts: string[] = [];
        if (warmups.length)
          parts.push(`warmup ${warmups.map((s) => formatSet(s)).join(", ")}`);
        if (working.length)
          parts.push(
            `working ${working
              .map((s) => formatSet(s, setHr(s.loggedAt)))
              .join(", ")}`,
          );
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

    // Only explain the notation when it's actually present in the log above.
    const hrLegend = samples.length
      ? ` Working sets carry the heart rate recorded during them: \`hr<peak>\` is the highest bpm in the window around that set, \`Z<n>\` its zone against an estimated max of ~${maxHr}bpm (Z4 = 80–90%, Z5 = 90%+), and \`-<n>/60s\` the beats shed in the minute after the peak, where the rest was long enough to measure it. Use it to judge how hard each set actually was, not just what was lifted: peaks climbing across sets at one load means fatigue was accumulating; a Z4/Z5 peak on a set they logged as easy means effort was under-reported or rest was short; a recovery drop under ~12bpm means they started the next set under-recovered. Name the one or two sets where the HR tells a different story than the numbers, and let it shape the adjustment you recommend. It lags the effort and moves with caffeine, heat and sleep — treat it as a signal beside load and RIR, never above them, and never assume an unannotated set was easy.`
      : "";

    const prompt = `${userReport}\n\n[Auto-analysis: ${analysisInstruction}${hrLegend}]`;

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

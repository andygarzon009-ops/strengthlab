import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { format, subDays, differenceInDays } from "date-fns";
import { NextRequest } from "next/server";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function GET() {
  const userId = await requireAuth();
  const messages = await prisma.trainerMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  return Response.json(messages);
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { message } = await req.json();

    if (!message?.trim()) return Response.json({ error: "Empty message" }, { status: 400 });

    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ error: "AI trainer not configured" }, { status: 500 });
    }

    const [user, workouts, prs, history] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.workout.findMany({
        where: { userId },
        include: {
          exercises: {
            include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { date: "desc" },
        take: 15,
      }),
      prisma.personalRecord.findMany({
        where: { userId, type: "WEIGHT" },
        include: { exercise: true },
        orderBy: { value: "desc" },
      }),
      prisma.trainerMessage.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
    ]);

    const recentWorkouts = workouts.slice(0, 8).map((w) => {
      const daysAgo = differenceInDays(new Date(), new Date(w.date));
      const workingSets = w.exercises.flatMap((e) =>
        e.sets.filter((s) => s.type === "WORKING")
      );
      const volume = workingSets.reduce(
        (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
        0
      );
      const exerciseSummary = w.exercises
        .map((e) => {
          const ws = e.sets.filter((s) => s.type === "WORKING");
          const topSet = ws.reduce(
            (best, s) => ((s.weight ?? 0) > (best.weight ?? 0) ? s : best),
            ws[0] ?? { weight: 0, reps: 0 }
          );
          return `${e.exercise.name}: ${ws.length} sets, top set ${topSet.weight}lbs×${topSet.reps}`;
        })
        .join("; ");
      return `- ${w.title} (${daysAgo === 0 ? "today" : `${daysAgo}d ago`}, ${format(new Date(w.date), "EEE MMM d")}): ${exerciseSummary}. Volume: ${Math.round(volume)}lbs`;
    });

    const topPRs = Object.values(
      prs.reduce((acc, pr) => {
        if (!acc[pr.exerciseId] || pr.value > acc[pr.exerciseId].value) {
          acc[pr.exerciseId] = pr;
        }
        return acc;
      }, {} as Record<string, (typeof prs)[0]>)
    )
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map((pr) => `${pr.exercise.name}: ${pr.value}lbs`)
      .join(", ");

    const thisWeek = workouts.filter(
      (w) => new Date(w.date) >= subDays(new Date(), 7)
    ).length;
    const thisMonth = workouts.filter(
      (w) => new Date(w.date) >= subDays(new Date(), 30)
    ).length;

    const lastWorkout = workouts[0];
    const daysSinceLast = lastWorkout
      ? differenceInDays(new Date(), new Date(lastWorkout.date))
      : null;

    const systemPrompt = `You are a personal strength coach for ${user?.name ?? "this athlete"}. You have full access to their training data and give specific, data-driven coaching advice.

ATHLETE PROFILE:
- Name: ${user?.name}
- Bodyweight: ${user?.bodyweight ? `${user.bodyweight}lbs` : "not set"}
- Goals: ${user?.goals ?? "not specified"}
- Preferred split: ${user?.preferredSplit ?? "not specified"}
- Total workouts logged: ${workouts.length}
- This week: ${thisWeek} workouts | This month: ${thisMonth} workouts
- Last trained: ${daysSinceLast === null ? "no workouts yet" : daysSinceLast === 0 ? "today" : `${daysSinceLast} days ago`}

RECENT WORKOUTS (most recent first):
${recentWorkouts.join("\n") || "No workouts logged yet."}

PERSONAL RECORDS (best weight lifted per exercise):
${topPRs || "No PRs yet."}

COACHING GUIDELINES:
- Reference their ACTUAL numbers — don't be generic
- For progressive overload: suggest adding 5lbs to upper body lifts and 10lbs to lower body lifts from their last session if they completed all reps cleanly, or same weight if they struggled
- If they haven't trained a muscle group in 5+ days, flag it
- If volume has been dropping, mention it
- If they've been training hard 5+ days straight, suggest recovery
- Keep responses concise and practical — max 3-4 paragraphs
- Use a motivating but honest coach tone
- When suggesting a workout, give specific exercises with specific target weights based on their history`;

    await prisma.trainerMessage.create({
      data: { userId, role: "user", content: message },
    });

    const geminiHistory = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-preview-04-17",
            systemInstruction: systemPrompt,
          });

          const chat = model.startChat({ history: geminiHistory });
          const result = await chat.sendMessageStream(message);

          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(text));
            }
          }

          await prisma.trainerMessage.create({
            data: { userId, role: "assistant", content: fullResponse },
          });

          controller.close();
        } catch (err) {
          console.error("Trainer stream error:", err);
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(`Sorry, I encountered an error: ${errMsg}`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Trainer API error:", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: errMsg }, { status: 500 });
  }
}

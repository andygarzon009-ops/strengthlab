import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";
import { format, subDays, differenceInDays } from "date-fns";
import { NextRequest } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  const userId = await requireAuth();
  const { message } = await req.json();

  if (!message?.trim()) return Response.json({ error: "Empty message" }, { status: 400 });

  // Fetch user context
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

  // Build workout context string
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
          (best, s) =>
            (s.weight ?? 0) > (best.weight ?? 0) ? s : best,
          ws[0] ?? { weight: 0, reps: 0 }
        );
        return `${e.exercise.name}: ${ws.length} sets, top set ${topSet.weight}lbs×${topSet.reps}`;
      })
      .join("; ");
    return `- ${w.title} (${daysAgo === 0 ? "today" : `${daysAgo}d ago`}, ${format(new Date(w.date), "EEE MMM d")}): ${exerciseSummary}. Volume: ${Math.round(volume)}lbs`;
  });

  // Best PRs per exercise
  const topPRs = Object.values(
    prs.reduce((acc, pr) => {
      if (!acc[pr.exerciseId] || pr.value > acc[pr.exerciseId].value) {
        acc[pr.exerciseId] = pr;
      }
      return acc;
    }, {} as Record<string, typeof prs[0]>)
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((pr) => `${pr.exercise.name}: ${pr.value}lbs`)
    .join(", ");

  // Training frequency
  const thisWeek = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 7)
  ).length;
  const thisMonth = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 30)
  ).length;

  // Days since last workout
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

  // Save user message
  await prisma.trainerMessage.create({
    data: { userId, role: "user", content: message },
  });

  // Build message history for Claude
  const chatHistory = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Stream response
  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            ...chatHistory,
            { role: "user", content: message },
          ],
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(encoder.encode(text));
          }
        }

        // Save assistant response
        await prisma.trainerMessage.create({
          data: { userId, role: "assistant", content: fullResponse },
        });

        controller.close();
      } catch (err) {
        console.error("Trainer API error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

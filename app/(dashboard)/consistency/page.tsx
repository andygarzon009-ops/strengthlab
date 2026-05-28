import Link from "next/link";
import { format, subDays, differenceInDays } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { shapeForType, labelForType } from "@/lib/exercises";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SessionForAnalysis = {
  title: string;
  type: string;
  split: string | null;
  isDeload: boolean;
  feeling: string | null;
  duration: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  exercises: {
    exercise: { name: string; muscleGroup: string | null };
    sets: { type: string }[];
  }[];
};

export default async function ConsistencyDetailPage() {
  const userId = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      timezone: true,
      trainingDays: true,
      preferredSplit: true,
      experienceLevel: true,
      primaryFocus: true,
    },
  });
  const tz = user?.timezone ?? "UTC";

  const sinceISO = subDays(new Date(), 7);
  const workouts = await prisma.workout.findMany({
    where: { userId, date: { gte: sinceISO } },
    include: {
      exercises: {
        include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { date: "asc" },
  });

  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  // 7-day grid (oldest → newest) so the LLM gets an accurate picture of
  // which days had sessions and which were gaps.
  const today = new Date();
  const grid: {
    dateKey: string;
    weekday: string;
    isToday: boolean;
    sessions: typeof workouts;
  }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = subDays(today, i);
    const k = dayKey(d);
    grid.push({
      dateKey: k,
      weekday: DAY_ABBR[d.getDay()],
      isToday: i === 0,
      sessions: workouts.filter((w) => dayKey(w.date) === k),
    });
  }

  const trainedDays = grid.filter((g) => g.sessions.length > 0).length;
  const goalDays = user?.trainingDays ?? null;

  const analysis = await generateAnalysis({
    name: user?.name ?? "Athlete",
    goalDays,
    experienceLevel: user?.experienceLevel ?? null,
    primaryFocus: user?.primaryFocus ?? null,
    preferredSplit: user?.preferredSplit ?? null,
    trainedDays,
    grid,
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
          aria-label="Back to feed"
        >
          ←
        </Link>
        <div>
          <h1 className="text-[22px] font-bold tracking-tight leading-none">
            Your rhythm
          </h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
            Last 7 days · {trainedDays}
            {goalDays ? ` / ${goalDays}` : ""} days trained
          </p>
        </div>
      </div>

      {/* 7-day strip for context */}
      <div
        className="rounded-2xl p-3 mb-4 flex justify-between items-end"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        {grid.map((g) => {
          const trained = g.sessions.length > 0;
          return (
            <div key={g.dateKey} className="flex flex-col items-center gap-1">
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{
                  color: g.isToday ? "var(--accent)" : "var(--fg-dim)",
                }}
              >
                {g.weekday}
              </span>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: trained
                    ? "var(--accent)"
                    : g.isToday
                      ? "var(--bg-elevated)"
                      : "transparent",
                  border: trained
                    ? "none"
                    : "1px solid var(--border)",
                  color: trained ? "#0a0a0a" : "var(--fg-dim)",
                }}
              >
                {trained ? g.sessions.length : ""}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="rounded-2xl p-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-wider font-semibold mb-3"
          style={{ color: "var(--fg-dim)" }}
        >
          Coach analysis
        </p>
        <div className="prose prose-invert prose-sm max-w-none rhythm-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
        </div>
      </div>

      <style>{`
        .rhythm-prose p { margin: 0 0 10px; line-height: 1.55; font-size: 13px; color: var(--fg); }
        .rhythm-prose strong { color: var(--fg); }
        .rhythm-prose ul { margin: 0 0 10px; padding-left: 18px; }
        .rhythm-prose li { font-size: 13px; line-height: 1.55; margin: 2px 0; color: var(--fg); }
        .rhythm-prose h2 { font-size: 13px; font-weight: 700; margin: 14px 0 6px; color: var(--fg); }
      `}</style>
    </div>
  );
}

async function generateAnalysis(args: {
  name: string;
  goalDays: number | null;
  experienceLevel: string | null;
  primaryFocus: string | null;
  preferredSplit: string | null;
  trainedDays: number;
  grid: {
    dateKey: string;
    weekday: string;
    isToday: boolean;
    sessions: SessionForAnalysis[];
  }[];
}): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return "_Coach analysis unavailable — GEMINI_API_KEY not configured._";
  }

  const sessionLines: string[] = [];
  for (const day of args.grid) {
    if (day.sessions.length === 0) {
      sessionLines.push(`- ${day.weekday} ${day.dateKey}: REST (no sessions)`);
      continue;
    }
    for (const s of day.sessions) {
      const shape = shapeForType(s.type);
      const typeLbl = labelForType(s.type);
      const muscles = new Set<string>();
      let workingSets = 0;
      let exerciseSummary = "";
      if (shape === "STRENGTH") {
        for (const e of s.exercises) {
          if (e.exercise.muscleGroup) muscles.add(e.exercise.muscleGroup);
          for (const set of e.sets) {
            if (set.type !== "WARMUP") workingSets++;
          }
        }
        const muscleList = Array.from(muscles).join(", ");
        exerciseSummary = ` — ${workingSets} working sets across ${muscleList || "n/a"}`;
      } else {
        const parts: string[] = [];
        if (s.duration) parts.push(`${Math.round(s.duration / 60)} min`);
        if (s.avgHeartRate) parts.push(`avg HR ${s.avgHeartRate}`);
        if (s.maxHeartRate) parts.push(`max HR ${s.maxHeartRate}`);
        exerciseSummary = ` — ${parts.join(" · ") || "logged"}`;
      }
      const tags: string[] = [];
      if (s.split) tags.push(s.split);
      if (s.isDeload) tags.push("DELOAD");
      if (s.feeling) tags.push(`felt:${s.feeling}`);
      const tagStr = tags.length ? ` {${tags.join(", ")}}` : "";
      sessionLines.push(
        `- ${day.weekday} ${day.dateKey}: [${typeLbl}]${tagStr} ${s.title}${exerciseSummary}`,
      );
    }
  }

  const profile = [
    args.experienceLevel ? `experience ${args.experienceLevel}` : null,
    args.primaryFocus ? `focus ${args.primaryFocus}` : null,
    args.preferredSplit ? `preferred split ${args.preferredSplit}` : null,
    args.goalDays ? `goal ${args.goalDays}× / week` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const today = format(new Date(), "EEE MMM d, yyyy");

  const prompt = `You are this athlete's strength coach analyzing their 7-day training rhythm. Be specific, kind, and direct — like a real coach reviewing the week's logs.

ATHLETE: ${args.name}
PROFILE: ${profile || "n/a"}
TODAY: ${today}
DAYS TRAINED THIS WEEK: ${args.trainedDays}${args.goalDays ? ` (goal ${args.goalDays})` : ""}

LAST 7 DAYS (oldest → newest):
${sessionLines.join("\n")}

Write 4 short sections in markdown, each on its own line(s). Use these EXACT headings:

## Rhythm
One short paragraph (2–3 sentences) on the overall cadence of the week. Are they hitting their frequency? Are sessions clumped or spread out? Any obvious recovery gaps or back-to-back hard days?

## Coverage
One short paragraph on what was trained vs. what was missed. Reference muscle groups or session types by name. Call out imbalances if there are any (e.g. "two push days, zero back" or "lots of strength, no zone-2").

## Momentum
One short paragraph on the trend — is this week stronger, equal, or weaker in volume/intensity than what a typical week should look like for them? Reference "felt:" tags if useful.

## Next 7 days
One short paragraph with a concrete suggestion. 1–2 specific calls (e.g. "lead Monday with the pull day you skipped; keep Thursday light to absorb this week's volume"). Do not prescribe a full workout — just shape the week.

Rules:
- ≤ 90 words per section.
- Use the athlete's first name once or twice; don't overdo it.
- Reference specific weekdays and session titles from the data above. Do not invent sessions.
- No emojis. No code blocks. No bullet lists unless absolutely necessary.
- If the data is sparse (e.g. only 1 session logged), acknowledge it and give the right next step instead of pretending you can analyze a full rhythm.`;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.6 },
    });
    const resp = await model.generateContent(prompt);
    const text = resp.response.text().trim();
    return text || "_Coach analysis returned empty. Pull-to-refresh to retry._";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `_Coach analysis unavailable: ${msg}_`;
  }
}

// `differenceInDays` is imported above but not used inline — keep the import
// to share the date-fns bundle with other server components.
void differenceInDays;

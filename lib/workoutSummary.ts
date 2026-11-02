// The coach's short take on a logged session, shown on the Today card once
// the day's training is done. One or two sentences, written once per session
// and stored on the workout so the feed never waits on a model twice.
import "server-only";
import { prisma } from "@/lib/db";
import { textToJson } from "@/lib/foodAi";
import { formatPlates } from "@/lib/exercises";

const MAX_LEN = 220;

/// The stored summary, or a fresh one written now. Null when the session has
/// no sets to talk about or every model failed.
export async function coachSummaryFor(workoutId: string, userId: string): Promise<string | null> {
  const w = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: {
      userId: true,
      title: true,
      duration: true,
      avgHeartRate: true,
      feeling: true,
      notes: true,
      coachSummary: true,
      blockName: true,
      blockWeek: true,
      isDeload: true,
      exercises: {
        orderBy: { order: "asc" },
        select: {
          exercise: { select: { name: true } },
          sets: {
            orderBy: { setNumber: "asc" },
            select: { type: true, weight: true, reps: true, rir: true },
          },
        },
      },
    },
  });
  if (!w || w.userId !== userId) return null;
  if (w.coachSummary) return w.coachSummary;

  const lines = w.exercises
    .map((e) => {
      const working = e.sets.filter((s) => s.type !== "WARMUP" && (s.reps ?? 0) > 0);
      if (working.length === 0) return null;
      const sets = working
        .map((s) => {
          const load = s.weight ? formatPlates(e.exercise.name, s.weight) || `${s.weight}lb` : "BW";
          return `${load}×${s.reps}${s.rir != null ? `@RIR${s.rir}` : ""}`;
        })
        .join(", ");
      return `• ${e.exercise.name}: ${sets}`;
    })
    .filter(Boolean);
  if (lines.length === 0) return null;

  const prs = await prisma.personalRecord.findMany({
    where: { workoutId, userId },
    select: { value: true, reps: true, exercise: { select: { name: true } } },
  });

  const facts = [
    `Session: "${w.title}"${w.isDeload ? " (deload)" : ""}${w.blockName ? `, ${w.blockName} week ${w.blockWeek ?? "?"}` : ""}`,
    w.duration ? `Duration: ${Math.round(w.duration / 60)} min` : null,
    w.avgHeartRate ? `Avg HR: ${w.avgHeartRate}` : null,
    prs.length
      ? `PRs today: ${prs.map((p) => `${p.exercise.name} ${p.value}lb×${p.reps ?? 1}`).join("; ")}`
      : "No PRs today",
    w.feeling ? `Felt: ${w.feeling}` : null,
    w.notes?.trim() ? `Notes: ${w.notes.trim()}` : null,
    "",
    ...lines,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const prompt =
    `You are this athlete's strength coach. They just finished today's session:\n\n${facts}\n\n` +
    `Write their home-screen recap: ONE or TWO short sentences, at most 30 words, second person. ` +
    `Lead with the verdict (strong, solid, grind, held back), then name the single standout lift with its numbers ` +
    `(a PR if there was one). Plain words, no emoji, no hashtags, no advice lists. ` +
    `Reply as JSON: {"summary": "..."}`;

  const out = await textToJson<{ summary?: string }>(prompt, "workout-summary");
  const summary = out?.summary?.trim().replace(/\s+/g, " ").slice(0, MAX_LEN);
  if (!summary) return null;

  await prisma.workout.update({ where: { id: workoutId }, data: { coachSummary: summary } });
  return summary;
}
